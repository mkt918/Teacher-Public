// ===== 席替えツールモジュール (コア) =====

const SeatingModule = {
    currentLayout: null,
    rows: 6,
    cols: 7,
    history: [],
    draggedStudent: null,
    isLotteryMode: false,

    // トランプ定義
    suits: [
        { id: 'spade', symbol: '♠', color: 'black', label: 'スペード' },
        { id: 'club', symbol: '♣', color: 'black', label: 'クラブ' },
        { id: 'heart', symbol: '♥', color: 'red', label: 'ハート' },
        { id: 'diamond', symbol: '♦', color: 'red', label: 'ダイヤ' }
    ],

    // くじ引き設定（デフォルト）
    lotterySettings: {
        type: 'cards', // 'cards' or 'numbers'
        cardCounts: { spade: 13, club: 13, heart: 13, diamond: 13 },
        numberRange: { start: 1, end: 40 }
    },

    // 初期化
    init() {
        if (this.initialized) return;
        this.setupEventListeners();
        this.initialized = true;

        // 初めての利用時は使い方ガイドを自動で開く
        try {
            if (!localStorage.getItem('seatingHelpSeen')) {
                const panel = document.getElementById('seatingHelpPanel');
                const btn = document.getElementById('seatingHelpToggleBtn');
                if (panel) panel.style.display = 'block';
                if (btn) btn.classList.add('active');
                localStorage.setItem('seatingHelpSeen', '1');
            }
        } catch (e) { /* localStorage不可でも致命的ではない */ }

        console.log('🪑 Seating Module initialized');
    },

    // イベントリスナーのセットアップ
    setupEventListeners() {
        // 行・列の変更
        const rowsInput = document.getElementById('seatingRows');
        const colsInput = document.getElementById('seatingCols');

        if (rowsInput) {
            rowsInput.addEventListener('change', (e) => {
                this.rows = parseInt(e.target.value) || 6;
                this.render();
            });
        }

        if (colsInput) {
            colsInput.addEventListener('change', (e) => {
                this.cols = parseInt(e.target.value) || 6;
                this.render();
            });
        }

        // ランダム配置ボタン
        const randomBtn = document.getElementById('randomSeatingBtn');
        if (randomBtn) {
            randomBtn.addEventListener('click', () => {
                this.randomArrange();
            });
        }

        // 番号順に並べるボタン
        const arrangeByNumberBtn = document.getElementById('arrangeByNumberBtn');
        if (arrangeByNumberBtn) {
            arrangeByNumberBtn.addEventListener('click', () => {
                this.arrangeByNumber();
            });
        }

        // クリアボタン
        const clearBtn = document.getElementById('clearSeatingBtn');
        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                this.clearSeating();
            });
        }

        // 印刷ボタン
        const printBtn = document.getElementById('printSeatingBtn');
        if (printBtn) {
            printBtn.addEventListener('click', () => {
                this.printSeating();
            });
        }

        // タブ切り替え
        const tabNormal = document.getElementById('tabNormalMode');
        const tabLottery = document.getElementById('tabLotteryMode');

        if (tabNormal) {
            tabNormal.addEventListener('click', () => {
                this.switchMode('normal');
            });
        }
        if (tabLottery) {
            tabLottery.addEventListener('click', () => {
                this.switchMode('lottery');
            });
        }

        // 席を保存／読取ボタン
        const openSaveHistoryModalBtn = document.getElementById('openSaveHistoryModalBtn');
        if (openSaveHistoryModalBtn) {
            openSaveHistoryModalBtn.addEventListener('click', () => {
                this.openSaveHistoryModal();
            });
        }

        // 使い方ガイドの開閉
        const helpToggleBtn = document.getElementById('seatingHelpToggleBtn');
        if (helpToggleBtn) {
            helpToggleBtn.addEventListener('click', () => {
                const panel = document.getElementById('seatingHelpPanel');
                if (!panel) return;
                const isVisible = panel.style.display !== 'none';
                panel.style.display = isVisible ? 'none' : 'block';
                helpToggleBtn.classList.toggle('active', !isVisible);
            });
        }

        // 未配置リストへのドロップ（配置解除）
        const unassignedContainer = document.getElementById('unassignedStudents');
        if (unassignedContainer) {
            unassignedContainer.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                unassignedContainer.classList.add('drag-over');
            });
            unassignedContainer.addEventListener('dragleave', () => {
                unassignedContainer.classList.remove('drag-over');
            });
            unassignedContainer.addEventListener('drop', (e) => {
                e.preventDefault();
                unassignedContainer.classList.remove('drag-over');
                this.onDropToUnassigned(e);
            });
        }

        // 以下、くじ引き関連のモーダルイベントなどは renderLotteryControls や openLotteryInputModal 内で動的にバインドするか、ここで一括バインドする
        // 今回は要素が動的生成される部分が多いので、生成時にバインドする方針を維持しつつ、
        // 静的なモーダル類はここでバインド

        // モーダルキャンセル（共通）
        const cancelLotteryInputBtn = document.getElementById('cancelLotteryInputBtn');
        if (cancelLotteryInputBtn) {
            cancelLotteryInputBtn.addEventListener('click', () => {
                document.getElementById('lotteryInputModal').classList.remove('active');
            });
        }

        const closeLotteryInputModal = document.getElementById('closeLotteryInputModal');
        if (closeLotteryInputModal) {
            closeLotteryInputModal.addEventListener('click', () => {
                document.getElementById('lotteryInputModal').classList.remove('active');
            });
        }

        // くじ引き反映ボタン
        const reflectBtn = document.getElementById('reflectLotteryResultBtn');
        if (reflectBtn) {
            reflectBtn.addEventListener('click', () => {
                this.reflectLotteryResults();
            });
        }

        // くじ引き入力クリアボタン
        const clearEntryBtn = document.getElementById('clearLotteryInputBtn'); // 変数名重複回避のため変更
        if (clearEntryBtn) {
            clearEntryBtn.addEventListener('click', () => {
                if (confirm('入力された内容を全てクリアしますか？')) {
                    // inputの値をクリア
                    const inputs = document.querySelectorAll('#lotteryInputGrid input');
                    inputs.forEach(input => input.value = '');
                    // 名前表示をクリア
                    const names = document.querySelectorAll('#lotteryInputGrid .name-display');
                    names.forEach(div => div.textContent = '');
                    // 一時データをクリア
                    this.tempLotteryInput = {};
                }
            });
        }
    },

    // 描画
    render() {
        const data = StorageManager.getCurrentData();

        // 現在のレイアウトを取得または初期化
        if (!this.currentLayout) {
            this.currentLayout = data.seating.current || this.createEmptyLayout();
        }

        // タブUIの更新
        const tabNormal = document.getElementById('tabNormalMode');
        const tabLottery = document.getElementById('tabLotteryMode');
        if (tabNormal && tabLottery) {
            if (this.isLotteryMode) {
                tabNormal.classList.remove('active');
                tabLottery.classList.add('active');
            } else {
                tabNormal.classList.add('active');
                tabLottery.classList.remove('active');
            }
        }

        // モードに応じた設定コントロールの制御
        const rowsInput = document.getElementById('seatingRows');
        const colsInput = document.getElementById('seatingCols');
        const seatingControls = document.querySelector('.seating-controls');
        const randomBtn = document.getElementById('randomSeatingBtn');
        const clearBtn = document.getElementById('clearSeatingBtn');

        if (this.isLotteryMode) {
            if (rowsInput) rowsInput.disabled = true;
            if (colsInput) colsInput.disabled = true;
            if (randomBtn) randomBtn.disabled = true;
            if (clearBtn) clearBtn.disabled = true;
            if (seatingControls) seatingControls.classList.add('lottery-active'); // CSSで調整可能に
        } else {
            if (rowsInput) rowsInput.disabled = false;
            if (colsInput) colsInput.disabled = false;
            if (randomBtn) randomBtn.disabled = false;
            if (clearBtn) clearBtn.disabled = false;
            if (seatingControls) seatingControls.classList.remove('lottery-active');
        }

        // 座席表を描画
        if (this.isLotteryMode) {
            this.renderLotteryGrid();
            this.renderLotteryControls();
        } else {
            this.renderSeatingGrid();
            // くじ引き用コントロールパネルが残っていれば削除
            const lotteryPanel = document.getElementById('lotteryControlsPanel');
            if (lotteryPanel) lotteryPanel.remove();
        }

        // 未配置生徒リストを描画
        this.renderUnassignedStudents();

        // 設定値を反映
        if (rowsInput) rowsInput.value = this.rows;
        if (colsInput) colsInput.value = this.cols;
    },

    // 空のレイアウトを作成
    createEmptyLayout() {
        const layout = [];
        for (let r = 0; r < this.rows; r++) {
            const row = [];
            for (let c = 0; c < this.cols; c++) {
                row.push(null);
            }
            layout.push(row);
        }
        return layout;
    },

    // 座席表グリッドを描画
    renderSeatingGrid() {
        const container = document.getElementById('seatingGrid');
        if (!container) return;

        const data = StorageManager.getCurrentData();

        container.innerHTML = '';
        container.style.gridTemplateColumns = `repeat(${this.cols}, 1fr)`;

        for (let r = 0; r < this.rows; r++) {
            for (let c = 0; c < this.cols; c++) {
                const seat = document.createElement('div');
                seat.className = 'seat';
                seat.dataset.row = r;
                seat.dataset.col = c;

                const studentId = this.currentLayout[r] && this.currentLayout[r][c];
                const lockedSeats = data.seating.lockedSeats || [];
                const isLocked = lockedSeats.some(s => s.row === r && s.col === c);

                if (isLocked) seat.classList.add('locked');

                // ロックボタン（鍵アイコン）
                const lockBtn = document.createElement('button');
                lockBtn.className = `seat-lock-btn ${isLocked ? 'active' : ''}`;
                lockBtn.innerHTML = isLocked ? '🔒' : '🔓';
                lockBtn.title = isLocked ? 'ロック解除' : 'ロックする';
                lockBtn.setAttribute('aria-label', lockBtn.title);
                lockBtn.onclick = (e) => {
                    e.stopPropagation();
                    this.toggleLock(r, c);
                };
                seat.appendChild(lockBtn);

                if (studentId) {
                    const student = data.students.find(s => s.id === studentId);
                    if (student) {
                        seat.classList.add('occupied');

                        // 生徒情報をDOM要素として作成
                        const studentDiv = document.createElement('div');
                        studentDiv.className = 'seat-student';
                        studentDiv.draggable = !isLocked;
                        studentDiv.dataset.studentId = studentId;

                        const numberDiv = document.createElement('div');
                        numberDiv.className = 'seat-number';
                        numberDiv.textContent = student.number;

                        const nameDiv = document.createElement('div');
                        nameDiv.className = 'seat-name';
                        nameDiv.textContent = student.nameKanji;

                        studentDiv.appendChild(numberDiv);
                        studentDiv.appendChild(nameDiv);
                        seat.appendChild(studentDiv);

                        // ドラッグイベント (ロックされていない場合のみ)
                        if (!isLocked) {
                            studentDiv.addEventListener('dragstart', (e) => {
                                this.onDragStart(e, studentId, r, c);
                            });
                        }
                    }
                } else {
                    const emptyDiv = document.createElement('div');
                    emptyDiv.className = 'seat-empty';
                    emptyDiv.innerText = '空席';
                    seat.appendChild(emptyDiv);
                }

                // ドロップイベント (ロックされていない場合のみ)
                if (!isLocked) {
                    seat.addEventListener('dragover', (e) => {
                        e.preventDefault();
                        seat.classList.add('drag-over');
                    });

                    seat.addEventListener('dragleave', () => {
                        seat.classList.remove('drag-over');
                    });

                    seat.addEventListener('drop', (e) => {
                        e.preventDefault();
                        seat.classList.remove('drag-over');
                        this.onDrop(e, r, c);
                    });
                }

                container.appendChild(seat);
            }
        }

        // 教卓を表示
        this.renderTeacherDesk();
    },

    // 教卓をレンダリング
    renderTeacherDesk() {
        const container = document.getElementById('seatingGrid');
        if (!container) return;

        // 既存の教卓があれば削除
        const oldDesk = document.getElementById('teacherDesk');
        if (oldDesk) oldDesk.remove();

        const desk = document.createElement('div');
        desk.id = 'teacherDesk';
        desk.className = 'teacher-desk';
        desk.innerText = '教卓';

        // グリッドのスタイルを取得して教卓の位置を調整
        // 教卓はグリッドの下に配置するため、親要素に追加するか、グリッド内の特別な行として扱う
        // ここではグリッドの下に配置するために親要素の末尾に追加
        container.parentNode.appendChild(desk);
    },

    // ロックの切り替え
    toggleLock(row, col) {
        const data = StorageManager.getCurrentData();
        if (!data.seating.lockedSeats) data.seating.lockedSeats = [];

        const index = data.seating.lockedSeats.findIndex(s => s.row === row && s.col === col);
        if (index > -1) {
            data.seating.lockedSeats.splice(index, 1);
        } else {
            data.seating.lockedSeats.push({ row, col });
        }

        StorageManager.updateCurrentData(data);
        this.render();
    },

    // 未配置生徒リストを描画
    renderUnassignedStudents() {
        const container = document.getElementById('unassignedStudents');
        if (!container) return;

        const data = StorageManager.getCurrentData();

        // 配置済みの生徒IDを収集
        const assignedIds = new Set();
        for (let r = 0; r < this.rows; r++) {
            for (let c = 0; c < this.cols; c++) {
                const studentId = this.currentLayout[r] && this.currentLayout[r][c];
                if (studentId) {
                    assignedIds.add(studentId);
                }
            }
        }

        // 未配置の生徒を抽出
        const unassigned = data.students.filter(s => !assignedIds.has(s.id));

        if (unassigned.length === 0) {
            container.innerHTML = '<div class="empty-state-small"><p>全員配置済み</p></div>';
            return;
        }

        container.innerHTML = unassigned.map(student => `
            <div class="unassigned-student" draggable="true" data-student-id="${escapeHtml(student.id)}">
                <div class="student-number">${escapeHtml(student.number)}</div>
                <div class="student-name">
                    <div class="name-kanji">${escapeHtml(student.nameKanji)}</div>
                    <div class="name-kana">${escapeHtml(student.nameKana)}</div>
                </div>
            </div>
        `).join('');

        // ドラッグイベント
        container.querySelectorAll('.unassigned-student').forEach(el => {
            el.addEventListener('dragstart', (e) => {
                const studentId = el.dataset.studentId;
                this.onDragStart(e, studentId, null, null);
            });
        });
    },

    // ドラッグ開始
    onDragStart(e, studentId, row, col) {
        this.draggedStudent = {
            id: studentId,
            fromRow: row,
            fromCol: col
        };
        e.dataTransfer.effectAllowed = 'move';
        e.target.style.opacity = '0.5';
    },

    // ドロップ
    onDrop(e, toRow, toCol) {
        if (!this.draggedStudent) return;

        const { id, fromRow, fromCol } = this.draggedStudent;

        // 元の位置から削除（座席からの移動の場合）
        if (fromRow !== null && fromCol !== null) {
            this.currentLayout[fromRow][fromCol] = null;
        }

        // 新しい位置に配置（既存の生徒がいれば入れ替え）
        const existingStudent = this.currentLayout[toRow][toCol];
        this.currentLayout[toRow][toCol] = id;

        // 入れ替えの場合、元の位置に移動
        if (existingStudent && fromRow !== null && fromCol !== null) {
            this.currentLayout[fromRow][fromCol] = existingStudent;
        }

        // データを保存
        this.saveCurrentLayout();

        // 再描画
        this.render();

        this.draggedStudent = null;
    },

    // 未配置リストへドロップ（座席からの配置解除）
    onDropToUnassigned(e) {
        if (!this.draggedStudent) return;

        const { fromRow, fromCol } = this.draggedStudent;

        // 座席からの移動のみ処理
        if (fromRow !== null && fromCol !== null) {
            this.currentLayout[fromRow][fromCol] = null;
            this.saveCurrentLayout();
            this.render();
        }

        this.draggedStudent = null;
    },

    // ランダム配置
    randomArrange() {
        if (!confirm('生徒をランダムに座席へ割り当てます。\n（🔒ロック中の座席は変わりません）\n\nよろしいですか？')) {
            return;
        }

        const data = StorageManager.getCurrentData();
        const lockedSeats = data.seating.lockedSeats || [];

        // ロックされていない座席の位置と、そこにいる生徒（または空席）を収集
        const availablePositions = [];
        const studentsToShuffle = [];

        // すべての生徒を取得
        const allStudents = [...data.students];
        const lockedStudentIds = new Set();

        // ロックされている座席の生徒を特定
        lockedSeats.forEach(ls => {
            const sid = this.currentLayout[ls.row] && this.currentLayout[ls.row][ls.col];
            if (sid) lockedStudentIds.add(sid);
        });

        // シャッフル対象の生徒（ロックされていない生徒）
        const unassignedStudentsWithIds = allStudents.filter(s => !lockedStudentIds.has(s.id));

        for (let r = 0; r < this.rows; r++) {
            for (let c = 0; c < this.cols; c++) {
                const isLocked = lockedSeats.some(ls => ls.row === r && ls.col === c);
                if (!isLocked) {
                    availablePositions.push({ r, c });
                }
            }
        }

        // 生徒をシャッフル
        for (let i = unassignedStudentsWithIds.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [unassignedStudentsWithIds[i], unassignedStudentsWithIds[j]] = [unassignedStudentsWithIds[j], unassignedStudentsWithIds[i]];
        }

        // 新しいレイアウトに反映（非ロック箇所のみ更新）
        let studentIndex = 0;
        availablePositions.forEach(pos => {
            if (studentIndex < unassignedStudentsWithIds.length) {
                this.currentLayout[pos.r][pos.c] = unassignedStudentsWithIds[studentIndex].id;
                studentIndex++;
            } else {
                this.currentLayout[pos.r][pos.c] = null; // 生徒が足りない場合は空席
            }
        });

        this.saveCurrentLayout();
        this.render();
    },

    // 番号順に並べる（右前から後ろへ）
    arrangeByNumber() {
        if (!confirm('出席番号順に並べ替えます。\n（教卓に近い右前の席から順に、1番→2番→…と配置されます。ロック🔒中の座席は変わりません）\n\nよろしいですか？')) {
            return;
        }

        const data = StorageManager.getCurrentData();
        const lockedSeats = data.seating.lockedSeats || [];

        // ロックされている座席の生徒を特定
        const lockedStudentIds = new Set();
        lockedSeats.forEach(ls => {
            const sid = this.currentLayout[ls.row] && this.currentLayout[ls.row][ls.col];
            if (sid) lockedStudentIds.add(sid);
        });

        // ロックされていない生徒を番号順にソート
        const studentsToArrange = data.students
            .filter(s => !lockedStudentIds.has(s.id))
            .sort((a, b) => a.number.localeCompare(b.number, 'ja', { numeric: true }));

        // ロックされていない座席を教卓側（下）を前として右前から順に収集
        // 列順（右から左）、各列内で行順（下から上＝教卓側が前）
        const availablePositions = [];
        for (let c = this.cols - 1; c >= 0; c--) { // 右から左
            for (let r = this.rows - 1; r >= 0; r--) { // 下から上（教卓側が前）
                const isLocked = lockedSeats.some(ls => ls.row === r && ls.col === c);
                if (!isLocked) {
                    availablePositions.push({ r, c });
                }
            }
        }

        // 番号順に配置
        let studentIndex = 0;
        availablePositions.forEach(pos => {
            if (studentIndex < studentsToArrange.length) {
                this.currentLayout[pos.r][pos.c] = studentsToArrange[studentIndex].id;
                studentIndex++;
            } else {
                this.currentLayout[pos.r][pos.c] = null;
            }
        });

        this.saveCurrentLayout();
        this.render();
    },

    // 座席をクリア
    clearSeating() {
        if (!confirm('すべての座席を空席に戻します。\n（この操作は取り消せません）\n\nよろしいですか？')) {
            return;
        }

        this.currentLayout = this.createEmptyLayout();
        this.saveCurrentLayout();
        this.render();
    },

    // 現在のレイアウトを保存
    saveCurrentLayout() {
        const data = StorageManager.getCurrentData();
        data.seating.current = this.currentLayout;
        data.seating.rows = this.rows;
        data.seating.cols = this.cols;
        StorageManager.updateCurrentData(data);
    },

    // モード切替
    switchMode(mode) {
        this.isLotteryMode = (mode === 'lottery');

        // 保存
        const data = StorageManager.getCurrentData();
        if (!data.seating) data.seating = {};

        // モード状態を保存しておくと、リロード時に復帰できるが、
        // 現状はアプリ仕様としてデフォルトは通常モードかもしれない。
        // ここでは都度切り替えを前提とする。

        this.render();
    },

    // 旧メソッド互換用（削除予定だが安全のためラップ）
    toggleLotteryMode() {
        this.switchMode(this.isLotteryMode ? 'normal' : 'lottery');
    }
};

// グローバルに公開
window.SeatingModule = SeatingModule;
