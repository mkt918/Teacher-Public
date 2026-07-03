// ===== 保護者会時間決定ツールモジュール (希望時間管理) =====

Object.assign(MeetingModule, {

    currentEditingStudentId: null,

    // 希望時間モーダルを開く
    openPreferenceModal(studentId) {
        this.currentEditingStudentId = studentId;
        const data = StorageManager.getCurrentData();
        const student = data.students.find(s => s.id === studentId);
        if (!student) return;

        const titleEl = document.getElementById('preferenceModalTitle');
        if (titleEl) titleEl.innerText = `${student.nameKanji}さんの希望時間`;

        const container = document.getElementById('preferenceSlotsGrid');
        if (!container) return;

        const slots = (data.meeting && data.meeting.slots) ? data.meeting.slots : [];
        if (slots.length === 0) {
            container.innerHTML = '<p class="text-danger">まず「日程設定」を行ってください</p>';
            return;
        }

        const prefs = (data.meeting && data.meeting.studentPreferences && data.meeting.studentPreferences[studentId]) || [];

        // グループ化して表示
        const grouped = {};
        slots.forEach(slot => {
            if (!grouped[slot.date]) grouped[slot.date] = [];
            grouped[slot.date].push(slot);
        });

        const dates = Object.keys(grouped).sort();
        const times = grouped[dates[0]].map(s => s.time);

        let html = `
            <div class="meeting-matrix pref-matrix">
                <div class="matrix-header-row">
                    <div class="matrix-corner">時間 / 日付</div>
                    ${dates.map(date => {
            const d = new Date(date);
            return `
                            <div class="matrix-header-date">
                                <div>${d.getMonth() + 1}/${d.getDate()} (${['日', '月', '火', '水', '木', '金', '土'][d.getDay()]})</div>
                                <div style="display: flex; justify-content: center; gap: 2px;">
                                    <button class="col-select-btn" onclick="window.MeetingModule.toggleColumnPref('${escapeHtml(date)}', true)">全選択</button>
                                    <button class="col-select-btn" onclick="window.MeetingModule.toggleColumnPref('${escapeHtml(date)}', false)">解除</button>
                                </div>
                            </div>
                        `;
        }).join('')}
                </div>
        `;

        times.forEach(time => {
            html += `
                <div class="matrix-row">
                    <div class="matrix-time-header">${escapeHtml(time)}</div>
                    ${dates.map(date => {
                const slot = grouped[date].find(s => s.time === time);
                const isSelected = prefs.includes(slot.id);
                return `<div class="matrix-slot pref-slot ${isSelected ? 'selected' : ''}" data-slot-id="${escapeHtml(slot.id)}" data-date="${escapeHtml(date)}">${isSelected ? '〇' : ''}</div>`;
            }).join('')}
                </div>
            `;
        });

        html += '</div>';
        container.innerHTML = html;

        // クリックイベント
        container.querySelectorAll('.pref-slot').forEach(el => {
            el.addEventListener('click', () => {
                el.classList.toggle('selected');
                el.innerText = el.classList.contains('selected') ? '〇' : '';
            });
        });

        document.getElementById('meetingPreferenceModal').classList.add('active');
    },

    // 希望時間を保存
    savePreference() {
        if (!this.currentEditingStudentId) return;

        const selectedSlotIds = Array.from(document.querySelectorAll('.pref-slot.selected'))
            .map(el => el.dataset.slotId);

        const data = StorageManager.getCurrentData();
        if (!data.meeting) data.meeting = {};
        if (!data.meeting.studentPreferences) data.meeting.studentPreferences = {};

        data.meeting.studentPreferences[this.currentEditingStudentId] = selectedSlotIds;

        StorageManager.updateCurrentData(data);
        document.getElementById('meetingPreferenceModal').classList.remove('active');
        this.render();
    },

    // 自動配置ロジック
    autoAssignSlots() {
        const data = StorageManager.getCurrentData();
        if (!data.meeting || !data.meeting.slots || data.meeting.slots.length === 0) {
            alert('まず日程設定を行ってください');
            return;
        }

        if (!confirm('希望時間をもとに全員を自動で配置します。\n（🔒ロック中の生徒・空枠以外は、今の配置がいったんリセットされて再配置されます）\n\nよろしいですか？')) {
            return;
        }

        const slots = data.meeting.slots;
        const students = data.students || [];
        const prefs = data.meeting.studentPreferences || {};
        const lockedSlots = data.meeting.lockedSlots || [];
        const lockedStudents = data.meeting.lockedStudents || [];

        // ロックされている情報を整理
        const lockedSlotIds = new Set(lockedSlots);
        const lockedStudentIds = new Set(lockedStudents.map(ls => {
            const slot = slots.find(s => s.id === ls.slotId);
            return slot ? slot.studentId : null;
        }).filter(id => id));

        // すでに埋まっているがロックされていないスロットをクリア
        slots.forEach(slot => {
            const isStudentLocked = lockedStudents.some(ls => ls.slotId === slot.id);
            if (!isStudentLocked && !lockedSlotIds.has(slot.id)) {
                slot.studentId = null;
            }
        });

        // 配置すべき生徒を抽出
        const studentsToAssign = students.filter(s => !lockedStudentIds.has(s.id));

        // アルゴリズム: 制約が厳しい（希望枠が少ない）生徒から順に埋める
        const studentData = studentsToAssign.map(s => {
            let studentPrefs = prefs[s.id] || [];
            let validPrefs = studentPrefs.filter(id => {
                const slot = slots.find(sl => sl.id === id);
                return slot && !slot.studentId && !lockedSlotIds.has(id);
            });

            return {
                id: s.id,
                name: s.nameKanji,
                prefs: validPrefs,
                prefCount: validPrefs.length === 0 ? 999 : validPrefs.length
            };
        });

        // 希望枠が少ない順にソート
        studentData.sort((a, b) => a.prefCount - b.prefCount);

        let successCount = 0;
        let failStudents = [];

        studentData.forEach(sData => {
            let assigned = false;

            if (sData.prefs.length > 0) {
                for (let slotId of sData.prefs) {
                    const slot = slots.find(sl => sl.id === slotId);
                    if (slot && !slot.studentId) {
                        slot.studentId = sData.id;
                        assigned = true;
                        successCount++;
                        break;
                    }
                }
            }

            if (!assigned) {
                const remainingSlot = slots.find(sl => !sl.studentId && !lockedSlotIds.has(sl.id));
                if (remainingSlot) {
                    remainingSlot.studentId = sData.id;
                    assigned = true;
                    successCount++;
                } else {
                    failStudents.push(sData.name);
                }
            }
        });

        StorageManager.updateCurrentData(data);
        this.render();

        if (failStudents.length > 0) {
            alert(`${successCount}人を配置しました。\n枠が足りない、または希望が重なり配置できなかった生徒: ${failStudents.join(', ')}`);
        } else {
            alert(`${successCount}人の配置が完了しました！`);
        }
    },

    // 列（日付）ごとに一括選択/解除
    toggleColumnPref(date, select) {
        document.querySelectorAll(`.pref-slot[data-date="${date}"]`).forEach(el => {
            if (select) {
                el.classList.add('selected');
                el.innerText = '〇';
            } else {
                el.classList.remove('selected');
                el.innerText = '';
            }
        });
    },

    // 全ての生徒の希望時間をリセット
    resetAllPreferences() {
        if (!confirm('全ての生徒の希望時間をリセットしてもよろしいですか？\nこの操作は取り消せません。')) return;

        const data = StorageManager.getCurrentData();
        if (!data.meeting) data.meeting = {};

        data.meeting.studentPreferences = {};

        StorageManager.updateCurrentData(data);
        this.render();
        alert('全ての希望時間をリセットしました。');
    },

    // 現在の配置が希望通りかチェックする
    checkAssignmentsAgainstPreferences() {
        const data = StorageManager.getCurrentData();
        if (!data.meeting || !data.meeting.slots) {
            alert('スケジュールが設定されていません。');
            return;
        }

        const slots = data.meeting.slots;
        const students = data.students || [];
        const prefs = data.meeting.studentPreferences || {};

        let mismatches = [];
        let unassignedWithPrefs = [];

        // 配置されている生徒のチェック
        slots.forEach(slot => {
            if (slot.studentId) {
                const studentPrefs = prefs[slot.studentId];
                if (studentPrefs && studentPrefs.length > 0) {
                    if (!studentPrefs.includes(slot.id)) {
                        const student = students.find(s => s.id === slot.studentId);
                        mismatches.push(`${student ? student.number + ' ' + student.nameKanji : slot.studentId} (希望外の時間に配置)`);
                    }
                }
            }
        });

        // 配置されていないが希望がある生徒のチェック
        const assignedStudentIds = new Set(slots.map(s => s.studentId).filter(id => id));
        students.forEach(s => {
            if (!assignedStudentIds.has(s.id)) {
                const studentPrefs = prefs[s.id];
                if (studentPrefs && studentPrefs.length > 0) {
                    unassignedWithPrefs.push(`${s.number} ${s.nameKanji} (未配置)`);
                }
            }
        });

        if (mismatches.length === 0 && unassignedWithPrefs.length === 0) {
            alert('✅ 全ての生徒が希望通りの時間に配置されている、または希望が設定されていません。');
        } else {
            let message = '⚠️ 以下の項目を確認してください:\n\n';
            if (mismatches.length > 0) {
                message += '【希望と異なる配置】\n' + mismatches.join('\n') + '\n\n';
            }
            if (unassignedWithPrefs.length > 0) {
                message += '【希望があるのに未配置】\n' + unassignedWithPrefs.join('\n');
            }
            alert(message);
        }
    }
});
