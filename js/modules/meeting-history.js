// ===== 保護者会時間決定ツールモジュール (履歴管理) =====

Object.assign(MeetingModule, {

    openHistoryModal() {
        this.renderHistoryList();
        document.getElementById('meetingHistoryModal').classList.add('active');
    },

    closeHistoryModal() {
        document.getElementById('meetingHistoryModal').classList.remove('active');
    },

    renderHistoryList() {
        const container = document.getElementById('meetingHistoryList');
        if (!container) return;

        const data = StorageManager.getCurrentData();
        const history = (data.meeting && data.meeting.history) || [];

        let html = `
            <div style="margin-bottom: 20px; padding: 15px; background: #f1f5f9; border-radius: 8px;">
                <h4 style="margin-top:0;">現在の状態を保存</h4>
                <div style="display: flex; gap: 10px;">
                    <input type="text" id="newMeetingHistoryName" placeholder="例: 1学期末面談" class="form-control" style="flex:1;">
                    <button class="btn btn-primary" onclick="window.MeetingModule.saveCurrentToHistory()">保存</button>
                </div>
            </div>
            <h4>保存済みスケジュール</h4>
        `;

        if (history.length === 0) {
            html += '<div class="empty-state-small"><p>保存された履歴はありません</p></div>';
        } else {
            history.forEach((item, i) => {
                html += `
                    <div class="history-item">
                        <div class="history-info">
                            <div class="history-name">${escapeHtml(item.name)}</div>
                            <div class="history-meta">${new Date(item.timestamp).toLocaleString('ja-JP')}</div>
                        </div>
                        <div class="history-actions">
                            <button class="btn btn-sm btn-outline-primary" onclick="window.MeetingModule.loadFromHistory(${i})">読取</button>
                            <button class="btn btn-sm btn-outline-danger" onclick="window.MeetingModule.deleteHistory(${i})">削除</button>
                        </div>
                    </div>
                `;
            });
        }

        container.innerHTML = html;
    },

    saveCurrentToHistory() {
        const nameInput = document.getElementById('newMeetingHistoryName');
        const name = nameInput.value.trim() || `無題のスケジュール (${new Date().toLocaleTimeString()})`;

        const data = StorageManager.getCurrentData();
        if (!data.meeting) data.meeting = {};
        if (!data.meeting.history) data.meeting.history = [];

        data.meeting.history.unshift({
            name: name,
            timestamp: new Date().toISOString(),
            slots: JSON.parse(JSON.stringify(data.meeting.slots || [])),
            settings: JSON.parse(JSON.stringify(data.meeting.settings || {})),
            lockedSlots: data.meeting.lockedSlots ? [...data.meeting.lockedSlots] : [],
            lockedStudents: data.meeting.lockedStudents ? [...data.meeting.lockedStudents] : [],
            // 生徒ごとの希望時間も一緒に保存する（以前は保存されず、復元時に消えてしまっていた）
            studentPreferences: data.meeting.studentPreferences ? JSON.parse(JSON.stringify(data.meeting.studentPreferences)) : {}
        });

        // 最大10件
        data.meeting.history = data.meeting.history.slice(0, 10);
        StorageManager.updateCurrentData(data);

        // モーダルは閉じず、その場で結果を確認できるようにする
        this.renderHistoryList();
        const freshContainer = document.getElementById('meetingHistoryList');
        if (freshContainer) {
            const successMsg = document.createElement('div');
            successMsg.textContent = '✅ 保存しました（希望時間も一緒に保存されます）';
            successMsg.style.cssText = 'background:#dcfce7; color:#166534; padding:8px 12px; border-radius:6px; font-size:0.85em; font-weight:bold; margin-bottom:12px;';
            freshContainer.insertBefore(successMsg, freshContainer.firstChild);
            setTimeout(() => successMsg.remove(), 2500);
        }
    },

    // 履歴から読み込み
    loadFromHistory(index) {
        const data = StorageManager.getCurrentData();
        const history = (data.meeting && data.meeting.history) || [];

        if (index >= history.length) return;

        const item = history[index];
        if (confirm(`「${item.name}」を読み込みますか？\n現在のスケジュール・希望時間はすべて上書きされます。`)) {
            data.meeting.slots = JSON.parse(JSON.stringify(item.slots || []));
            data.meeting.settings = JSON.parse(JSON.stringify(item.settings || {}));
            data.meeting.lockedSlots = item.lockedSlots ? [...item.lockedSlots] : [];
            data.meeting.lockedStudents = item.lockedStudents ? [...item.lockedStudents] : [];
            data.meeting.studentPreferences = item.studentPreferences ? JSON.parse(JSON.stringify(item.studentPreferences)) : {};
            StorageManager.updateCurrentData(data);
            this.closeHistoryModal();
            this.render();
        }
    },

    deleteHistory(index) {
        if (!confirm('この履歴を削除しますか？')) return;
        const data = StorageManager.getCurrentData();
        data.meeting.history.splice(index, 1);
        StorageManager.updateCurrentData(data);
        this.renderHistoryList();
    }
});
