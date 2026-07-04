// ===== メモモジュール（個人メモ + 生徒メモ） =====

const MemoModule = {
    // 個人メモデータ
    personalMemos: [],

    // 現在選択中のメモ
    currentMemoType: null, // 'personal' or 'student'
    currentMemoId: null,
    currentStudentId: null,

    // 生徒メモアコーディオン状態
    studentAccordionOpen: false,

    initialized: false, // 初期化フラグ

    // 初期化
    init() {
        if (this.initialized) return; // 重複初期化防止

        this.setupEventListeners();
        this.loadPersonalMemos();
        this.initialized = true;
        console.log('📝 Memo Module initialized');
    },

    // イベントリスナーのセットアップ
    setupEventListeners() {
        // 新規メモ追加ボタン
        const addBtn = document.getElementById('addPersonalMemoBtn');
        if (addBtn) {
            // クローンして既存のイベントリスナーを削除するテクニックを使用する場合は注意が必要だが、
            // 今回はinitガードを入れたので単純なaddEventListenerでOK
            addBtn.addEventListener('click', () => this.addNewPersonalMemo());
        }

        // メモ出力
        const exportBtn = document.getElementById('exportMemosBtn');
        if (exportBtn) {
            exportBtn.addEventListener('click', () => this.exportAllMemos());
        }

        // 生徒メモアコーディオンヘッダー
        const accordionHeader = document.getElementById('studentMemoAccordionHeader');
        if (accordionHeader) {
            accordionHeader.addEventListener('click', () => this.toggleStudentAccordion());
        }
    },

    // 描画
    render() {
        this.renderPersonalMemoList();
        this.renderStudentList();
        this.updateAccordionState();

        // 選択中のメモがあればエディタを表示
        if (this.currentMemoType === 'personal' && this.currentMemoId) {
            this.renderPersonalMemoEditor(this.currentMemoId);
        } else if (this.currentMemoType === 'student' && this.currentStudentId) {
            this.renderStudentMemoEditor(this.currentStudentId);
        }
    },

    // ===========================================
    // 個人メモ機能
    // ===========================================
    loadPersonalMemos() {
        const data = StorageManager.getCurrentData();
        this.personalMemos = data.personalMemos || [];
        // データ構造のマイグレーション（必要なら）
        this.personalMemos.forEach(memo => {
            if (typeof memo.isPinned === 'undefined') {
                memo.isPinned = false;
            }
        });
    },

    savePersonalMemos() {
        const data = StorageManager.getCurrentData();
        data.personalMemos = this.personalMemos;
        StorageManager.updateCurrentData(data);
    },

    addNewPersonalMemo() {
        const newMemo = {
            id: Date.now().toString(),
            title: '新規メモ',
            text: '',
            isPinned: false,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        this.personalMemos.unshift(newMemo);
        this.savePersonalMemos();

        // 新しいメモを選択
        this.currentMemoType = 'personal';
        this.currentMemoId = newMemo.id;
        this.currentStudentId = null;

        this.render();
    },

    deletePersonalMemo(id) {
        if (!confirm('このメモを削除しますか？')) return;
        this.personalMemos = this.personalMemos.filter(m => m.id !== id);
        this.savePersonalMemos();

        // 削除したメモが選択中だった場合、選択解除
        if (this.currentMemoId === id) {
            this.currentMemoType = null;
            this.currentMemoId = null;

            // エディタもクリア（または非表示）にするために必要ならDOM操作を追加
            // render()で再描画されるので、currentMemoId=nullにしておけば空の状態が描画されるはず
        }

        this.render();
    },

    // ピン留めの切り替え
    togglePinPersonalMemo(id, event) {
        if (event) {
            event.stopPropagation(); // 親要素のクリックイベント（選択）を停止
        }

        const memo = this.personalMemos.find(m => m.id === id);
        if (memo) {
            memo.isPinned = !memo.isPinned;
            this.savePersonalMemos();
            this.renderPersonalMemoList();
        }
    },

    selectPersonalMemo(id) {
        this.currentMemoType = 'personal';
        this.currentMemoId = id;
        this.currentStudentId = null;
        this.renderPersonalMemoList();
        this.renderStudentList();
        this.renderPersonalMemoEditor(id);
    },

    renderPersonalMemoList() {
        const container = document.getElementById('personalMemoList');
        if (!container) return;

        if (this.personalMemos.length === 0) {
            container.innerHTML = '';
            return;
        }

        // ピン留め順、更新日時順にソート
        const sortedMemos = [...this.personalMemos].sort((a, b) => {
            if (a.isPinned !== b.isPinned) {
                return a.isPinned ? -1 : 1; // ピン留めが先
            }
            // 更新日時降順
            return new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt);
        });

        container.innerHTML = sortedMemos.map(memo => {
            const isActive = this.currentMemoType === 'personal' && this.currentMemoId === memo.id;
            const date = new Date(memo.updatedAt || memo.createdAt);
            const dateStr = `${date.getMonth() + 1}/${date.getDate()}`;
            const preview = memo.text ? memo.text.substring(0, 20) + (memo.text.length > 20 ? '...' : '') : '（空）';

            return `
                <div class="memo-list-item ${isActive ? 'active' : ''}" data-id="${memo.id}" style="padding: 10px; border-radius: 6px; margin-bottom: 5px; cursor: pointer; background: ${isActive ? '#dbeafe' : '#f8f9fa'}; border: 1px solid ${isActive ? '#93c5fd' : '#e0e0e0'}; position: relative;">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 3px;">
                        <span style="font-weight: bold; font-size: 0.9em; flex: 1;">${escapeHtml(memo.title)}</span>
                        <button class="pin-btn" data-id="${memo.id}" style="background: none; border: none; cursor: pointer; padding: 2px 6px; font-size: 1em; border-radius: 4px; transition: all 0.2s; ${memo.isPinned ? 'color: #d97706; background: #fef3c7;' : 'color: #9ca3af; opacity: 0.5;'}" title="${memo.isPinned ? 'ピン留め解除' : 'ピン留めする'}" aria-label="${memo.isPinned ? 'ピン留め解除' : 'ピン留めする'}">
                            ${memo.isPinned ? '📌' : '○'}
                        </button>
                    </div>
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <span style="font-size: 0.75em; color: #666;">${dateStr}</span>
                        <span style="font-size: 0.75em; color: #999; max-width: 100px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(preview)}</span>
                    </div>
                </div>
            `;
        }).join('');

        // クリックイベント
        container.querySelectorAll('.memo-list-item').forEach(item => {
            item.addEventListener('click', (e) => {
                // ピンボタンクリック時はここで止まらず親に伝播しないようにボタン側で処理しているが、
                // 万が一のために確認
                if (e.target.closest('.pin-btn')) return;
                this.selectPersonalMemo(item.dataset.id);
            });
        });

        // ピンボタンイベント
        container.querySelectorAll('.pin-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.togglePinPersonalMemo(btn.dataset.id, e);
            });
        });
    },

    renderPersonalMemoEditor(id) {
        const memo = this.personalMemos.find(m => m.id === id);
        if (!memo) return;

        const container = document.getElementById('memoEditorContainer');
        if (!container) return;

        container.innerHTML = `
            <div class="memo-editor-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                <input type="text" id="memoTitleInput" value="${escapeHtml(memo.title)}" style="font-size: 1.2em; font-weight: bold; border: none; border-bottom: 2px solid #e0e0e0; padding: 5px; flex: 1; outline: none;" />
                <button class="btn btn-secondary btn-sm" id="deleteMemoBtn" style="margin-left: 10px; color: #dc2626;">🗑️ 削除</button>
            </div>
            <textarea 
                id="memoContentTextarea"
                placeholder="メモを入力してください..."
                style="width: 100%; height: calc(100% - 60px); min-height: 300px; padding: 15px; border: 1px solid #ddd; border-radius: 8px; font-size: 1em; line-height: 1.6; resize: vertical;"
            >${escapeHtml(memo.text)}</textarea>
        `;

        // タイトル変更
        const titleInput = document.getElementById('memoTitleInput');
        titleInput.addEventListener('input', (e) => {
            memo.title = e.target.value;
            memo.updatedAt = new Date().toISOString();
            this.savePersonalMemos();
            this.renderPersonalMemoList();
        });

        // 内容変更
        const contentTextarea = document.getElementById('memoContentTextarea');
        contentTextarea.addEventListener('input', (e) => {
            memo.text = e.target.value;
            memo.updatedAt = new Date().toISOString();
            this.savePersonalMemos();
            this.renderPersonalMemoList();
        });

        // 削除ボタン
        document.getElementById('deleteMemoBtn').addEventListener('click', () => {
            this.deletePersonalMemo(id);
        });
    },

    // ===========================================
    // 生徒メモ機能
    // ===========================================
    toggleStudentAccordion() {
        this.studentAccordionOpen = !this.studentAccordionOpen;
        this.updateAccordionState();
    },

    updateAccordionState() {
        const studentList = document.getElementById('memoStudentList');
        const arrow = document.getElementById('studentAccordionArrow');

        if (studentList) {
            studentList.style.display = this.studentAccordionOpen ? 'block' : 'none';
        }
        if (arrow) {
            arrow.textContent = this.studentAccordionOpen ? '▲' : '▼';
        }
    },

    renderStudentList() {
        const container = document.getElementById('memoStudentList');
        if (!container) return;

        const data = StorageManager.getCurrentData();
        const students = data.students || [];
        const memos = data.memos || {};

        if (students.length === 0) {
            container.innerHTML = '<div style="padding: 15px; color: #999; font-size: 0.9em; text-align: center;">生徒名簿から生徒を登録してください</div>';
            return;
        }

        // 番号順にソート
        const sortedStudents = [...students].sort((a, b) =>
            a.number.localeCompare(b.number)
        );

        container.innerHTML = sortedStudents.map(student => {
            const hasMemo = memos[student.id] && (
                (typeof memos[student.id] === 'string' && memos[student.id].trim()) ||
                (Array.isArray(memos[student.id]) && memos[student.id].length > 0)
            );
            const isActive = this.currentMemoType === 'student' && this.currentStudentId === student.id;

            return `
                <div class="memo-student-item ${isActive ? 'active' : ''}" data-id="${student.id}" style="padding: 10px 12px; cursor: pointer; border-bottom: 1px solid #f0f0f0; display: flex; justify-content: space-between; align-items: center; background: ${isActive ? '#dbeafe' : 'transparent'};">
                    <div>
                        <span style="font-weight: bold; color: #374151;">${student.number}</span>
                        <span style="margin-left: 8px;">${escapeHtml(student.nameKanji)}</span>
                    </div>
                    ${hasMemo ? '<span style="color: #0284c7;">📝</span>' : ''}
                </div>
            `;
        }).join('');

        // クリックイベント
        container.querySelectorAll('.memo-student-item').forEach(item => {
            item.addEventListener('click', (e) => {
                this.selectStudent(e.currentTarget.dataset.id);
            });
        });
    },

    selectStudent(studentId) {
        this.currentMemoType = 'student';
        this.currentStudentId = studentId;
        this.currentMemoId = null;
        this.renderPersonalMemoList();
        this.renderStudentList();
        this.renderStudentMemoEditor(studentId);
    },

    renderStudentMemoEditor(studentId) {
        const data = StorageManager.getCurrentData();
        const student = data.students.find(s => s.id === studentId);
        if (!student) return;

        const container = document.getElementById('memoEditorContainer');
        if (!container) return;

        const memoData = data.memos ? data.memos[studentId] : '';
        let memoText = '';

        if (typeof memoData === 'string') {
            memoText = memoData;
        } else if (Array.isArray(memoData)) {
            memoText = memoData.map(m => {
                const date = new Date(m.date);
                const dateStr = `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`;
                return `【${dateStr}】\n${m.content || ''}`;
            }).join('\n\n');
        }

        container.innerHTML = `
            <div class="memo-editor-header" style="margin-bottom: 15px;">
                <h3 style="margin: 0;">${student.number} ${escapeHtml(student.nameKanji)}（${escapeHtml(student.nameKana)}）</h3>
            </div>
            <textarea 
                id="studentMemoTextarea"
                data-student-id="${studentId}"
                placeholder="メモを入力してください...

Markdown記法が使えます：
# 見出し
## 小見出し
- リスト
#タグ（例: #面談 #保護者連絡）"
                style="width: 100%; height: calc(100% - 60px); min-height: 300px; padding: 15px; border: 1px solid #ddd; border-radius: 8px; font-size: 1em; line-height: 1.6; resize: vertical;"
            >${escapeHtml(memoText)}</textarea>
        `;

        // 内容変更
        const textarea = document.getElementById('studentMemoTextarea');
        textarea.addEventListener('input', (e) => {
            this.saveStudentMemo(studentId, e.target.value);
        });
    },

    saveStudentMemo(studentId, text) {
        const data = StorageManager.getCurrentData();
        if (!data.memos) data.memos = {};
        data.memos[studentId] = text;
        StorageManager.updateCurrentData(data);

        // リストのメモアイコンを更新
        this.renderStudentList();
    },

    // 全メモを出力
    exportAllMemos() {
        const data = StorageManager.getCurrentData();
        const students = [...(data.students || [])].sort((a, b) => a.number.localeCompare(b.number));

        let output = '# メモ一括エクスポート\n';
        output += `エクスポート日時: ${new Date().toLocaleString('ja-JP')}\n\n`;

        // 個人メモ
        output += '## 📝 個人メモ\n\n';
        if (this.personalMemos.length === 0) {
            output += '（メモなし）\n\n';
        } else {
            this.personalMemos.forEach(memo => {
                const date = new Date(memo.updatedAt || memo.createdAt);
                const dateStr = `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`;
                const pinMark = memo.isPinned ? '【📌】 ' : '';
                output += `### ${pinMark}${memo.title}（${dateStr}）\n${memo.text || '（空）'}\n\n`;
            });
        }

        output += '---\n\n## 👥 生徒メモ\n\n';

        if (students.length === 0) {
            output += '（生徒データなし）\n\n';
        } else {
            students.forEach(student => {
                const memo = data.memos ? data.memos[student.id] : '';
                output += `### ${student.number} ${student.nameKanji}（${student.nameKana}）\n\n`;
                output += (memo && memo.trim()) ? memo + '\n\n' : '（メモなし）\n\n';
            });
        }

        const blob = new Blob([output], { type: 'text/plain;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `memos-${new Date().toISOString().split('T')[0]}.txt`;
        a.click();
        URL.revokeObjectURL(url);

        alert('メモを出力しました');
    }
};

// グローバルに公開
window.MemoModule = MemoModule;
