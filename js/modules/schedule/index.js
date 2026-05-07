/**
 * ScheduleModule - 週間スケジュール・時間割管理
 * 
 * 機能:
 * - 4週間分のスケジュール表示
 * - クラス時間割と自分の時間割の管理
 * - 日ごとの予定変更
 * - 週次履歴の保存と見直し
 */

const ScheduleModule = {
    name: 'ScheduleModule',
    initialized: false,

    // クラスの時間割（月〜金、1〜6限）
    classTimetable: {
        mon: ['', '', '', '', '', ''],
        tue: ['', '', '', '', '', ''],
        wed: ['', '', '', '', '', ''],
        thu: ['', '', '', '', '', ''],
        fri: ['', '', '', '', '', '']
    },

    // 自分の時間割（教員用：担当授業がある時限）
    myTimetable: {
        mon: ['', '', '', '', '', ''],
        tue: ['', '', '', '', '', ''],
        wed: ['', '', '', '', '', ''],
        thu: ['', '', '', '', '', ''],
        fri: ['', '', '', '', '', '']
    },

    // アクティブな時間割（'class' or 'my'）
    activeTimetable: 'my',

    // 予定の上書き・変更 { class: {}, my: {} }
    dailyChanges: {
        class: {},
        my: {}
    },

    // 週次履歴
    weekHistory: [],

    // ダッシュボードメモ（週単位の一時的なメモ）
    // { 'weekKey': { 'dateStr': { period: 'memo' } } }
    dashboardMemos: {},

    // 週オフセット
    weekOffset: 0,

    // クラス時間割用科目マスタ（科目名のみ）
    classSubjects: [],

    // 自分の時間割用科目マスタ（科目名＋クラス名）
    mySubjects: [],

    /**
     * 初期化
     */
    init() {
        if (this.initialized) return;
        this.loadData();
        this.initialized = true;
        console.log('📅 ScheduleModule initialized');
    },

    /**
     * 描画（自分の時間割をメイン表示、タブ切り替え）
     */
    render(containerId = 'scheduleContainer') {
        const container = document.getElementById(containerId);
        if (!container) return;

        // デフォルトは自分の時間割
        if (!this.activeTimetable || (this.activeTimetable !== 'class' && this.activeTimetable !== 'my')) {
            this.activeTimetable = 'my';
        }

        const weeks = this._generateWeeks(4);

        let html = `
            <div class="schedule-controls">
                <div class="timetable-tabs">
                    <button class="tt-tab ${this.activeTimetable === 'my' ? 'active' : ''}" data-tt="my">自分の時間割</button>
                    <button class="tt-tab ${this.activeTimetable === 'class' ? 'active' : ''}" data-tt="class">クラス時間割</button>
                </div>
                <div class="schedule-actions">
                    <button class="btn btn-sm btn-info" id="printTimetableBtn" style="margin-right: 8px;">🖨️ 時間割印刷</button>
                    <button class="btn btn-sm btn-primary" id="openTimetableListBtn">📅 時間割一覧/変更</button>
                </div>
            </div>
            <div class="schedule-memo-notice" style="background: #e0f2fe; border: 1px solid #7dd3fc; border-radius: 6px; padding: 8px 12px; margin-bottom: 10px; font-size: 0.85em; color: #0369a1;">
                ※セルをクリックして予定メモを入力できます。時間割変更は「時間割一覧/変更」から行ってください。
            </div>
            <div class="schedule-wrapper" style="zoom: 0.8;">`;

        // アクティブな時間割のみ描画
        weeks.forEach((week, index) => {
            html += this._renderWeek(week, index === 0 ? '今週' : `${index}週後`);
        });

        html += '</div>';
        
        if (window.CoreDOM) {
            window.CoreDOM.updateDOMWithState(container, html);
        } else {
            container.innerHTML = html;
        }

        this._setupCellEvents(container);
        this._setupTabEvents(container);
        this._setupActionEvents(container);

        // 時間割一覧・印刷ボタン（コンテナへの委譲で多重バインド防止）
        if (!container.dataset.boundActions) {
            container.dataset.boundActions = 'true';
            container.addEventListener('click', (e) => {
                if (e.target.closest('#openTimetableListBtn')) this.openTimetableListModal();
                if (e.target.closest('#printTimetableBtn')) this.printTimetableForWeek();
            });
        }
    },

    _setupTabEvents(container) {
        if (!container.dataset.boundTabs) {
            container.addEventListener('click', (e) => {
                const tab = e.target.closest('.tt-tab');
                if (tab) {
                    this.activeTimetable = tab.dataset.tt;
                    this.render(container.id);
                }
            });
            container.dataset.boundTabs = 'true';
        }
    },

    _getCurrentTimetable() {
        return this.activeTimetable === 'class' ? this.classTimetable : this.myTimetable;
    },

    _renderWeek(weekDates, label) {
        const days = ['月', '火', '水', '木', '金'];
        const timetable = this._getCurrentTimetable();
        const currentChanges = this.activeTimetable === 'class' ? this.dailyChanges.class : this.dailyChanges.my;

        // 週キーを生成
        const weekKey = this._formatDate(weekDates[0]);
        // メモをタイプ（my/class）ごとに分離
        const typeMemos = (this.dashboardMemos[this.activeTimetable] || {})[weekKey] || {};

        // 時限時間設定を取得
        const appData = window.StorageManager?.getCurrentData() || {};
        const periodTimes = appData.appSettings?.periodTimes || {};
        const periodTimeDisplay = appData.appSettings?.periodTimeDisplay || 'none';
        // 区切り時限設定（デフォルト: 4限後・6限後）
        const periodDividers = appData.appSettings?.periodDividers ?? [4, 6];

        let html = `<div class="schedule-week">
            <div class="week-header">${label}</div>
            <div class="week-grid">
                <div class="grid-header-row">
                    <div class="grid-header-cell empty"></div>
                    ${weekDates.map((date, i) => `
                        <div class="grid-header-cell day-header ${this._isToday(date) ? 'today' : ''}">
                            <div class="date-label">${date.getMonth() + 1}/${date.getDate()} (${days[i]})</div>
                        </div>
                    `).join('')}
                </div>`;

        // 登校前行（periodIndex = -1 で保存）
        html += `<div class="grid-row after-row">
            <div class="grid-header-cell period-header">
                <div class="period-number" style="font-size:0.7em; line-height:1.2; word-break:keep-all;">登校前</div>
            </div>`;
        weekDates.forEach((date, dayIndex) => {
            const dateStr = this._formatDate(date);
            const dayKey = ['mon', 'tue', 'wed', 'thu', 'fri'][dayIndex];
            const beforeMemo = (typeMemos[dateStr] || {})[-1] || '';
            const hasMemo = beforeMemo !== '';
            html += `
                <div class="grid-cell ${hasMemo ? 'has-memo' : ''}"
                     data-date="${dateStr}"
                     data-period="0"
                     data-day="${dayKey}"
                     data-week-key="${weekKey}"
                     data-timetable="${this.activeTimetable}"
                     data-base-content="">
                    ${beforeMemo}
                </div>
            `;
        });
        html += `</div>`;

        for (let period = 1; period <= 7; period++) {
            // 時刻表示文字列を生成
            let timeHtml = '';
            if (periodTimeDisplay !== 'none' && periodTimes[period]) {
                const start = periodTimes[period].start || '';
                const end = periodTimes[period].end || '';
                if (periodTimeDisplay === 'start' && start) {
                    timeHtml = `<div class="period-time">${start}</div>`;
                } else if (periodTimeDisplay === 'both' && (start || end)) {
                    timeHtml = `<div class="period-time">${start}${start && end ? '〜' : ''}${end}</div>`;
                }
            }
            
            let periodLabel = period === 7 ? '放課後' : period;
            let fontSizeStyle = period === 7 ? 'font-size:0.7em; line-height:1.2; word-break:keep-all;' : '';
            // 前の時限が区切り対象の場合、行に二重線クラスを付与
            const isDividerRow = period === 1 || periodDividers.includes(period - 1) || (period === 7 && periodDividers.includes(6));

            html += `<div class="grid-row${isDividerRow ? ' period-divider' : ''}">
                <div class="grid-header-cell period-header">
                    <div class="period-number" style="${fontSizeStyle}">${periodLabel}</div>
                    ${timeHtml}
                </div>`;

            weekDates.forEach((date, dayIndex) => {
                const dateStr = this._formatDate(date);
                const dayKey = ['mon', 'tue', 'wed', 'thu', 'fri'][dayIndex];

                // ベースの時間割を取得
                let baseContent = timetable[dayKey][period - 1];
                let isChanged = false;

                // 時間割変更を適用
                if (currentChanges[dateStr] && currentChanges[dateStr][period - 1] !== undefined) {
                    baseContent = currentChanges[dateStr][period - 1];
                    isChanged = true;
                }

                // ダッシュボードメモがあれば置換表示
                let displayContent = baseContent;
                let hasMemo = false;
                if (typeMemos[dateStr] && typeMemos[dateStr][period - 1] !== undefined && typeMemos[dateStr][period - 1] !== '') {
                    displayContent = typeMemos[dateStr][period - 1];
                    hasMemo = true;
                }

                html += `
                    <div class="grid-cell ${hasMemo ? 'has-memo' : ''} ${isChanged ? 'changed' : ''}" 
                         data-date="${dateStr}" 
                         data-period="${period}"
                         data-day="${dayKey}"
                         data-week-key="${weekKey}"
                         data-timetable="${this.activeTimetable}"
                         data-base-content="${baseContent || ''}">
                        ${displayContent || ''}
                    </div>
                `;
            });

            html += `</div>`;
        }

        html += `</div></div>`;
        return html;
    },

    _generateWeeks(numWeeks) {
        const weeks = [];
        const today = new Date();
        today.setDate(today.getDate() + (this.weekOffset || 0) * 7);
        const currentDay = today.getDay();
        const diff = today.getDate() - currentDay + (currentDay === 0 ? -6 : 1);
        let monday = new Date(today.setDate(diff));

        for (let w = 0; w < numWeeks; w++) {
            const week = [];
            for (let d = 0; d < 5; d++) {
                const date = new Date(monday);
                date.setDate(monday.getDate() + d);
                week.push(date);
            }
            weeks.push(week);
            monday.setDate(monday.getDate() + 7);
        }
        return weeks;
    },

    _formatDate(date) {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    },

    _isToday(date) {
        const today = new Date();
        return date.getDate() === today.getDate() &&
            date.getMonth() === today.getMonth() &&
            date.getFullYear() === today.getFullYear();
    },

    _setupCellEvents(container) {
        if (!container.dataset.boundCells) {
            container.addEventListener('click', (e) => {
                const cell = e.target.closest('.grid-cell');
                if (!cell) return;

                const date = cell.dataset.date;
                const period = parseInt(cell.dataset.period);
                const weekKey = cell.dataset.weekKey;
                const baseContent = cell.dataset.baseContent || '';
                const type = this.activeTimetable;

                // 現在のメモを取得
                const currentMemo = ((this.dashboardMemos[type] || {})[weekKey] || {})[date]?.[period - 1] || '';

                const input = prompt(
                    `予定メモを入力（10文字以内）\n※ここはメモのみです。時間割変更は「時間割一覧/変更」から行ってください。\n※空欄にするとメモが削除されます。\n\n元の予定: ${baseContent || '（なし）'}`,
                    currentMemo
                );

                if (input !== null) {
                    const trimmedInput = input.trim().substring(0, 10);
                    this._setDashboardMemo(type, weekKey, date, period - 1, trimmedInput);
                    this.render(container.id);
                }
            });
            container.dataset.boundCells = 'true';
        }
    },

    // ... setupActionEvents, saveCurrentWeek ...

    _setDashboardMemo(type, weekKey, dateStr, periodIndex, value) {
        if (!this.dashboardMemos[type]) this.dashboardMemos[type] = {};
        if (!this.dashboardMemos[type][weekKey]) this.dashboardMemos[type][weekKey] = {};
        if (!this.dashboardMemos[type][weekKey][dateStr]) this.dashboardMemos[type][weekKey][dateStr] = {};
        if (value === '') {
            delete this.dashboardMemos[type][weekKey][dateStr][periodIndex];
        } else {
            this.dashboardMemos[type][weekKey][dateStr][periodIndex] = value;
        }
        this.saveData();
    },

    _loadDashboardMemos() {
        const data = window.StorageManager?.getCurrentData() || {};
        const memos = data.schedule?.dashboardMemos || {};

        // 互換性対応と初期化
        if (memos.my || memos.class) {
            this.dashboardMemos = {
                my: memos.my || {},
                class: memos.class || {}
            };
        } else {
            // 古い形式または新規
            this.dashboardMemos = {
                my: memos, // 既存のメモは 'my' に移行
                class: {}
            };
        }
    },

    _renderTimetableEditWithDnD(containerId, timetable, type) {
        const container = document.getElementById(containerId);
        if (!container) return;

        const days = [
            { key: 'mon', label: '月' }, { key: 'tue', label: '火' }, { key: 'wed', label: '水' },
            { key: 'thu', label: '木' }, { key: 'fri', label: '金' }
        ];
        const subjects = type === 'class' ? this.classSubjects : this.mySubjects;
        const typeLabel = type === 'class' ? 'クラス時間割' : '自分の時間割';

        let html = `<h4 style="margin-bottom: 10px;">${typeLabel}</h4>`;
        html += '<table class="timetable-edit-table" style="width: 100%; border-collapse: collapse; margin-bottom: 15px;">';
        html += '<thead><tr><th style="padding: 8px; border: 1px solid #ddd;"></th>';
        days.forEach(d => html += `<th style="padding: 8px; border: 1px solid #ddd;">${d.label}</th>`);
        html += '</tr></thead><tbody>';

        for (let period = 1; period <= 6; period++) {
            html += `<tr><td style="padding: 8px; border: 1px solid #ddd; font-weight: bold; text-align: center;">${period}限</td>`;
            days.forEach(d => {
                const subject = timetable[d.key][period - 1] || '';
                html += `<td class="tt-cell" data-type="${type}" data-day="${d.key}" data-period="${period}" 
                    style="padding: 8px; border: 1px solid #ddd; text-align: center; min-height: 40px; background: ${subject ? '#e0f2fe' : 'white'}; cursor: pointer; position: relative;">
                    <span class="cell-content">${subject || '<span style="color: #ccc;">—</span>'}</span>
                    ${subject ? `<button class="cell-clear-btn" style="position: absolute; top: 2px; right: 2px; border: none; background: rgba(0,0,0,0.1); border-radius: 50%; width: 18px; height: 18px; font-size: 10px; cursor: pointer; display: flex; align-items: center; justify-content: center; opacity: 0.6;">×</button>` : ''}
                </td>`;
            });
            html += '</tr>';
        }
        html += '</tbody></table>';

        html += `<div class="subjects-tally-area" id="${containerId}_tally" style="margin-bottom: 15px; padding: 10px; background: #f1f5f9; border-radius: 8px; font-size: 0.85em;">
            <strong>科目別集計 (週次):</strong>
            <div class="tally-content" style="display: flex; flex-wrap: wrap; gap: 10px; margin-top: 5px;"></div>
        </div>`;

        html += `<div class="subject-master-area" style="background: #f8fafc; padding: 10px; border-radius: 8px; border: 1px dashed #cbd5e1;">`;
        html += `<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">`;
        html += `<span style="font-size: 0.9em; color: #64748b;">↑ 科目を上のセルにドラッグ、またはクリックしたセルに適用</span>`;
        html += `<button class="btn btn-sm add-subject-btn" data-type="${type}">＋ 科目追加</button>`;
        html += `</div>`;
        html += `<div class="subject-cards" style="display: flex; flex-wrap: wrap; gap: 8px;">`;

        subjects.forEach((subj, idx) => {
            const displayText = typeof subj === 'object' ? `${subj.class} ${subj.name}` : subj;
            html += `<div class="subject-card" draggable="true" data-type="${type}" data-index="${idx}" data-value="${escapeHtml(displayText)}"
                style="padding: 6px 12px; background: white; border: 1px solid #e2e8f0; border-radius: 6px; cursor: grab; user-select: none; display: flex; align-items: center; gap: 6px;">
                <span>${escapeHtml(displayText)}</span>
                <button class="delete-subject-btn" data-type="${type}" data-index="${idx}" style="border: none; background: none; color: #94a3b8; cursor: pointer; font-size: 14px;">×</button>
            </div>`;
        });
        html += '</div></div>';

        container.innerHTML = html;
        this._updateSubjectsTally(containerId, timetable);
        this._setupTimetableDnD(container, type, timetable);
        this._setupSubjectEvents(container, type);
    },

    _updateSubjectsTally(containerId, timetable) {
        const tallyContainer = document.querySelector(`#${containerId} .tally-content`);
        if (!tallyContainer) return;
        const counts = {};
        Object.values(timetable).forEach(dayPeriods => {
            dayPeriods.forEach(subject => {
                if (subject && subject.trim()) counts[subject] = (counts[subject] || 0) + 1;
            });
        });
        const sortedSubjects = Object.keys(counts).sort();
        if (sortedSubjects.length === 0) {
            tallyContainer.innerHTML = '<span style="color: #64748b;">設定されている科目はありません</span>';
            return;
        }
        tallyContainer.innerHTML = sortedSubjects.map(sub => `
            <div style="background: white; padding: 4px 10px; border-radius: 4px; border: 1px solid #e2e8f0;">
                <span style="font-weight: bold;">${escapeHtml(sub)}</span>: ${counts[sub]}時間
            </div>
        `).join('');
    },

    _setupTimetableDnD(container, type, timetable) {
        let selectedMasterValue = null;
        container.querySelectorAll('.subject-card').forEach(card => {
            card.addEventListener('dragstart', (e) => {
                e.dataTransfer.setData('text/plain', card.dataset.value);
                e.dataTransfer.effectAllowed = 'copy';
                card.style.opacity = '0.5';
            });
            card.addEventListener('dragend', () => card.style.opacity = '1');
            card.addEventListener('click', () => {
                container.querySelectorAll('.subject-card').forEach(c => c.style.borderColor = '#e2e8f0');
                if (selectedMasterValue === card.dataset.value) selectedMasterValue = null;
                else { selectedMasterValue = card.dataset.value; card.style.borderColor = '#3b82f6'; }
            });
        });

        container.querySelectorAll('.tt-cell').forEach(cell => {
            cell.addEventListener('dragover', (e) => { e.preventDefault(); cell.style.background = '#bfdbfe'; });
            cell.addEventListener('dragleave', () => {
                const hasValue = cell.querySelector('.cell-content').textContent.trim() !== '—';
                cell.style.background = hasValue ? '#e0f2fe' : 'white';
            });
            const updateCell = (value) => {
                const { day, period } = cell.dataset;
                if (type === 'class') this.setClassTimetable(day, parseInt(period), value);
                else this.setMyTimetable(day, parseInt(period), value);
                cell.querySelector('.cell-content').innerHTML = value || '<span style="color: #ccc;">—</span>';
                cell.style.background = value ? '#e0f2fe' : 'white';
                let clearBtn = cell.querySelector('.cell-clear-btn');
                if (value) {
                    if (!clearBtn) {
                        clearBtn = document.createElement('button');
                        clearBtn.className = 'cell-clear-btn';
                        clearBtn.style.cssText = 'position: absolute; top: 2px; right: 2px; border: none; background: rgba(0,0,0,0.1); border-radius: 50%; width: 18px; height: 18px; font-size: 10px; cursor: pointer; display: flex; align-items: center; justify-content: center; opacity: 0.6;';
                        clearBtn.textContent = '×';
                        cell.appendChild(clearBtn);
                        this._setupCellClearEvent(clearBtn, cell, type, timetable, container.id);
                    }
                } else if (clearBtn) clearBtn.remove();
                this.saveData();
                this._updateSubjectsTally(container.id, timetable);
            };
            cell.addEventListener('drop', (e) => { e.preventDefault(); updateCell(e.dataTransfer.getData('text/plain')); });
            cell.addEventListener('click', (e) => {
                if (e.target.classList.contains('cell-clear-btn')) return;
                if (selectedMasterValue) updateCell(selectedMasterValue);
                else alert('科目を選択してからクリックするか、ドラッグ＆ドロップしてください。');
            });
            const clearBtn = cell.querySelector('.cell-clear-btn');
            if (clearBtn) this._setupCellClearEvent(clearBtn, cell, type, timetable, container.id);
        });
    },

    _setupCellClearEvent(btn, cell, type, timetable, containerId) {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const { day, period } = cell.dataset;
            if (type === 'class') this.setClassTimetable(day, parseInt(period), '');
            else this.setMyTimetable(day, parseInt(period), '');
            cell.querySelector('.cell-content').innerHTML = '<span style="color: #ccc;">—</span>';
            cell.style.background = 'white';
            btn.remove();
            this.saveData();
            this._updateSubjectsTally(containerId, timetable);
        });
    },

    loadData() {
        const data = window.StorageManager?.getCurrentData() || {};
        if (data.schedule) {
            this.classTimetable = data.schedule.classTimetable || this.classTimetable;
            this.myTimetable = data.schedule.myTimetable || this.myTimetable;
            this.weekHistory = data.schedule.weekHistory || [];
            this._loadDashboardMemos(); // Use the new method for loading memos

            // dailyChangesのマイグレーション
            const loadedChanges = data.schedule.changes || {};
            if (loadedChanges.class && loadedChanges.my) {
                // 新形式
                this.dailyChanges = loadedChanges;
            } else {
                // 旧形式（すべてクラス用として扱う、またはクリア）
                // 既に保存されているデータ構造が日付キーのオブジェクトの場合
                this.dailyChanges = {
                    class: loadedChanges,
                    my: {} // 旧データは一旦クラス側に寄せる
                };
            }


            // 科目マスターの読み込み
            if (data.schedule.classSubjects) {
                this.classSubjects = data.schedule.classSubjects;
            }
            if (data.schedule.mySubjects) {
                this.mySubjects = data.schedule.mySubjects;
            }
        }
    },

    _setupActionEvents(container) {
        const attachOnce = (id, handler) => {
            const el = document.getElementById(id);
            if (el && !el.dataset.bound) {
                el.addEventListener('click', handler);
                el.dataset.bound = 'true';
            }
        };

        attachOnce('saveWeekBtn', () => this.saveCurrentWeek());
        attachOnce('viewHistoryBtn', () => this.showWeekHistory());
    },

    saveCurrentWeek() {
        const weeks = this._generateWeeks(1);
        const weekDates = weeks[0];
        const startDate = this._formatDate(weekDates[0]);
        const endDate = this._formatDate(weekDates[4]);

        const weekData = {
            id: Date.now().toString(),
            startDate: startDate,
            endDate: endDate,
            label: `${startDate} 〜 ${endDate}`,
            timetables: {
                class: JSON.parse(JSON.stringify(this.classTimetable)),
                my: JSON.parse(JSON.stringify(this.myTimetable))
            },
            changes: {
                class: {},
                my: {}
            },
            savedAt: new Date().toISOString()
        };

        weekDates.forEach(date => {
            const dateStr = this._formatDate(date);
            if (this.dailyChanges.class[dateStr]) {
                weekData.changes.class[dateStr] = this.dailyChanges.class[dateStr];
            }
            if (this.dailyChanges.my[dateStr]) {
                weekData.changes.my[dateStr] = this.dailyChanges.my[dateStr];
            }
        });

        this.weekHistory.unshift(weekData);
        this.weekHistory = this.weekHistory.slice(0, 20);
        this.saveData();
        alert(`${weekData.label} の時間割を保存しました`);
    },

    showWeekHistory() {
        if (this.weekHistory.length === 0) {
            alert('保存された週の履歴がありません');
            return;
        }

        let msg = '保存された週の時間割:\n';
        this.weekHistory.forEach((week, i) => {
            const date = new Date(week.savedAt).toLocaleString('ja-JP');
            msg += `${i + 1}. ${week.label} (保存: ${date})\n`;
        });
        msg += '\n詳細を見る番号を入力:';

        const input = prompt(msg);
        if (!input) return;

        const idx = parseInt(input) - 1;
        if (idx >= 0 && idx < this.weekHistory.length) {
            this._showWeekDetail(this.weekHistory[idx]);
        }
    },

    _showWeekDetail(weekData) {
        let detail = `【${weekData.label}】\n`;
        const days = { mon: '月', tue: '火', wed: '水', thu: '木', fri: '金' };

        // 互換性対応
        const timetables = weekData.timetables || { class: weekData.timetable, my: weekData.timetable };
        const changes = weekData.changes.class ? weekData.changes : { class: weekData.changes, my: {} };

        if (timetables.class) {
            detail += '\n[クラス時間割]\n';
            for (const [dayKey, periods] of Object.entries(timetables.class)) {
                detail += `${days[dayKey]}: ${periods.filter(p => p).join(' → ') || '(空)'}\n`;
            }
        }

        if (changes.class && Object.keys(changes.class).length > 0) {
            detail += '変更点(クラス):\n';
            for (const [dateStr, dayChanges] of Object.entries(changes.class)) {
                for (const [period, content] of Object.entries(dayChanges)) {
                    detail += `  ${dateStr} ${period}限: ${content}\n`;
                }
            }
        }

        // 自分の時間割変更点なども同様に追加可能だが長くなるので簡易表示
        if (changes.my && Object.keys(changes.my).length > 0) {
            detail += '\n変更点(自分):\n';
            for (const [dateStr, dayChanges] of Object.entries(changes.my)) {
                for (const [period, content] of Object.entries(dayChanges)) {
                    detail += `  ${dateStr} ${period}限: ${content}\n`;
                }
            }
        }

        alert(detail);
    },


    _updateSchedule(date, period, content, type) {
        const targetChanges = type === 'class' ? this.dailyChanges.class : this.dailyChanges.my;

        if (!targetChanges[date]) {
            targetChanges[date] = {};
        }
        targetChanges[date][period] = content;

        if (content === '') {
            delete targetChanges[date][period];
            if (Object.keys(targetChanges[date]).length === 0) {
                delete targetChanges[date];
            }
        }

        this.saveData();
    },

    setBaseTimetable(day, period, subject) {
        const timetable = this._getCurrentTimetable();
        if (timetable[day]) {
            timetable[day][period - 1] = subject;
            this.saveData();
        }
    },

    setClassTimetable(day, period, subject) {
        if (this.classTimetable[day]) {
            this.classTimetable[day][period - 1] = subject;
            this.saveData();
        }
    },

    setMyTimetable(day, period, subject) {
        if (this.myTimetable[day]) {
            this.myTimetable[day][period - 1] = subject;
            this.saveData();
        }
    },

    saveData() {
        const data = window.StorageManager?.getCurrentData() || {};
        data.schedule = {
            classTimetable: this.classTimetable,
            myTimetable: this.myTimetable,
            changes: this.dailyChanges,
            weekHistory: this.weekHistory,
            dashboardMemos: this.dashboardMemos, // Ensure memos are saved in the new structure
            classSubjects: this.classSubjects,
            mySubjects: this.mySubjects
        };
        window.StorageManager?.updateCurrentData(data);
    },

    /**
     * 時間割設定ページの描画
     */
    renderSettingsPage() {
        this.loadData();

        // 科目マスターのデフォルト値
        if (this.classSubjects.length === 0) {
            this.classSubjects = ['国語', '算数', '理科', '社会', '英語', '体育', '音楽', '図工', '道徳', '総合'];
        }
        if (this.mySubjects.length === 0) {
            this.mySubjects = [];
        }

        // 自分の時間割を上に表示
        this._renderTimetableEditWithDnD('myTimetableEdit', this.myTimetable, 'my');
        this._renderTimetableEditWithDnD('classTimetableEdit', this.classTimetable, 'class');

        const saveBtn = document.getElementById('saveTimetableBtn');
        if (saveBtn) {
            saveBtn.onclick = () => {
                this.saveData();
                alert('時間割を保存しました');
            };
        }
    },


    _setupSubjectEvents(container, type) {
        // 科目追加ボタン
        container.querySelectorAll('.add-subject-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const promptMsg = type === 'class' ? '科目名を入力' : '科目名とクラスを入力（例: 1-1 国語）';
                const input = prompt(promptMsg);
                if (input && input.trim()) {
                    if (type === 'class') {
                        this.classSubjects.push(input.trim());
                    } else {
                        this.mySubjects.push(input.trim());
                    }
                    this.saveData();
                    this.renderSettingsPage();
                }
            });
        });

        // 科目削除ボタン
        container.querySelectorAll('.delete-subject-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const idx = parseInt(btn.dataset.index);
                if (type === 'class') {
                    this.classSubjects.splice(idx, 1);
                } else {
                    this.mySubjects.splice(idx, 1);
                }
                this.saveData();
                this.renderSettingsPage();
            });
        });
    },

    /**
     * 時間割設定エディタを開く
     */
    openTimetableEditor() {
        // 既存のモーダルがあれば削除
        document.getElementById('timetableEditorModal')?.remove();

        const days = ['mon', 'tue', 'wed', 'thu', 'fri'];
        const dayNames = ['月', '火', '水', '木', '金'];
        const periods = 6;

        // 現在のアクティブ時間割に基づいてデータを取得
        const timetable = this.activeTimetable === 'class' ? this.classTimetable : this.myTimetable;
        const title = this.activeTimetable === 'class' ? 'クラス時間割' : '自分の時間割';

        let tableHtml = '<table class="timetable-editor-table"><thead><tr><th>時限</th>';
        dayNames.forEach(d => tableHtml += `<th>${d}</th>`);
        tableHtml += '</tr></thead><tbody>';

        for (let p = 0; p < periods; p++) {
            tableHtml += `<tr><td class="period-cell">${p + 1}限</td>`;
            days.forEach(day => {
                const value = timetable[day]?.[p] || '';
                tableHtml += `<td><input type="text" class="tt-edit-input" data-day="${day}" data-period="${p}" value="${escapeHtml(value)}" placeholder="科目"></td>`;
            });
            tableHtml += '</tr>';
        }
        tableHtml += '</tbody></table>';

        const modal = document.createElement('div');
        modal.id = 'timetableEditorModal';
        modal.className = 'modal active';
        modal.innerHTML = `
            <div class="modal-content modal-large">
                <div class="modal-header">
                    <h3>📝 ${title}の設定</h3>
                    <button class="modal-close" id="closeTimetableEditor">✕</button>
                </div>
                <div class="modal-body">
                    <p class="help-text">各セルに科目名を入力してください。空欄にすると予定なしになります。</p>
                    <div class="timetable-editor-wrapper" style="overflow-x: auto;">
                        ${tableHtml}
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-secondary" id="cancelTimetableEditor">キャンセル</button>
                    <button class="btn btn-primary" id="saveTimetableEditor">保存</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // イベント設定
        document.getElementById('closeTimetableEditor').addEventListener('click', () => this.closeTimetableEditor());
        document.getElementById('cancelTimetableEditor').addEventListener('click', () => this.closeTimetableEditor());
        document.getElementById('saveTimetableEditor').addEventListener('click', () => this.saveTimetableFromEditor());
    },

    /**
     * 時間割エディタを閉じる
     */
    closeTimetableEditor() {
        document.getElementById('timetableEditorModal')?.remove();
    },

    /**
     * 時間割エディタから保存
     */
    saveTimetableFromEditor() {
        const inputs = document.querySelectorAll('.tt-edit-input');
        const timetable = this.activeTimetable === 'class' ? this.classTimetable : this.myTimetable;

        inputs.forEach(input => {
            const day = input.dataset.day;
            const period = parseInt(input.dataset.period);
            timetable[day][period] = input.value.trim();
        });

        this.saveData();
        this.closeTimetableEditor();

        // ダッシュボードの時間割を更新
        const container = document.getElementById('scheduleContainer');
        if (container) {
            this.render('scheduleContainer');
        }

        alert('時間割を保存しました');
    },

    /**
     * 時間割一覧モーダルを開く
     */
    openTimetableListModal() {
        document.getElementById('timetableListModal')?.remove();

        // 現在の週の開始日（月曜）を取得
        const today = new Date();
        const dayOfWeek = today.getDay();
        const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
        const monday = new Date(today);
        monday.setDate(today.getDate() + mondayOffset);

        // デフォルトで14日間（土日含む）表示
        const endDate = new Date(monday);
        endDate.setDate(monday.getDate() + 13);

        const startStr = this._formatDateForInput(monday);
        const endStr = this._formatDateForInput(endDate);

        const modal = document.createElement('div');
        modal.id = 'timetableListModal';
        modal.className = 'modal active';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 95%; width: 1400px; max-height: 90vh;">
                <div class="modal-header" style="display:flex; justify-content:space-between; align-items:center;">
                    <h3 style="margin:0;">📅 時間割一覧/変更</h3>
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <button id="resetTimetableChangesBtn" style="background:#ef4444;color:white;border:none;border-radius:6px;padding:7px 14px;font-size:0.9em;font-weight:bold;cursor:pointer;" title="この期間の変更データを全て削除してベースに戻す">🗑️ 変更リセット</button>
                        <button id="saveTimetableListBtn" style="background:#16a34a;color:white;border:none;border-radius:6px;padding:7px 18px;font-size:0.95em;font-weight:bold;cursor:pointer;">💾 保存する</button>
                        <button class="modal-close" id="closeTimetableListModal" style="font-size:1.2em;background:none;border:none;cursor:pointer;">✕</button>
                    </div>
                </div>
                <div class="modal-body" style="overflow-y: auto; max-height: calc(90vh - 120px);">
                    <div class="timetable-list-notice" style="background: #fef3c7; border: 1px solid #fcd34d; border-radius: 6px; padding: 10px 15px; margin-bottom: 15px; font-size: 0.9em;">
                        ⚠️ <strong>この一覧が授業時数カウントのベースとなります。</strong>
                        参観日や行事で土日に授業がある場合もここで設定してください。
                    </div>
                    <div class="timetable-list-controls" style="display: flex; gap: 15px; align-items: center; margin-bottom: 15px; flex-wrap: wrap;">
                        <div class="timetable-tabs" style="display: flex; gap: 5px;">
                            <button class="tt-tab ${this.activeTimetable === 'my' ? 'active' : ''}" data-tt="my" id="ttListTabMy">自分の時間割</button>
                            <button class="tt-tab ${this.activeTimetable === 'class' ? 'active' : ''}" data-tt="class" id="ttListTabClass">クラス時間割</button>
                        </div>
                        <div style="display: flex; gap: 5px; align-items: center;">
                            <button class="btn btn-sm" id="ttListPrevWeekBtn">◀ 前の週</button>
                            <button class="btn btn-sm" id="ttListNextWeekBtn">次の週 ▶</button>
                        </div>
                        <div style="display: flex; gap: 10px; align-items: center;">
                            <input type="date" id="ttListStartDate" value="${startStr}">
                            <span>〜</span>
                            <input type="date" id="ttListEndDate" value="${endStr}">
                            <button class="btn btn-sm" id="ttListRefreshBtn">表示</button>
                        </div>
                    </div>
                    <div id="timetableListContent">
                        <!-- 一覧テーブルがここに描画される -->
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // イベント設定
        document.getElementById('closeTimetableListModal').addEventListener('click', () => {
            modal.remove();
        });

        document.getElementById('saveTimetableListBtn').addEventListener('click', () => {
            this.saveData();
            // 保存完了トーストを表示
            const existing = modal.querySelector('.tt-save-toast');
            if (existing) existing.remove();
            const toast = document.createElement('div');
            toast.className = 'tt-save-toast';
            toast.textContent = '✅ 保存しました';
            toast.style.cssText = 'position:absolute;top:60px;left:50%;transform:translateX(-50%);background:#16a34a;color:white;padding:8px 20px;border-radius:6px;font-weight:bold;z-index:9999;font-size:0.95em;';
            modal.querySelector('.modal-content').style.position = 'relative';
            modal.querySelector('.modal-content').appendChild(toast);
            setTimeout(() => toast.remove(), 2000);
        });

        document.getElementById('resetTimetableChangesBtn').addEventListener('click', () => {
            if (!confirm('表示中の期間の変更データを全て削除してベースに戻しますか？\n（ベース時間割の設定は消えません）')) return;
            const startStr = document.getElementById('ttListStartDate')?.value;
            const endStr = document.getElementById('ttListEndDate')?.value;
            if (!startStr || !endStr) return;
            const start = new Date(startStr);
            const end = new Date(endStr);
            const type = this.activeTimetable;
            if (!this.dailyChanges[type]) this.dailyChanges[type] = {};
            for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
                const dateKey = this._formatDate(new Date(d));
                delete this.dailyChanges[type][dateKey];
            }
            this.saveData();
            this._renderTimetableList();
        });

        document.getElementById('ttListTabMy').addEventListener('click', () => {
            this.activeTimetable = 'my';
            this._renderTimetableList();
        });

        document.getElementById('ttListTabClass').addEventListener('click', () => {
            this.activeTimetable = 'class';
            this._renderTimetableList();
        });

        document.getElementById('ttListRefreshBtn').addEventListener('click', () => {
            this._renderTimetableList();
        });

        // 前の週・次の週ボタン
        document.getElementById('ttListPrevWeekBtn').addEventListener('click', () => {
            this._moveTimetableListWeek(-1);
        });
        document.getElementById('ttListNextWeekBtn').addEventListener('click', () => {
            this._moveTimetableListWeek(1);
        });

        // 初回描画
        this._renderTimetableList();
    },

    /**
     * 時間割一覧の期間を週単位で移動
     */
    _moveTimetableListWeek(offset) {
        const startInput = document.getElementById('ttListStartDate');
        const endInput = document.getElementById('ttListEndDate');
        if (!startInput || !endInput) return;

        const start = new Date(startInput.value);
        const end = new Date(endInput.value);

        start.setDate(start.getDate() + (offset * 7));
        end.setDate(end.getDate() + (offset * 7));

        startInput.value = this._formatDateForInput(start);
        endInput.value = this._formatDateForInput(end);

        this._renderTimetableList();
    },

    _formatDateForInput(date) {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    },

    /**
     * 時間割一覧テーブルを描画
     */
    _renderTimetableList() {
        const container = document.getElementById('timetableListContent');
        if (!container) return;

        const startStr = document.getElementById('ttListStartDate')?.value;
        const endStr = document.getElementById('ttListEndDate')?.value;
        if (!startStr || !endStr) return;

        const start = new Date(startStr);
        const end = new Date(endStr);

        // 設定から曜日ごとの時限数を取得
        const data = window.StorageManager?.getCurrentData() || {};
        const periodsPerDay = data.appSettings?.periodsPerDay || { mon: 6, tue: 6, wed: 6, thu: 6, fri: 6 };

        // 日付リストを生成（指定期間全て、土日含む）
        const dates = [];
        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
            dates.push(new Date(d));
        }

        if (dates.length === 0) {
            container.innerHTML = '<p>表示する日付がありません</p>';
            return;
        }

        // 行事データを取得
        const events = window.CalendarModule?.events || [];

        // タブ状態の更新
        document.getElementById('ttListTabMy').className = `tt-tab ${this.activeTimetable === 'my' ? 'active' : ''}`;
        document.getElementById('ttListTabClass').className = `tt-tab ${this.activeTimetable === 'class' ? 'active' : ''}`;

        // ベース時間割
        const baseTimetable = this.activeTimetable === 'class' ? this.classTimetable : this.myTimetable;
        const changes = this.dailyChanges[this.activeTimetable] || {};

        // 最大時限数 (6限まで + 7限目(放課後))
        const maxPeriods = 7;

        // テーブル生成
        let html = '<table class="timetable-list-table"><thead><tr><th>時限</th>';
        dates.forEach(d => {
            const dayNames = ['日', '月', '火', '水', '木', '金', '土'];
            const dayOfWeek = d.getDay();
            const dayClass = dayOfWeek === 0 ? 'sunday' : (dayOfWeek === 6 ? 'saturday' : '');
            const dateStr = `${d.getMonth() + 1}/${d.getDate()}(${dayNames[dayOfWeek]})`;
            html += `<th class="date-header ${dayClass}">${dateStr}</th>`;
        });
        html += '</tr></thead><tbody>';

        // 行事行
        html += '<tr class="event-row"><td>行事</td>';
        dates.forEach(d => {
            const dateKey = this._formatDate(d);
            const dayEvents = events.filter(e => {
                const eStart = new Date(e.start);
                const eEnd = e.end ? new Date(e.end) : eStart;
                return d >= new Date(eStart.getFullYear(), eStart.getMonth(), eStart.getDate()) &&
                    d <= new Date(eEnd.getFullYear(), eEnd.getMonth(), eEnd.getDate());
            });
            const eventText = dayEvents.map(e => e.title).join(', ');
            html += `<td class="event-cell">${eventText || ''}</td>`;
        });
        html += '</tr>';

        // 時限行
        for (let p = 0; p < maxPeriods; p++) {
            let periodLabel = (p === 6) ? '放課後' : `${p + 1}限`;
            let fontSizeStyle = (p === 6) ? 'font-size:0.8em;' : '';
            html += `<tr><td class="period-cell" style="${fontSizeStyle}">${periodLabel}</td>`;
            dates.forEach(d => {
                const dayOfWeek = d.getDay();
                const dayKey = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][dayOfWeek];
                const dateKey = this._formatDate(d);
                const periods = periodsPerDay[dayKey] !== undefined ? periodsPerDay[dayKey] : 0;

                // 変更データがある場合はセルの存在を許可する（手動設定対応）
                // キーは0ベース（p）で管理、data-periodは1ベース（p+1）でダッシュボードと統一
                const hasChange = changes[dateKey] && changes[dateKey][p] !== undefined;

                // 土日でもセルは常にクリック可能（強制設定可能）
                const forceEnabled = true;

                if (p >= periods && !hasChange && !forceEnabled) {
                    html += '<td class="disabled-cell"></td>';
                    return;
                }

                // 変更があればそれを表示、なければベース
                let value = '';
                if (changes[dateKey] && changes[dateKey][p] !== undefined) {
                    value = changes[dateKey][p];
                } else {
                    value = baseTimetable[dayKey]?.[p] || '';
                }
                const isChanged = changes[dateKey] && changes[dateKey][p] !== undefined;
                const dayClass = dayOfWeek === 0 ? 'sunday-cell' : (dayOfWeek === 6 ? 'saturday-cell' : '');

                // data-periodは0ベース（pをそのまま使用）
                html += `<td class="tt-list-cell ${isChanged ? 'changed' : ''} ${dayClass}" data-date="${dateKey}" data-period="${p}">${escapeHtml(value)}</td>`;
            });
            html += '</tr>';
        }

        // 操作行
        html += '<tr class="action-row"><td>操作</td>';
        dates.forEach(d => {
            const dateKey = this._formatDate(d);
            html += `<td>
                <button class="btn-icon tt-clear-btn" data-date="${dateKey}" title="空にする">🗑️</button>
                <button class="btn-icon tt-reset-btn" data-date="${dateKey}" title="ベースに戻す">↩️</button>
            </td>`;
        });
        html += '</tr>';

        html += '</tbody></table>';
        container.innerHTML = html;

        // セルクリックイベント
        container.querySelectorAll('.tt-list-cell').forEach(cell => {
            cell.addEventListener('click', () => {
                this._openSubjectPicker(cell.dataset.date, parseInt(cell.dataset.period), cell);
            });
        });

        // 一括削除ボタン
        container.querySelectorAll('.tt-clear-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this._clearDaySchedule(btn.dataset.date);
            });
        });

        // ベースに戻すボタン
        container.querySelectorAll('.tt-reset-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this._resetDayToBase(btn.dataset.date);
            });
        });
    },

    /**
     * 科目選択ポップアップを開く
     */
    _openSubjectPicker(dateKey, period, cell) {
        document.querySelector('.subject-picker-popup')?.remove();

        const subjects = this.activeTimetable === 'class' ? this.classSubjects : this.mySubjects;

        const popup = document.createElement('div');
        popup.className = 'subject-picker-popup';
        popup.innerHTML = `
            <div class="subject-picker-header">科目を選択</div>
            <div class="subject-picker-list">
                <div class="subject-item" data-subject="">（空欄）</div>
                ${subjects.map(s => `<div class="subject-item" data-subject="${escapeHtml(s)}">${escapeHtml(s)}</div>`).join('')}
            </div>
        `;

        // 位置調整
        const rect = cell.getBoundingClientRect();
        popup.style.position = 'fixed';
        popup.style.left = `${rect.left}px`;
        popup.style.top = `${rect.bottom + 5}px`;

        document.body.appendChild(popup);

        // 科目選択
        popup.querySelectorAll('.subject-item').forEach(item => {
            item.addEventListener('click', () => {
                const subject = item.dataset.subject;
                this._setDayPeriodValue(dateKey, period, subject);
                popup.remove();
                // 保存後に一覧を再描画して反映確認
                this._renderTimetableList();
            });
        });

        // 外側クリックで閉じる
        setTimeout(() => {
            document.addEventListener('click', function closePopup(e) {
                if (!popup.contains(e.target) && e.target !== cell) {
                    popup.remove();
                    document.removeEventListener('click', closePopup);
                }
            });
        }, 0);
    },

    _setDayPeriodValue(dateKey, period, value) {
        if (!this.dailyChanges[this.activeTimetable]) {
            this.dailyChanges[this.activeTimetable] = {};
        }
        if (!this.dailyChanges[this.activeTimetable][dateKey]) {
            this.dailyChanges[this.activeTimetable][dateKey] = {};
        }
        // periodは0ベース（data-period属性のpをそのまま受け取る）
        this.dailyChanges[this.activeTimetable][dateKey][period] = value;
        this.saveData();
    },

    _clearDaySchedule(dateKey) {
        if (!confirm(`${dateKey} の時間割を全て空にしますか？`)) return;
        const data = window.StorageManager?.getCurrentData() || {};
        const periodsPerDay = data.appSettings?.periodsPerDay || { mon: 6, tue: 6, wed: 6, thu: 6, fri: 6 };
        const d = new Date(dateKey);
        const dayKey = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][d.getDay()];
        const periods = periodsPerDay[dayKey] || 6;

        if (!this.dailyChanges[this.activeTimetable]) {
            this.dailyChanges[this.activeTimetable] = {};
        }
        this.dailyChanges[this.activeTimetable][dateKey] = {};
        for (let p = 0; p < periods; p++) {
            this.dailyChanges[this.activeTimetable][dateKey][p] = '';
        }
        this.saveData();
        this._renderTimetableList();
    },

    _resetDayToBase(dateKey) {
        if (!confirm(`${dateKey} の時間割をベースに戻しますか？`)) return;
        if (this.dailyChanges[this.activeTimetable]) {
            delete this.dailyChanges[this.activeTimetable][dateKey];
        }
        this.saveData();
        this._renderTimetableList();
    },

    // 今週の時間割をA4横で印刷（メモ欄付き）
    printTimetableForWeek() {
        const weeks = this._generateWeeks(3);
        if (weeks.length === 0) return;

        const week = weeks[0];
        const appData = StorageManager.getCurrentData();
        // this.dailyChanges はロード済みの最新データ
        const dailyChanges = this.dailyChanges[this.activeTimetable] || {};
        const timetable = this.activeTimetable === 'my' ? this.myTimetable : this.classTimetable;

        // 用紙サイズ：A4横（210mm x 297mm）
        let html = `<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>時間割印刷</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        @page { size: A4 landscape; margin: 8mm; }
        body { font-family: 'Hiragino Sans', 'Arial', sans-serif; font-size: 11px; }

        /* 時間割テーブル */
        .tt-title { background: #4f46e5; color: white; padding: 4px 8px; font-weight: bold; font-size: 12px; border-radius: 4px 4px 0 0; }
        table.tt { width: 100%; border-collapse: collapse; border: 2px solid #333; border-top: none; table-layout: fixed; }
        table.tt td, table.tt th { border: 1px solid #bbb; padding: 3px 4px; vertical-align: middle; }
        table.tt th.day-head { text-align: center; font-size: 13px; background: #eef2ff; padding: 4px; }
        table.tt td.lbl { background: #f0f0f0; text-align: center; width: 58px; font-weight: bold; font-size: 11px; white-space: nowrap; }
        table.tt td.lbl .lbl-time { font-size: 8px; font-weight: normal; color: #666; display: block; }
        table.tt td.cell { background: #f8f9ff; font-size: 12px; font-weight: bold; }
        table.tt td.cell-empty { background: #f0f0f0; }
        table.tt td.cell-memo { background: #fff5f5; font-size: 11px; font-weight: bold; color: #dc2626; }
        table.tt td.cell-changed { background: #fffbeb; }
        table.tt td.cell-memo-overlay, .cell-memo-overlay { display: block; font-size: 11px; font-weight: bold; color: #dc2626; }
        table.tt tr.after td.lbl { background: #fef3c7; color: #92400e; border-top: 2px solid #999; }
        table.tt tr.after td { background: #fef9c3; border-top: 2px solid #999; font-size: 11px; color: #92400e; }

        /* メモ欄（時間割テーブルと列幅を揃えるためtable使用） */
        table.memo { width: 100%; border-collapse: collapse; margin-top: 6px; table-layout: fixed; }
        table.memo td { border: 2px solid #333; padding: 4px 5px; vertical-align: top; height: 43mm; }
        table.memo td.memo-lbl { background: #f0f0f0; width: 58px; text-align: center; font-weight: bold; font-size: 11px; border-right: 2px solid #333; }
        table.memo th { border: 2px solid #333; background: #eef2ff; text-align: center; font-size: 13px; padding: 4px; }
        table.memo th.memo-lbl-head { width: 58px; background: #f0f0f0; border-right: 2px solid #333; }
        table.memo td.next-week { height: 10mm !important; vertical-align: top; padding: 3px 5px; font-size: 10px; color: #555; }

        /* ToDoリスト */
        .todo-section { margin-top: 6px; border: 1px solid #bbb; border-radius: 4px; padding: 5px 8px; }
        .todo-title { font-weight: bold; font-size: 11px; color: #444; margin-bottom: 4px; border-bottom: 1px solid #ddd; padding-bottom: 2px; }
        .todo-list { display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 2px 8px; }
        .todo-item { font-size: 10px; display: flex; align-items: center; gap: 3px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
        .todo-item.important { color: #dc2626; font-weight: bold; }
        .todo-check { width: 10px; height: 10px; border: 1px solid #999; display: inline-block; border-radius: 2px; flex-shrink: 0; }
    </style>
</head>
<body>
`;

        // 月〜金を処理
        const dayKeys = ['mon', 'tue', 'wed', 'thu', 'fri'];
        const dayNames = ['月', '火', '水', '木', '金'];
        const weekKey = this._formatDate(week[0]);
        const typeMemos = (this.dashboardMemos[this.activeTimetable] || {})[weekKey] || {};
        const periodTimes = (appData.appSettings || {}).periodTimes || {};
        const maxPeriods = Math.max(...week.map(d => this._getPeriodCountForDay(d)));

        // 各曜日の日付・データを事前収集
        const dayData = week.slice(0, 5).map((date, dayIndex) => {
            const dayKey = dayKeys[dayIndex];
            const dateStr = this._formatDate(date);
            const periodCount = this._getPeriodCountForDay(date);
            const dayTimetable = timetable[dayKey] || [];
            const changedDay = dailyChanges[dateStr] || {};
            return { date, dayKey, dateStr, periodCount, dayTimetable, changedDay };
        });

        // 時間割テーブル
        html += `<div class="tt-title">時間割（${this.activeTimetable === 'my' ? '自分の時間割' : 'クラス時間割'}）</div>
        <table class="tt">
          <thead><tr>
            <th class="lbl" style="width:58px;"></th>`;

        dayData.forEach(({ date }, i) => {
            const m = date.getMonth() + 1, d = date.getDate();
            html += `<th class="day-head">${dayNames[i]} <span style="font-size:10px;font-weight:normal;">${m}/${d}</span></th>`;
        });
        html += `</tr></thead><tbody>`;

        // 登校前行（periodIndex=-1 で保存されている）
        html += `<tr class="after"><td class="lbl">登校前</td>`;
        dayData.forEach(({ dateStr }) => {
            const beforeMemo = (typeMemos[dateStr] || {})[-1] || '';
            html += `<td>${beforeMemo}</td>`;
        });
        html += `</tr>`;

        // 時限行（優先: メモ > 時間割変更 > 基本時間割）
        for (let p = 1; p <= maxPeriods; p++) {
            const t = periodTimes[p] || {};
            const timeStr = t.start ? (t.end ? `${t.start}〜${t.end}` : t.start) : '';
            html += `<tr><td class="lbl">${p}限${timeStr ? `<span class="lbl-time">${timeStr}</span>` : ''}</td>`;
            dayData.forEach(({ periodCount, dayTimetable, changedDay, dateStr }) => {
                if (p > periodCount) {
                    html += `<td class="cell-empty"></td>`;
                } else {
                    const base = dayTimetable[p - 1] || '';
                    const changed = changedDay[p - 1];
                    // 時間割変更があれば変更後、なければ基本
                    const subject = (changed !== undefined && changed !== null) ? changed : base;
                    const memo = (typeMemos[dateStr] || {})[p - 1];
                    const hasMemo = memo !== undefined && memo !== null && memo !== '';
                    const isChanged = (changed !== undefined && changed !== null && changed !== base);
                    if (hasMemo) {
                        // メモをオーバーレイ表示
                        html += `<td class="cell${isChanged ? ' cell-changed' : ''}" style="position:relative;">
                            <span style="color:#64748b;font-size:10px;">${subject}</span>
                            <span class="cell-memo-overlay">${memo}</span>
                        </td>`;
                    } else if (isChanged) {
                        html += `<td class="cell cell-changed">${subject}</td>`;
                    } else {
                        html += `<td class="cell">${subject}</td>`;
                    }
                }
            });
            html += `</tr>`;
        }

        // 放課後行（periodIndex=6 で保存されている）
        html += `<tr class="after"><td class="lbl">放課後</td>`;
        dayData.forEach(({ dateStr }) => {
            const afterMemo = (typeMemos[dateStr] || {})[6] || '';
            html += `<td>${afterMemo}</td>`;
        });
        html += `</tr></tbody></table>

        <!-- メモ欄（時間割と列幅を揃えたtable） -->
        <table class="memo">
          <thead><tr>
            <th class="memo-lbl-head"></th>`;

        dayData.forEach(({ date }, i) => {
            const m = date.getMonth() + 1, d = date.getDate();
            html += `<th>${dayNames[i]} ${m}/${d}</th>`;
        });
        html += `</tr></thead>
          <tbody><tr>
            <td class="memo-lbl">メモ</td>`;
        for (let i = 0; i < 5; i++) {
            html += `<td></td>`;
        }
        html += `</tr>`;

        // 次週の日付行
        const nextWeek = weeks[1] || [];
        html += `<tr><td class="memo-lbl" style="font-size:10px;height:10mm;">来週</td>`;
        for (let i = 0; i < 5; i++) {
            if (nextWeek[i]) {
                const m = nextWeek[i].getMonth() + 1, d = nextWeek[i].getDate();
                html += `<td style="border:2px solid #333;padding:3px 5px;vertical-align:top;height:10mm;font-size:10px;color:#555;">${dayNames[i]} ${m}/${d}</td>`;
            } else {
                html += `<td style="border:2px solid #333;padding:3px 5px;vertical-align:top;height:10mm;font-size:10px;color:#555;"></td>`;
            }
        }
        html += `</tr>`;

        // 再来週の日付行
        const weekAfterNext = weeks[2] || [];
        html += `<tr><td class="memo-lbl" style="font-size:10px;height:10mm;">再来週</td>`;
        for (let i = 0; i < 5; i++) {
            if (weekAfterNext[i]) {
                const m = weekAfterNext[i].getMonth() + 1, d = weekAfterNext[i].getDate();
                html += `<td style="border:2px solid #333;padding:3px 5px;vertical-align:top;height:10mm;font-size:10px;color:#555;">${dayNames[i]} ${m}/${d}</td>`;
            } else {
                html += `<td style="border:2px solid #333;padding:3px 5px;vertical-align:top;height:10mm;font-size:10px;color:#555;"></td>`;
            }
        }
        html += `</tr></tbody></table>`;

        const todos = (appData.todos || []).filter(t => t.type !== 'separator' && !t.completed);
        if (todos.length > 0) {
            html += `<div class="todo-section"><div class="todo-title">✅ ToDoリスト（未完了）</div><div class="todo-list">`;
            todos.forEach(todo => {
                const cls = todo.important ? 'todo-item important' : 'todo-item';
                const due = todo.dueDate ? ` (${todo.dueDate})` : '';
                html += `<div class="${cls}"><span class="todo-check"></span>${todo.text}${due}</div>`;
            });
            html += `</div></div>`;
        }

        html += `</body></html>`;

        // Blobを使って印刷
        try {
            const blob = new Blob([html], { type: 'text/html' });
            const url = URL.createObjectURL(blob);
            const printWindow = window.open(url, '_blank');
            if (printWindow) {
                setTimeout(() => {
                    printWindow.print();
                    setTimeout(() => {
                        URL.revokeObjectURL(url);
                    }, 1000);
                }, 500);
            } else {
                alert('ポップアップがブロックされています。ブラウザの設定を確認してください。');
            }
        } catch (e) {
            console.error('印刷エラー:', e);
            alert('印刷に失敗しました: ' + e.message);
        }
    },

    // 指定日の時限数を取得（設定から）
    _getPeriodCountForDay(date) {
        const data = StorageManager.getCurrentData();
        const settings = data.appSettings || {};
        const periodsPerDay = settings.periodsPerDay || {};
        const dayOfWeek = date.getDay();
        const dayName = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][dayOfWeek];
        return periodsPerDay[dayName] || 6;
    }
};

if (typeof window !== 'undefined') {
    window.ScheduleModule = ScheduleModule;
}
