/**
 * AttendanceModule - 時間割・出欠管理ツール (Extended Advanced Version)
 * 
 * 機能:
 * - 単位数ベースの欠席管理（単位数 × 7/9/11警告）
 * - 授業（コマ）ごとの精密な欠席登録
 * - 週間時間割＋日々の変更を反映した正確な出欠確認
 * - 月別ロック機能＆高度なナビゲーション（前後6ヶ月ジャンプ、月直接指定）
 */

const AttendanceModule = {
    name: 'AttendanceModule',
    initialized: false,
    viewMode: 'classroom', // 'classroom' or 'teacher'


    // 出欠データ構造
    // { studentId: { "YYYY-MM-DD": { type: 'absent/late/early', periods: [1, 2], memo: '' } } }
    attendance: {},

    // ロックされた月 { "YYYY-MM": true }
    lockedMonths: {},

    /**
     * 初期化
     */
    init() {
        if (this.initialized) return;
        this.setupEventListeners();
        this.loadData();
        this.initialized = true;
        console.log('📊 AttendanceModule initialized (Extended)');
    },

    setupEventListeners() {
        // 既存のイベントリスナー
        const printBtn = document.getElementById('printAttendanceBtn');
        if (printBtn) {
            printBtn.addEventListener('click', () => this.printAttendance());
        }

        // モード切替
        const classroomBtn = document.getElementById('classroomModeBtn');
        const teacherBtn = document.getElementById('teacherModeBtn');

        if (classroomBtn && teacherBtn) {
            classroomBtn.addEventListener('click', () => {
                this.viewMode = 'classroom';
                classroomBtn.classList.add('active');
                teacherBtn.classList.remove('active');
                classroomBtn.style.background = 'white';
                teacherBtn.style.background = 'transparent';
                this.render();
            });

            teacherBtn.addEventListener('click', () => {
                this.viewMode = 'teacher';
                teacherBtn.classList.add('active');
                classroomBtn.classList.remove('active');
                teacherBtn.style.background = 'white';
                classroomBtn.style.background = 'transparent';
                this.render();
            });
        }
    },

    /**
     * 描画
     */
    render() {
        this.loadData();

        // 担任モードか授業担当モードかで表示を切り替え
        if (this.viewMode === 'teacher') {
            this.renderTeacherMode();
        } else {
            this.renderTimetable();
            this.renderAttendanceSummary();
        }
    },

    /**
     * 授業担当モードの描画
     */
    renderTeacherMode() {
        const ttContainer = document.getElementById('timetableGrid');
        const summaryContainer = document.getElementById('attendanceSummary');
        if (!ttContainer || !summaryContainer) return;

        // 1. 自分の時間割を表示
        const sm = window.ScheduleModule;
        if (sm) {
            sm.loadData?.(); // 最新データをロード
            const timetable = sm.myTimetable || {};
            const days = ['月', '火', '水', '木', '金'];
            const dayKeys = ['mon', 'tue', 'wed', 'thu', 'fri'];

            const settingsData = window.StorageManager?.getCurrentData() || {};
            // 最大時限数 (放課後を含めるため7固定とする)
            const maxPeriods = 7;

            let html = '<h4>自分の担当授業 (通常)</h4>';
            html += '<table class="timetable-table"><thead><tr><th></th>';
            days.forEach(d => html += `<th>${d}</th>`);
            html += '</tr></thead><tbody>';

            for (let p = 1; p <= maxPeriods; p++) {
                let periodLabel = (p === 7) ? '放課後' : `${p}限`;
                let fontSizeStyle = (p === 7) ? 'font-size:0.8em; word-break:keep-all;' : '';
                html += `<tr><th style="${fontSizeStyle}">${periodLabel}</th>`;
                dayKeys.forEach(d => {
                    html += `<td>${timetable[d]?.[p - 1] || ''}</td>`;
                });
                html += '</tr>';
            }
            html += '</tbody></table>';
            
            if (window.CoreDOM) {
                window.CoreDOM.updateDOMWithState(ttContainer, html);
            } else {
                ttContainer.innerHTML = html;
            }
        }

        // 2. 統計情報を表示 (期間指定付き)
        this.renderTeacherStatsHeader(summaryContainer);
        this.renderTeacherStatsResults();
    },

    /**
     * 授業担当統計のヘッダー（期間指定）を描画
     */
    renderTeacherStatsHeader(container) {
        // デフォルト期間: 設定された年度の4月1日～今日
        const now = new Date();
        const fiscalYear = getFiscalYear();
        const fiscalStart = new Date(fiscalYear, 3, 1); // 4月1日
        const startStr = this._formatDateForInput(fiscalStart);
        const endStr = this._formatDateForInput(now);

        let html = '<div class="teacher-stats-section">';
        html += '<h3>授業担当統計（期間指定）</h3>';
        html += `
            <div class="stats-controls" style="background: #f8fafc; padding: 15px; border-radius: 8px; border: 1px solid #e2e8f0; margin-bottom: 20px; display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
                <label style="font-size: 0.9em; font-weight: bold;">集計期間:</label>
                <input type="date" id="statsStartDate" class="form-control" value="${startStr}" style="padding: 5px 10px; border-radius: 4px; border: 1px solid #cbd5e1;">
                <span>〜</span>
                <input type="date" id="statsEndDate" class="form-control" value="${endStr}" style="padding: 5px 10px; border-radius: 4px; border: 1px solid #cbd5e1;">
                <button class="btn btn-primary" id="calculateStatsBtn" style="padding: 5px 15px;">集計実行</button>
            </div>
        `;
        html += '<div id="statsResultsArea"></div>';
        html += '</div>';

        if (window.CoreDOM) {
            window.CoreDOM.updateDOMWithState(container, html);
        } else {
            container.innerHTML = html;
        }

        // イベントリスナー
        const btn = document.getElementById('calculateStatsBtn');
        if (btn && !btn.dataset.bound) {
            btn.addEventListener('click', () => {
                this.renderTeacherStatsResults();
            });
            btn.dataset.bound = 'true';
        }
    },

    /**
     * 指定された期間の授業時数を集計して表示
     */
    renderTeacherStatsResults() {
        const startInput = document.getElementById('statsStartDate');
        const endInput = document.getElementById('statsEndDate');
        const resultsArea = document.getElementById('statsResultsArea');
        if (!startInput || !endInput || !resultsArea) return;

        const startDate = new Date(startInput.value);
        const endDate = new Date(endInput.value);

        if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
            resultsArea.innerHTML = '<p style="color: red;">正しい日付を入力してください。</p>';
            return;
        }

        if (startDate > endDate) {
            resultsArea.innerHTML = '<p style="color: red;">開始日は終了日より前の日付にしてください。</p>';
            return;
        }

        const stats = this.calculateTeacherTally(startDate, endDate);

        let html = '<div class="teacher-schedule-stats">';

        const sortedSubjects = Object.keys(stats.subjects).sort();
        sortedSubjects.forEach(sub => {
            html += `
                <div class="stat-card subject-stat-card" data-subject="${escapeHtml(sub)}"
                     style="cursor:pointer;" title="${escapeHtml(sub)}の授業一覧を表示">
                    <div class="stat-label">${escapeHtml(sub)}</div>
                    <div class="stat-value">${stats.subjects[sub]}</div>
                    <div class="stat-label">コマ</div>
                </div>
            `;
        });

        if (sortedSubjects.length === 0) {
            html += '<p style="grid-column: 1/-1; text-align: center; color: #64748b; padding: 20px;">指定された期間内に担当授業はありませんでした。</p>';
        }

        html += `
            <div class="stat-card" style="background: #f1f5f9; border-color: #3b82f6;">
                <div class="stat-label" style="color: #3b82f6; font-weight: bold;">総授業数</div>
                <div class="stat-value" style="color: #1e293b;">${stats.total}</div>
                <div class="stat-label">コマ</div>
            </div>
        `;

        html += '</div>';
        html += `<p style="font-size: 0.8em; color: #64748b; margin-top: 15px;">※集計基準: 「時間割一覧／変更（自分）」のデータを使用しています。</p>`;

        if (window.CoreDOM) {
            window.CoreDOM.updateDOMWithState(resultsArea, html);
        } else {
            resultsArea.innerHTML = html;
        }

        // カードクリックで授業一覧モーダルを開く
        const oldHandler = resultsArea._statClickHandler;
        if (oldHandler) resultsArea.removeEventListener('click', oldHandler);
        const statHandler = (e) => {
            const card = e.target.closest('.subject-stat-card');
            if (card) {
                const startVal = document.getElementById('statsStartDate')?.value;
                const endVal   = document.getElementById('statsEndDate')?.value;
                const startDate = startVal ? new Date(startVal) : null;
                const endDate   = endVal   ? new Date(endVal)   : null;
                this.openSubjectDetailModal(card.dataset.subject, 'my', startDate, endDate);
            }
        };
        resultsArea._statClickHandler = statHandler;
        resultsArea.addEventListener('click', statHandler);
    },

    /**
     * 期間内の授業コマ数を計算
     */
    calculateTeacherTally(startDate, endDate) {
        const sm = window.ScheduleModule;
        if (!sm) return { subjects: {}, total: 0 };

        const stats = { subjects: {}, total: 0 };
        const myTimetable = sm.myTimetable || {};
        const dailyChanges = sm.dailyChanges?.my || {};

        // 曜日ごとの時限数設定を取得
        const data = window.StorageManager?.getCurrentData() || {};
        const periodsPerDay = data.appSettings?.periodsPerDay || { mon: 6, tue: 6, wed: 6, thu: 6, fri: 6, sat: 0, sun: 0 };

        let curr = new Date(startDate);
        while (curr <= endDate) {
            const dateStr = this._formatDateForInput(curr);
            const dayKey = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][curr.getDay()];
            const periods = periodsPerDay[dayKey] || 0;

            if (periods > 0) {
                for (let p = 1; p <= periods; p++) {
                    let subject = '';

                    // 1. 個別の変更があるか確認 (0-based)
                    if (dailyChanges[dateStr] && dailyChanges[dateStr][p - 1] !== undefined) {
                        subject = dailyChanges[dateStr][p - 1];
                    } else {
                        // 2. 通常の時間割を確認
                        if (dayKey !== 'sun' && dayKey !== 'sat') {
                            subject = myTimetable[dayKey]?.[p - 1] || '';
                        }
                    }

                    if (subject && subject.trim()) {
                        const s = subject.trim();
                        stats.subjects[s] = (stats.subjects[s] || 0) + 1;
                        stats.total++;
                    }
                }
            }

            curr.setDate(curr.getDate() + 1);
        }

        return stats;
    },

    _formatDateForInput(date) {
        const y = date.getFullYear();
        const m = ('0' + (date.getMonth() + 1)).slice(-2);
        const d = ('0' + date.getDate()).slice(-2);
        return `${y}-${m}-${d}`;
    },

    /**
     * 時間割を参照用に表示
     */
    renderTimetable() {
        const container = document.getElementById('timetableGrid');
        if (!container) return;

        const sm = window.ScheduleModule;
        if (sm) {
            sm.loadData?.(); // 確実に最新を読み込む
            const timetable = sm.classTimetable || {};
            const days = ['月', '火', '水', '木', '金'];
            const dayKeys = ['mon', 'tue', 'wed', 'thu', 'fri'];

            const settingsData = window.StorageManager?.getCurrentData() || {};
            const periodsPerDay = settingsData.appSettings?.periodsPerDay || { mon: 6, tue: 6, wed: 6, thu: 6, fri: 6, sat: 0, sun: 0 };
            const maxPeriods = Math.max(...dayKeys.map(d => periodsPerDay[d] || 0), 1);

            let html = '<table class="timetable-table"><thead><tr><th></th>';
            days.forEach(d => html += `<th>${d}</th>`);
            html += '</tr></thead><tbody>';

            for (let p = 1; p <= maxPeriods; p++) {
                html += `<tr><th>${p}限</th>`;
                dayKeys.forEach(d => {
                    html += `<td>${timetable[d]?.[p - 1] || ''}</td>`;
                });
                html += '</tr>';
            }
            html += '</tbody></table>';
            
            if (window.CoreDOM) {
                window.CoreDOM.updateDOMWithState(container, html);
            } else {
                container.innerHTML = html;
            }
        }
    },

    /**
     * 出欠サマリー描画
     */
    // 生徒1人分の科目別欠席状況から、警告レベル情報を計算する
    _calculateStudentWarningInfo(absenceCounts, credits, subjectNames) {
        let worstLevel = 'ok'; // 'ok' | 'warn' | 'strong' | 'retention'
        const subjectRows = subjectNames.map(sub => {
            const count = absenceCounts[sub] || 0;
            const credit = credits[sub];
            const limitWarn = credit * 7;
            const limitStrong = credit * 9;
            const limitRetain = credit * 11;

            let level = 'ok';
            if (count > limitRetain) level = 'retention';
            else if (count > limitStrong) level = 'strong';
            else if (count > limitWarn) level = 'warn';

            const order = { ok: 0, warn: 1, strong: 2, retention: 3 };
            if (order[level] > order[worstLevel]) worstLevel = level;

            const remaining = limitRetain - count;
            const remainingText = remaining >= 0 ? `あと${remaining}` : '留年';

            return { sub, count, level, remainingText };
        });
        return { worstLevel, subjectRows };
    },

    renderAttendanceSummary() {
        const container = document.getElementById('attendanceSummary');
        if (!container) return;

        const data = window.StorageManager?.getCurrentData() || {};
        const students = data.students || [];

        const credits = this.calculateSubjectCredits();
        const subjectNames = Object.keys(credits).sort();

        const levelLabel = { ok: '順調', warn: '注意', strong: '要注意', retention: '留年基準超過' };
        const levelStyle = {
            ok: 'background:#f1f5f9; color:#475569;',
            warn: 'background:#fef9c3; color:#854d0e;',
            strong: 'background:#fee2e2; color:#b91c1c;',
            retention: 'background:#1e293b; color:#fff;'
        };

        let html = '<div class="attendance-accordion">';
        html += '<div style="margin-bottom: 12px; font-weight: bold;">生徒をクリックすると出欠状況の詳細が開きます（一度に1人だけ開きます）</div>';

        students.forEach(student => {
            const absenceCounts = this.calculateAbsenceCounts(student.id);
            const { worstLevel, subjectRows } = this._calculateStudentWarningInfo(absenceCounts, credits, subjectNames);

            html += `
                <div class="att-accordion-item" data-id="${escapeHtml(student.id)}">
                    <button type="button" class="att-accordion-header" data-id="${escapeHtml(student.id)}" aria-expanded="false">
                        <span class="att-acc-number">${escapeHtml(student.number)}</span>
                        <span class="att-acc-name">${escapeHtml(student.nameKanji)}</span>
                        <span class="att-acc-status" style="${levelStyle[worstLevel]}">${levelLabel[worstLevel]}</span>
                        <span class="att-acc-arrow">▶</span>
                    </button>
                    <div class="att-accordion-body" style="display:none;">
                        <table class="att-acc-subject-table">
                            <thead><tr><th>科目</th><th>単位</th><th>欠席数</th><th>残り</th></tr></thead>
                            <tbody>
                                ${subjectRows.map(r => `
                                    <tr class="att-acc-subject-row" data-subject="${escapeHtml(r.sub)}" title="クリックで授業一覧" style="${levelStyle[r.level]}">
                                        <td style="text-align:left;">${escapeHtml(r.sub)}</td>
                                        <td>${credits[r.sub]}</td>
                                        <td>${r.count}</td>
                                        <td>${r.remainingText}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                        <div class="att-acc-actions">
                            <button class="btn btn-primary btn-sm att-acc-input-btn" data-id="${escapeHtml(student.id)}">📝 出欠を入力する</button>
                        </div>
                    </div>
                </div>
            `;
        });

        if (students.length === 0) {
            html += '<div class="empty-state-small"><p>生徒名簿から生徒を登録してください</p></div>';
        }

        html += '</div>';

        if (window.CoreDOM) {
            window.CoreDOM.updateDOMWithState(container, html);
        } else {
            container.innerHTML = html;
        }

        // 毎回リスナーを付け直す（古いものを削除してから）
        const oldHandler = container._clickHandler;
        if (oldHandler) container.removeEventListener('click', oldHandler);

        const handler = (e) => {
            // 科目一覧を開く（アコーディオン内の科目行）
            const subjectRow = e.target.closest('.att-acc-subject-row');
            if (subjectRow) {
                this.openSubjectDetailModal(subjectRow.dataset.subject);
                return;
            }

            // 出欠入力モーダルを開く
            const inputBtn = e.target.closest('.att-acc-input-btn');
            if (inputBtn) {
                const data2 = window.StorageManager?.getCurrentData() || {};
                const student = (data2.students || []).find(s => s.id === inputBtn.dataset.id);
                if (student) this.openStudentAttendanceModal(student);
                return;
            }

            // アコーディオンの開閉（対象の生徒以外はすべて閉じる＝1人だけ開く）
            const header = e.target.closest('.att-accordion-header');
            if (header) {
                const targetId = header.dataset.id;
                container.querySelectorAll('.att-accordion-item').forEach(item => {
                    const body = item.querySelector('.att-accordion-body');
                    const h = item.querySelector('.att-accordion-header');
                    const arrow = item.querySelector('.att-acc-arrow');
                    const isTarget = item.dataset.id === targetId;
                    const isCurrentlyOpen = body.style.display !== 'none';

                    if (isTarget) {
                        // 対象は開閉トグル
                        const nextOpen = !isCurrentlyOpen;
                        body.style.display = nextOpen ? 'block' : 'none';
                        h.setAttribute('aria-expanded', String(nextOpen));
                        arrow.textContent = nextOpen ? '▼' : '▶';
                    } else {
                        // 対象以外はすべて閉じる（アコーディオンに収納）
                        body.style.display = 'none';
                        h.setAttribute('aria-expanded', 'false');
                        arrow.textContent = '▶';
                    }
                });
            }
        };
        container._clickHandler = handler;
        container.addEventListener('click', handler);
    },

    // timetableType: 'class'（生徒出欠サマリー用）または 'my'（授業担当統計用）
    // startDate/endDate: Date オブジェクト（省略時は年度始め〜今日）
    openSubjectDetailModal(subjectName, timetableType = 'class', startDate = null, endDate = null) {
        const sm = window.ScheduleModule;
        if (!sm) return;

        const dayKeys  = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
        const dayLabel = ['日', '月', '火', '水', '木', '金', '土'];

        const baseTimetable = timetableType === 'my' ? (sm.myTimetable || {}) : (sm.classTimetable || {});
        const dailyChanges  = timetableType === 'my' ? (sm.dailyChanges?.my || {}) : (sm.dailyChanges?.class || {});

        const today = new Date();
        const fiscalYear = getFiscalYear();
        const rangeStart = startDate || new Date(fiscalYear, 3, 1);
        const rangeEnd   = endDate   || today;
        // 時刻を切り捨てて日付のみで比較
        rangeStart.setHours(0, 0, 0, 0);
        rangeEnd.setHours(23, 59, 59, 999);

        const lessons = [];
        const cur = new Date(rangeStart);
        while (cur <= rangeEnd) {
            const dow = cur.getDay();
            const dayKey = dayKeys[dow];
            if (dow !== 0 && dow !== 6) {
                const dateStr = `${cur.getFullYear()}-${String(cur.getMonth()+1).padStart(2,'0')}-${String(cur.getDate()).padStart(2,'0')}`;
                const base = baseTimetable[dayKey] || [];
                const changes = dailyChanges[dateStr] || {};
                base.forEach((sub, idx) => {
                    const effective = changes[idx] !== undefined ? changes[idx] : sub;
                    if (effective === subjectName) {
                        lessons.push({ dateStr, dow, period: idx + 1 });
                    }
                });
            }
            cur.setDate(cur.getDate() + 1);
        }

        const rows = lessons.map(({ dateStr, dow, period }, i) => {
            const [y, m, d] = dateStr.split('-');
            const bg = i % 2 === 0 ? '' : 'background:#f8fafc;';
            return `<tr style="${bg}">
                <td style="padding:5px 10px; text-align:center; color:#64748b; font-size:0.85em;">${i + 1}</td>
                <td style="padding:5px 10px;">${parseInt(m)}/${parseInt(d)}</td>
                <td style="padding:5px 10px;">${dayLabel[dow]}曜日</td>
                <td style="padding:5px 10px; text-align:center;">${period}限</td>
            </tr>`;
        }).join('');

        const rangeLabel = `${rangeStart.getMonth()+1}/${rangeStart.getDate()} 〜 ${rangeEnd.getMonth()+1}/${rangeEnd.getDate()}`;

        const modal = document.createElement('div');
        modal.className = 'modal active';
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');
        modal.innerHTML = `
            <div class="modal-content" style="max-width:420px; max-height:80vh; display:flex; flex-direction:column;">
                <div class="modal-header">
                    <h3>${escapeHtml(subjectName)}（${lessons.length}コマ）</h3>
                    <button class="modal-close" aria-label="閉じる" id="closeSubjectModal">✕</button>
                </div>
                <div class="modal-body" style="overflow-y:auto; flex:1;">
                    <div style="font-size:0.8em; color:#94a3b8; margin-bottom:8px;">📅 ${rangeLabel}</div>
                    <table style="width:100%; border-collapse:collapse;">
                        <thead><tr style="border-bottom:2px solid #e2e8f0; background:#f1f5f9;">
                            <th style="padding:5px 10px; text-align:center; width:40px;">回数</th>
                            <th style="padding:5px 10px; text-align:left;">日付</th>
                            <th style="padding:5px 10px; text-align:left;">曜日</th>
                            <th style="padding:5px 10px; text-align:center;">時限</th>
                        </tr></thead>
                        <tbody>${rows || '<tr><td colspan="4" style="padding:12px; text-align:center; color:#94a3b8;">授業記録なし</td></tr>'}</tbody>
                    </table>
                </div>
            </div>`;

        document.body.appendChild(modal);
        modal.querySelector('#closeSubjectModal').addEventListener('click', () => modal.remove());
        modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
    },

    calculateSubjectCredits() {
        const sm = window.ScheduleModule;
        const timetable = sm ? sm.classTimetable : { mon: [], tue: [], wed: [], thu: [], fri: [] };
        const credits = {};

        Object.values(timetable).forEach(periods => {
            periods.forEach(sub => {
                if (sub) {
                    credits[sub] = (credits[sub] || 0) + 1;
                }
            });
        });
        return credits;
    },

    // dateStrが指定年度（4月始まり）に属するか判定
    _isDateInFiscalYear(dateStr, fiscalYear) {
        const [y, m] = dateStr.split('-').map(Number);
        const recordFiscalYear = m >= 4 ? y : y - 1;
        return recordFiscalYear === fiscalYear;
    },

    calculateAbsenceCounts(studentId) {
        const counts = {};
        const records = this.attendance[studentId] || {};
        const sm = window.ScheduleModule;

        if (!sm) return counts;

        const fiscalYear = getFiscalYear();

        Object.entries(records).forEach(([dateStr, record]) => {
            // 選択中の年度以外の記録は累計に含めない
            if (!this._isDateInFiscalYear(dateStr, fiscalYear)) return;

            const date = new Date(dateStr);
            const dayKey = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][date.getDay()];
            if (dayKey === 'sun' || dayKey === 'sat') return;

            const baseSchedule = sm.classTimetable[dayKey] || [];
            const changes = sm.dailyChanges?.class?.[dateStr] || {};

            record.periods.forEach(periodNum => {
                const periodIndex = periodNum - 1;
                let subject = changes[periodIndex] !== undefined ? changes[periodIndex] : baseSchedule[periodIndex];
                if (!subject && baseSchedule[periodIndex]) subject = baseSchedule[periodIndex];

                if (subject) {
                    counts[subject] = (counts[subject] || 0) + 1;
                }
            });
        });

        return counts;
    },

    /**
     * 生徒の出欠入力モーダルを開く
     */
    openStudentAttendanceModal(student) {
        const modal = document.createElement('div');
        modal.id = 'attendanceModal';
        modal.className = 'modal active';
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');

        const today = new Date();
        let currentYear = today.getFullYear();
        let currentMonth = today.getMonth();

        modal.innerHTML = `
            <div class="modal-content modal-large" style="max-width: 980px; width: 96vw;">
                <div class="modal-header">
                    <h3>${escapeHtml(student.number)} ${escapeHtml(student.nameKanji)} の出欠記録</h3>
                    <button class="modal-close" aria-label="閉じる" id="closeAttModal">✕</button>
                </div>
                <div class="modal-body">
                    <div class="calendar-controls">
                        <div class="calendar-nav-group">
                            <button class="btn btn-sm btn-secondary" id="jumpPrevBtn" title="6ヶ月前" aria-label="6ヶ月前">◀◀ 6ヶ月</button>
                            <button class="btn btn-sm" id="prevMonthBtn">◀ 前月</button>
                        </div>
                        <div class="calendar-nav-group">
                            <select id="monthJumpSelect" class="calendar-jump-select"></select>
                            <h4 id="calendarTitle" style="margin: 0; min-width: 120px; text-align: center;"></h4>
                        </div>
                        <div class="calendar-nav-group">
                            <button class="btn btn-sm" id="nextMonthBtn">次月 ▶</button>
                            <button class="btn btn-sm btn-secondary" id="jumpNextBtn" title="6ヶ月後" aria-label="6ヶ月後">6ヶ月 ▶▶</button>
                        </div>
                        <label class="calendar-lock-toggle" id="lockMonthLabel">
                            <input type="checkbox" id="lockMonthCheck"> 月ロック
                        </label>
                        <button class="btn btn-sm btn-secondary" id="openAbsenceListBtn" style="margin-left:auto;">📋 欠席一覧をすべて見る</button>
                    </div>
                    <div id="attendanceCalendar" class="attendance-table-wrap">
                        <!-- 日付×時限の一覧表を描画 -->
                    </div>
                    <div style="font-size: 0.9em; color: #666; text-align: right;">
                        ※欠席したコマをクリックすると連続して確定できます（ロック中は編集不可）
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        const monthSelect = modal.querySelector('#monthJumpSelect');
        const updateMonthSelect = () => {
            monthSelect.innerHTML = '';
            // 直近2年分くらいを表示
            for (let i = -12; i <= 12; i++) {
                const d = new Date(today.getFullYear(), today.getMonth() + i, 1);
                const opt = document.createElement('option');
                opt.value = `${d.getFullYear()}-${d.getMonth()}`;
                opt.textContent = `${d.getFullYear()}年${d.getMonth() + 1}月`;
                if (d.getFullYear() === currentYear && d.getMonth() === currentMonth) {
                    opt.selected = true;
                }
                monthSelect.appendChild(opt);
            }
        };

        const renderCalendar = () => {
            // modal.querySelector でスコープを絞り、グローバルID衝突を防ぐ
            const container = modal.querySelector('#attendanceCalendar');
            const title = modal.querySelector('#calendarTitle');
            const lockCheck = modal.querySelector('#lockMonthCheck');
            const lockLabel = modal.querySelector('#lockMonthLabel');
            if (!container || !title) return;

            const monthKey = `${currentYear}-${currentMonth}`;
            const isLocked = !!this.lockedMonths[monthKey];

            title.textContent = `${currentYear}年 ${currentMonth + 1}月`;
            lockCheck.checked = isLocked;
            lockLabel.classList.toggle('active', isLocked);

            container.innerHTML = this._renderAttendanceTableHtml(student, currentYear, currentMonth, isLocked);
            this._bindAttendanceTableEvents(container, student, currentYear, currentMonth, isLocked, renderCalendar);
            updateMonthSelect();
        };

        renderCalendar();

        // document.getElementById ではなく modal.querySelector でスコープを絞り、ID衝突を防ぐ
        modal.querySelector('#prevMonthBtn').addEventListener('click', () => {
            currentMonth--;
            if (currentMonth < 0) { currentMonth = 11; currentYear--; }
            renderCalendar();
        });
        modal.querySelector('#nextMonthBtn').addEventListener('click', () => {
            currentMonth++;
            if (currentMonth > 11) { currentMonth = 0; currentYear++; }
            renderCalendar();
        });
        modal.querySelector('#jumpPrevBtn').addEventListener('click', () => {
            currentMonth -= 6;
            while (currentMonth < 0) { currentMonth += 12; currentYear--; }
            renderCalendar();
        });
        modal.querySelector('#jumpNextBtn').addEventListener('click', () => {
            currentMonth += 6;
            while (currentMonth > 11) { currentMonth -= 12; currentYear++; }
            renderCalendar();
        });

        monthSelect.addEventListener('change', (e) => {
            const [y, m] = e.target.value.split('-').map(Number);
            currentYear = y;
            currentMonth = m;
            renderCalendar();
        });

        modal.querySelector('#lockMonthCheck').addEventListener('change', (e) => {
            const monthKey = `${currentYear}-${currentMonth}`;
            if (e.target.checked) {
                this.lockedMonths[monthKey] = true;
            } else {
                delete this.lockedMonths[monthKey];
            }
            this.saveData();
            renderCalendar();
        });

        modal.querySelector('#closeAttModal').addEventListener('click', () => {
            modal.remove();
            this.render();
        });

        modal.querySelector('#openAbsenceListBtn').addEventListener('click', () => {
            this.openAbsenceListModal(student);
        });
    },

    /**
     * 生徒の欠席一覧（どの授業を何日に休んだか）をすべて表示するモーダル
     * 選択中の年度（設定済みの年度）の記録のみを対象とする。
     */
    openAbsenceListModal(student) {
        const sm = window.ScheduleModule;
        const dayLabels = ['日', '月', '火', '水', '木', '金', '土'];
        const fiscalYear = getFiscalYear();

        const records = this.attendance[student.id] || {};
        const rows = [];

        Object.entries(records).forEach(([dateStr, record]) => {
            if (!this._isDateInFiscalYear(dateStr, fiscalYear)) return;

            const dateObj = new Date(dateStr);
            const dow = dateObj.getDay();
            const dayKeys = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
            const dayKey = dayKeys[dow];
            if (dayKey === 'sun' || dayKey === 'sat') return;

            const baseSchedule = sm ? (sm.classTimetable[dayKey] || []) : [];
            const changes = sm ? (sm.dailyChanges?.class?.[dateStr] || {}) : {};

            (record.periods || []).forEach(periodNum => {
                const idx = periodNum - 1;
                const subject = changes[idx] !== undefined ? changes[idx] : baseSchedule[idx];
                rows.push({ dateStr, dow, period: periodNum, subject: subject || '（授業不明）' });
            });
        });

        // 日付・時限順に並べる
        rows.sort((a, b) => a.dateStr === b.dateStr ? a.period - b.period : a.dateStr.localeCompare(b.dateStr));

        const rowsHtml = rows.map(r => {
            const [y, m, d] = r.dateStr.split('-');
            return `<tr>
                <td style="padding:6px 12px;">${parseInt(m)}/${parseInt(d)}</td>
                <td style="padding:6px 12px;">${dayLabels[r.dow]}曜日</td>
                <td style="padding:6px 12px; text-align:center;">${r.period}限</td>
                <td style="padding:6px 12px;">${escapeHtml(r.subject)}</td>
            </tr>`;
        }).join('');

        const modal = document.createElement('div');
        modal.className = 'modal active';
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');
        modal.innerHTML = `
            <div class="modal-content" style="max-width:460px; max-height:80vh; display:flex; flex-direction:column;">
                <div class="modal-header">
                    <h3>${escapeHtml(student.number)} ${escapeHtml(student.nameKanji)} の欠席一覧（${fiscalYear}年度・${rows.length}コマ）</h3>
                    <button class="modal-close" aria-label="閉じる" id="closeAbsenceListModal">✕</button>
                </div>
                <div class="modal-body" style="overflow-y:auto; flex:1;">
                    <table style="width:100%; border-collapse:collapse;">
                        <thead><tr style="border-bottom:2px solid #e2e8f0;">
                            <th style="padding:6px 12px; text-align:left;">日付</th>
                            <th style="padding:6px 12px; text-align:left;">曜日</th>
                            <th style="padding:6px 12px; text-align:center;">時限</th>
                            <th style="padding:6px 12px; text-align:left;">科目</th>
                        </tr></thead>
                        <tbody>${rowsHtml || '<tr><td colspan="4" style="padding:12px; text-align:center; color:#94a3b8;">欠席記録なし</td></tr>'}</tbody>
                    </table>
                </div>
            </div>`;

        document.body.appendChild(modal);
        modal.querySelector('#closeAbsenceListModal').addEventListener('click', () => modal.remove());
        modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
    },

    /**
     * 出欠一覧表（日付×時限）のHTMLを生成
     * 縦: その月の日付、横: 1〜N限。セルには科目名も表示する。
     */
    _renderAttendanceTableHtml(student, year, month, isLocked) {
        const dayKeys = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
        const dayLabels = ['日', '月', '火', '水', '木', '金', '土'];

        const sm = window.ScheduleModule;
        const settingsData = window.StorageManager?.getCurrentData() || {};
        const periodsPerDay = settingsData.appSettings?.periodsPerDay || { mon: 6, tue: 6, wed: 6, thu: 6, fri: 6, sat: 0, sun: 0 };
        const periodTimes = settingsData.appSettings?.periodTimes || {};

        const lastDay = new Date(year, month + 1, 0).getDate();
        // 表の列数 = その月に登場する最大時限数
        let maxPeriods = 0;
        for (let d = 1; d <= lastDay; d++) {
            const dow = new Date(year, month, d).getDay();
            maxPeriods = Math.max(maxPeriods, periodsPerDay[dayKeys[dow]] || 0);
        }
        if (maxPeriods === 0) maxPeriods = 6;

        let html = `<table class="attendance-table-grid">
            <thead><tr>
                <th class="att-col-date">日付</th>
                <th class="att-col-all">全欠席</th>`;
        for (let p = 1; p <= maxPeriods; p++) {
            const t = periodTimes[p] || {};
            const timeStr = t.start ? `<div class="att-period-time">${t.start}${t.end ? '〜' + t.end : ''}</div>` : '';
            html += `<th class="att-col-period">${p}限${timeStr}</th>`;
        }
        html += '</tr></thead><tbody>';

        for (let d = 1; d <= lastDay; d++) {
            const dateObj = new Date(year, month, d);
            const dateStr = this._formatDate(dateObj);
            const dow = dateObj.getDay();
            const dayKey = dayKeys[dow];
            const dayPeriods = periodsPerDay[dayKey] || 0;
            const record = this.attendance[student.id]?.[dateStr];
            const absentPeriods = record?.periods || [];

            const baseSchedule = sm ? (sm.classTimetable[dayKey] || []) : [];
            const changes = sm ? (sm.dailyChanges?.class?.[dateStr] || {}) : {};

            const isWeekend = dow === 0 || dow === 6;
            const rowClasses = ['att-row'];
            if (isWeekend) rowClasses.push('att-row-weekend');
            if (dayPeriods === 0) rowClasses.push('att-row-noclass');

            const isAllAbsent = dayPeriods > 0 && absentPeriods.length >= dayPeriods;

            html += `<tr class="${rowClasses.join(' ')}" data-date="${dateStr}">
                <td class="att-col-date"><span class="att-date-num">${d}</span><span class="att-date-day ${dow === 0 ? 'sun' : dow === 6 ? 'sat' : ''}">(${dayLabels[dow]})</span></td>`;

            if (dayPeriods > 0) {
                html += `<td class="att-col-all">
                    <button class="att-all-toggle ${isAllAbsent ? 'active' : ''}" data-date="${dateStr}" ${isLocked ? 'disabled' : ''}
                        title="この日をすべて欠席/出席にする">${isAllAbsent ? '全欠席' : '－'}</button>
                </td>`;
            } else {
                html += `<td class="att-col-all att-cell-disabled">－</td>`;
            }

            for (let p = 1; p <= maxPeriods; p++) {
                if (p > dayPeriods) {
                    html += `<td class="att-cell-disabled">－</td>`;
                    continue;
                }
                const idx = p - 1;
                const subject = changes[idx] !== undefined ? changes[idx] : (baseSchedule[idx] || '');
                const isAbsent = absentPeriods.includes(p);
                html += `<td class="att-cell ${isAbsent ? 'absent' : ''} ${isLocked ? 'locked' : ''}" data-date="${dateStr}" data-period="${p}">
                    <div class="att-cell-subject">${escapeHtml(subject || '—')}</div>
                    <div class="att-cell-status">${isAbsent ? '欠席' : ''}</div>
                </td>`;
            }
            html += '</tr>';
        }

        html += '</tbody></table>';
        return html;
    },

    /**
     * 出欠一覧表のクリックイベントを設定
     * セルをクリックするたびに即座に保存し、連続してクリックして確定できるようにする。
     */
    _bindAttendanceTableEvents(container, student, year, month, isLocked, onChanged) {
        if (isLocked) return;

        container.querySelectorAll('.att-cell:not(.att-cell-disabled)').forEach(cell => {
            cell.addEventListener('click', () => {
                const dateStr = cell.dataset.date;
                const period = parseInt(cell.dataset.period);

                if (!this.attendance[student.id]) this.attendance[student.id] = {};
                const record = this.attendance[student.id][dateStr] || { type: 'mixed', periods: [], memo: '' };

                const idx = record.periods.indexOf(period);
                if (idx > -1) {
                    record.periods.splice(idx, 1);
                } else {
                    record.periods.push(period);
                }

                if (record.periods.length === 0) {
                    delete this.attendance[student.id][dateStr];
                } else {
                    this.attendance[student.id][dateStr] = record;
                }

                this.saveData();

                // セル単体の見た目だけ即時更新（表全体の再描画はしない＝連続クリックが速い）
                const isAbsent = record.periods && record.periods.includes(period);
                cell.classList.toggle('absent', !!isAbsent);
                cell.querySelector('.att-cell-status').textContent = isAbsent ? '欠席' : '';

                // 「全欠席」ボタンの見た目も同期
                const row = cell.closest('tr');
                const allBtn = row?.querySelector('.att-all-toggle');
                if (allBtn) {
                    const totalPeriodCells = row.querySelectorAll('.att-cell').length;
                    const absentCount = row.querySelectorAll('.att-cell.absent').length;
                    const isAllAbsent = totalPeriodCells > 0 && absentCount >= totalPeriodCells;
                    allBtn.classList.toggle('active', isAllAbsent);
                    allBtn.textContent = isAllAbsent ? '全欠席' : '－';
                }
            });
        });

        container.querySelectorAll('.att-all-toggle').forEach(btn => {
            btn.addEventListener('click', () => {
                const dateStr = btn.dataset.date;
                const row = btn.closest('tr');
                const periodCells = Array.from(row.querySelectorAll('.att-cell'));
                const shouldMarkAbsent = !btn.classList.contains('active');

                if (!this.attendance[student.id]) this.attendance[student.id] = {};

                if (shouldMarkAbsent) {
                    const allPeriods = periodCells.map(c => parseInt(c.dataset.period));
                    this.attendance[student.id][dateStr] = { type: 'absent', periods: allPeriods, memo: '' };
                } else {
                    delete this.attendance[student.id][dateStr];
                }

                this.saveData();

                // 見た目を同期
                periodCells.forEach(c => {
                    c.classList.toggle('absent', shouldMarkAbsent);
                    c.querySelector('.att-cell-status').textContent = shouldMarkAbsent ? '欠席' : '';
                });
                btn.classList.toggle('active', shouldMarkAbsent);
                btn.textContent = shouldMarkAbsent ? '全欠席' : '－';
            });
        });
    },

    _formatDate(date) {
        const y = date.getFullYear();
        const m = ('0' + (date.getMonth() + 1)).slice(-2);
        const d = ('0' + date.getDate()).slice(-2);
        return `${y}-${m}-${d}`;
    },

    saveData() {
        const data = window.StorageManager?.getCurrentData() || {};
        if (!data.attendance) data.attendance = {};
        data.attendance.records = this.attendance;
        data.attendance.lockedMonths = this.lockedMonths;
        window.StorageManager?.updateCurrentData(data);
    },

    loadData() {
        const data = window.StorageManager?.getCurrentData() || {};
        this.attendance = data.attendance?.records || {};
        this.lockedMonths = data.attendance?.lockedMonths || {};
    }
};

if (typeof window !== 'undefined') {
    window.AttendanceModule = AttendanceModule;
}
