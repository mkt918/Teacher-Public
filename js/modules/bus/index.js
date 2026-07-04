/**
 * BusModule - バス座席表作成ツール
 * 
 * 機能:
 * - バスの座席レイアウト設定（座席数、列数など）
 * - 生徒の座席配置（ドラッグ＆ドロップ）
 * - 複数バスの管理
 * - グループごとの色分け
 * - 印刷機能
 */

const BusModule = {
    name: 'BusModule',
    initialized: false,

    // バスの設定
    buses: [],
    currentBusIndex: 0,

    // デフォルトバス設定
    defaultBusConfig: {
        name: 'バス1',
        rows: 12,        // 座席の行数
        seatsPerRow: 4,  // 1行あたりの座席数（通路を挟んで左右2席ずつ）
        driverSide: 'left'
    },

    /**
     * 初期化
     */
    init() {
        if (this.initialized) return;
        this.setupEventListeners();
        this.initialized = true;
        console.log('🚌 BusModule initialized');
    },

    /**
     * イベントリスナーのセットアップ
     */
    setupEventListeners() {
        // バス追加ボタン
        this._setupButton('addBusBtn', () => this.addBus());
        // バス削除ボタン
        this._setupButton('removeBusBtn', () => this.removeBus());
        // ランダム配置ボタン
        this._setupButton('randomBusBtn', () => this.randomArrange());
        // 印刷ボタン
        this._setupButton('printBusBtn', () => this.printBusSeating());
        // 保存／読込ボタン
        this._setupButton('openBusHistoryModalBtn', () => this.openHistoryModal());
    },

    /**
     * ヘルパー: ボタンのセットアップ
     */
    _setupButton(id, callback) {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('click', callback);
        }
    },

    /**
     * 描画
     */
    render() {
        this.loadBuses(); // データ読み込みを必ず実行
        this.renderBusTabs();
        this.renderBusSeating();
        this.renderUnassignedStudents();
        this.renderBusSettings();
    },

    /**
     * バス設定を描画（+/-ボタン付き）
     */
    renderBusSettings() {
        const container = document.querySelector('.bus-settings');
        if (!container || !this.buses[this.currentBusIndex]) return;

        const currentRows = this.buses[this.currentBusIndex].rows || 12;

        container.innerHTML = `
            <div class="bus-rows-control" style="display: flex; align-items: center; gap: 10px; margin: 10px 0;">
                <span style="font-weight: bold;">座席行数:</span>
                <button class="btn-icon bus-rows-dec" aria-label="座席行数を減らす" style="width: 32px; height: 32px; font-size: 18px; border-radius: 50%;">−</button>
                <span id="busRowsDisplay" style="font-size: 1.2em; font-weight: bold; min-width: 30px; text-align: center;">${escapeHtml(String(currentRows))}</span>
                <button class="btn-icon bus-rows-inc" aria-label="座席行数を増やす" style="width: 32px; height: 32px; font-size: 18px; border-radius: 50%;">+</button>
                <span style="font-size: 0.85em; color: #666;">行</span>
            </div>
        `;

        // イベント設定
        container.querySelector('.bus-rows-dec').addEventListener('click', () => {
            if (this.buses[this.currentBusIndex].rows > 1) {
                this.buses[this.currentBusIndex].rows--;
                this.saveBuses();
                this.render();
            }
        });

        container.querySelector('.bus-rows-inc').addEventListener('click', () => {
            if (this.buses[this.currentBusIndex].rows < 20) {
                this.buses[this.currentBusIndex].rows++;
                this.saveBuses();
                this.render();
            }
        });
    },

    /**
     * バスタブを描画
     */
    renderBusTabs() {
        const container = document.getElementById('busTabs');
        if (!container) return;

        container.innerHTML = this.buses.map((bus, index) => `
            <button class="bus-tab ${index === this.currentBusIndex ? 'active' : ''}"
                    data-index="${index}">
                ${escapeHtml(bus.name)}
            </button>
        `).join('');

        // タブクリックイベント
        container.querySelectorAll('.bus-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                this.currentBusIndex = parseInt(tab.dataset.index);
                this.render();
            });
        });
    },

    /**
     * バス座席表を描画（最後部5人席対応）
     */
    renderBusSeating() {
        const container = document.getElementById('busSeatingGrid');
        if (!container) return;

        const bus = this.buses[this.currentBusIndex];
        if (!bus) return;

        // バスらしい外観: 前面ガラス＋運転席＋窓のライン＋座席＋後部窓＋タイヤ
        let html = '<div class="bus-layout">';
        html += `
            <div class="bus-front">
                <div class="bus-windshield">
                    <span class="bus-mirror bus-mirror-left"></span>
                    <span class="bus-mirror bus-mirror-right"></span>
                </div>
                <div class="bus-driver-row">
                    <div class="bus-driver">🚌 運転席</div>
                    <div class="bus-door" title="乗降口">🚪</div>
                </div>
            </div>
            <div class="bus-window-strip"></div>
            <div class="bus-seats-body">
        `;

        for (let row = 0; row < bus.rows; row++) {
            const isLastRow = row === bus.rows - 1;
            html += '<div class="bus-row">';

            if (isLastRow) {
                // 最後列は5席（左 2 + 中央 1 + 右 2）
                for (let col = 0; col < 5; col++) {
                    const seatKey = `${row}-${col}`;
                    const studentId = bus.layout?.[seatKey];
                    html += this._renderBusSeat(row, col, studentId, bus);
                }
            } else {
                // 通常行
                for (let col = 0; col < 2; col++) {
                    const seatKey = `${row}-${col}`;
                    const studentId = bus.layout?.[seatKey];
                    html += this._renderBusSeat(row, col, studentId, bus);
                }
                html += '<div class="bus-aisle"></div>'; // 通路
                for (let col = 2; col < 4; col++) {
                    const seatKey = `${row}-${col}`;
                    const studentId = bus.layout?.[seatKey];
                    html += this._renderBusSeat(row, col, studentId, bus);
                }
            }
            html += '</div>';
        }
        html += '</div>'; // .bus-seats-body
        html += '<div class="bus-rear-window"></div>';
        html += '<div class="bus-wheels"><span class="bus-wheel"></span><span class="bus-wheel"></span></div>';
        html += '</div>'; // .bus-layout

        container.innerHTML = html;
        this._setupBusSeatEvents(container);
    },

    /**
     * バス座席のHTMLを生成
     */
    _renderBusSeat(row, col, studentId, bus) {
        const data = window.StorageManager?.getCurrentData() || {};
        const students = data.students || [];
        const student = studentId ? students.find(s => s.id === studentId) : null;

        const seatKey = `${row}-${col}`;
        const lockedSeats = bus.lockedSeats || [];      // 空席ロック
        const lockedStudents = bus.lockedStudents || []; // 生徒ロック

        if (student) {
            const isLocked = lockedStudents.includes(seatKey);
            return `
                <div class="bus-seat occupied ${isLocked ? 'locked' : ''}" data-row="${row}" data-col="${col}" draggable="${!isLocked}">
                    <button class="bus-seat-lock-btn ${isLocked ? 'active' : ''}" data-row="${row}" data-col="${col}"
                            title="${isLocked ? 'ロック解除' : 'この生徒をロックする'}" aria-label="${isLocked ? 'ロック解除' : 'この生徒をロックする'}">${isLocked ? '🔒' : '🔓'}</button>
                    <div class="seat-number">${escapeHtml(student.number)}</div>
                    <div class="seat-name">${escapeHtml(student.nameKanji)}</div>
                </div>
            `;
        } else {
            const isLocked = lockedSeats.includes(seatKey);
            return `
                <div class="bus-seat empty ${isLocked ? 'locked' : ''}" data-row="${row}" data-col="${col}">
                    <button class="bus-seat-lock-btn ${isLocked ? 'active' : ''}" data-row="${row}" data-col="${col}"
                            title="${isLocked ? '空席ロック解除' : 'この席を空席のままロックする'}" aria-label="${isLocked ? '空席ロック解除' : 'この席を空席のままロックする'}">${isLocked ? '🔒' : '🔓'}</button>
                    <span class="seat-label">${isLocked ? '空席固定' : (row + 1) + '-' + (col + 1)}</span>
                </div>
            `;
        }
    },

    /**
     * バス座席のイベントをセットアップ
     */
    _setupBusSeatEvents(container) {
        const bus = this.buses[this.currentBusIndex];
        if (!bus) return;

        // 占有席のドラッグ（ロックされていない場合のみ）
        container.querySelectorAll('.bus-seat.occupied:not(.locked)').forEach(seat => {
            seat.addEventListener('dragstart', (e) => {
                this.draggedStudent = {
                    id: bus.layout[`${seat.dataset.row}-${seat.dataset.col}`],
                    fromRow: parseInt(seat.dataset.row),
                    fromCol: parseInt(seat.dataset.col)
                };
                e.dataTransfer.effectAllowed = 'move';
                seat.classList.add('dragging');
            });
            seat.addEventListener('dragend', () => {
                seat.classList.remove('dragging');
            });
        });

        // 全席へのドロップ（ロックされている座席は受け付けない）
        container.querySelectorAll('.bus-seat').forEach(seat => {
            const isLocked = seat.classList.contains('locked');
            if (isLocked) return;

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
                this._onDropToSeat(parseInt(seat.dataset.row), parseInt(seat.dataset.col));
            });
        });

        // ロックボタン
        container.querySelectorAll('.bus-seat-lock-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.toggleSeatLock(parseInt(btn.dataset.row), parseInt(btn.dataset.col));
            });
        });
    },

    draggedStudent: null,

    /**
     * 座席ロックの切り替え（空席なら空席ロック、生徒がいれば生徒ロック）
     */
    toggleSeatLock(row, col) {
        const bus = this.buses[this.currentBusIndex];
        if (!bus) return;

        const seatKey = `${row}-${col}`;
        const studentId = bus.layout?.[seatKey];

        if (studentId) {
            // 生徒ロック
            if (!bus.lockedStudents) bus.lockedStudents = [];
            const idx = bus.lockedStudents.indexOf(seatKey);
            if (idx > -1) {
                bus.lockedStudents.splice(idx, 1);
            } else {
                bus.lockedStudents.push(seatKey);
            }
        } else {
            // 空席ロック
            if (!bus.lockedSeats) bus.lockedSeats = [];
            const idx = bus.lockedSeats.indexOf(seatKey);
            if (idx > -1) {
                bus.lockedSeats.splice(idx, 1);
            } else {
                bus.lockedSeats.push(seatKey);
            }
        }

        this.saveBuses();
        this.render();
    },

    /**
     * 座席へのドロップ処理
     */
    _onDropToSeat(toRow, toCol) {
        if (!this.draggedStudent) return;

        const bus = this.buses[this.currentBusIndex];
        if (!bus.layout) bus.layout = {};

        const toKey = `${toRow}-${toCol}`;

        // ロックされた座席（空席ロック・生徒ロックいずれも）には配置できない
        const isTargetLocked = (bus.lockedSeats || []).includes(toKey) || (bus.lockedStudents || []).includes(toKey);
        if (isTargetLocked) {
            this.draggedStudent = null;
            return;
        }

        const { id, fromRow, fromCol } = this.draggedStudent;

        // 元の位置をクリア（座席からの移動の場合）
        if (fromRow !== null && fromCol !== null) {
            const fromKey = `${fromRow}-${fromCol}`;
            // 入れ替え
            const existingStudent = bus.layout[toKey];
            bus.layout[toKey] = id;
            if (existingStudent) {
                bus.layout[fromKey] = existingStudent;
            } else {
                delete bus.layout[fromKey];
            }
        } else {
            // 未配置からの移動
            bus.layout[toKey] = id;
        }

        this.draggedStudent = null;
        this.saveBuses();
        this.render();
    },

    /**
     * 未配置生徒リストを描画
     */
    renderUnassignedStudents() {
        const container = document.getElementById('busUnassigned');
        if (!container) return;

        const data = window.StorageManager?.getCurrentData() || {};
        const students = data.students || [];

        // 全バスに配置済みの生徒IDを収集
        const assignedIds = new Set();
        this.buses.forEach(bus => {
            Object.values(bus.layout || {}).forEach(id => {
                if (id) assignedIds.add(id);
            });
        });

        // 未配置生徒
        const unassigned = students.filter(s => !assignedIds.has(s.id));

        if (unassigned.length === 0) {
            container.innerHTML = '<div class="empty-state-small"><p>全員配置済み</p></div>';
            return;
        }

        container.innerHTML = unassigned.map(student => `
            <div class="unassigned-student" draggable="true" data-student-id="${student.id}">
                <div class="student-number">${escapeHtml(student.number)}</div>
                <div class="student-name">${escapeHtml(student.nameKanji)}</div>
            </div>
        `).join('');

        // ドラッグイベント
        container.querySelectorAll('.unassigned-student').forEach(el => {
            el.addEventListener('dragstart', (e) => {
                this.draggedStudent = {
                    id: el.dataset.studentId,
                    fromRow: null,
                    fromCol: null
                };
                e.dataTransfer.effectAllowed = 'move';
                el.classList.add('dragging');
            });
            el.addEventListener('dragend', () => {
                el.classList.remove('dragging');
            });
        });

        // 未配置エリアへのドロップ（配置解除）
        container.addEventListener('dragover', (e) => {
            e.preventDefault();
            container.classList.add('drag-over');
        });
        container.addEventListener('dragleave', () => {
            container.classList.remove('drag-over');
        });
        container.addEventListener('drop', (e) => {
            e.preventDefault();
            container.classList.remove('drag-over');
            this._onDropToUnassigned();
        });
    },

    /**
     * 未配置エリアへのドロップ処理
     */
    _onDropToUnassigned() {
        if (!this.draggedStudent) return;

        const { fromRow, fromCol } = this.draggedStudent;
        if (fromRow !== null && fromCol !== null) {
            const bus = this.buses[this.currentBusIndex];
            delete bus.layout[`${fromRow}-${fromCol}`];
            this.saveBuses();
            this.render();
        }

        this.draggedStudent = null;
    },

    /**
     * バスを追加
     */
    addBus() {
        const name = prompt('バス名を入力してください', `バス${this.buses.length + 1}`);
        if (!name) return;

        this.buses.push({
            ...this.defaultBusConfig,
            name,
            layout: {}
        });
        this.currentBusIndex = this.buses.length - 1;
        this.saveBuses();
        this.render();
    },

    /**
     * 現在のバスを削除
     */
    removeBus() {
        if (this.buses.length <= 1) {
            alert('最低1台のバスが必要です');
            return;
        }
        if (!confirm(`「${this.buses[this.currentBusIndex].name}」を削除しますか？`)) return;

        this.buses.splice(this.currentBusIndex, 1);
        this.currentBusIndex = Math.min(this.currentBusIndex, this.buses.length - 1);
        this.saveBuses();
        this.render();
    },

    /**
     * ランダム配置（最後列 5 席対応、ロック済み座席・生徒は維持）
     */
    randomArrange() {
        if (!confirm('🔒ロックされていない座席をランダムに入れ替えます。\n（ロック中の生徒・空席固定はそのまま残ります）\n\nよろしいですか？')) return;

        const bus = this.buses[this.currentBusIndex];
        const data = window.StorageManager?.getCurrentData() || {};
        const students = [...(data.students || [])];
        const lockedSeats = bus.lockedSeats || [];
        const lockedStudents = bus.lockedStudents || [];

        // 全バスに配置済みの生徒を収集（他バス配置済み分は対象外）
        const assignedIds = new Set();
        this.buses.forEach((b, idx) => {
            if (idx !== this.currentBusIndex) {
                Object.values(b.layout || {}).forEach(id => {
                    if (id) assignedIds.add(id);
                });
            }
        });

        // このバスでロックされている生徒IDを特定（シャッフル対象から除外）
        const lockedStudentIds = new Set(
            lockedStudents.map(key => bus.layout?.[key]).filter(id => id)
        );

        // シャッフル対象の生徒（他バス配置済み・ロック中の生徒を除く）
        const available = students.filter(s => !assignedIds.has(s.id) && !lockedStudentIds.has(s.id));

        // シャッフル
        for (let i = available.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [available[i], available[j]] = [available[j], available[i]];
        }

        // ロックされていない座席の位置一覧を作成（最後列は 5 席）
        const availablePositions = [];
        for (let row = 0; row < bus.rows; row++) {
            const isLastRow = row === bus.rows - 1;
            const cols = isLastRow ? 5 : 4;
            for (let col = 0; col < cols; col++) {
                const key = `${row}-${col}`;
                if (!lockedSeats.includes(key) && !lockedStudents.includes(key)) {
                    availablePositions.push(key);
                }
            }
        }

        // 新しいレイアウトを構築：ロック中の座席はそのまま維持
        const newLayout = {};
        lockedStudents.forEach(key => {
            if (bus.layout?.[key]) newLayout[key] = bus.layout[key];
        });

        let studentIndex = 0;
        availablePositions.forEach(key => {
            if (studentIndex < available.length) {
                newLayout[key] = available[studentIndex].id;
                studentIndex++;
            }
        });

        bus.layout = newLayout;

        this.saveBuses();
        this.render();
    },

    /**
     * バス座席表を印刷（A4縦、最後列5席対応）
     */
    printBusSeating() {
        const bus = this.buses[this.currentBusIndex];
        const data = window.StorageManager?.getCurrentData() || {};
        const students = data.students || [];

        let gridHtml = '<div class="bus-print-layout">';
        gridHtml += '<div class="bus-print-driver">運転席</div>';

        for (let row = 0; row < bus.rows; row++) {
            const isLastRow = row === bus.rows - 1;
            gridHtml += '<div class="bus-print-row">';

            if (isLastRow) {
                // 最後列 5 席
                for (let col = 0; col < 5; col++) {
                    const studentId = bus.layout?.[`${row}-${col}`];
                    const student = studentId ? students.find(s => s.id === studentId) : null;
                    gridHtml += `<div class="bus-print-seat ${student ? 'occupied' : 'empty'}">
                        ${student ? `<span class="num">${escapeHtml(student.number)}</span><span class="name">${escapeHtml(student.nameKanji)}</span>` : ''}
                    </div>`;
                }
            } else {
                for (let col = 0; col < 2; col++) {
                    const studentId = bus.layout?.[`${row}-${col}`];
                    const student = studentId ? students.find(s => s.id === studentId) : null;
                    gridHtml += `<div class="bus-print-seat ${student ? 'occupied' : 'empty'}">
                        ${student ? `<span class="num">${escapeHtml(student.number)}</span><span class="name">${escapeHtml(student.nameKanji)}</span>` : ''}
                    </div>`;
                }
                gridHtml += '<div class="bus-print-aisle"></div>';
                for (let col = 2; col < 4; col++) {
                    const studentId = bus.layout?.[`${row}-${col}`];
                    const student = studentId ? students.find(s => s.id === studentId) : null;
                    gridHtml += `<div class="bus-print-seat ${student ? 'occupied' : 'empty'}">
                        ${student ? `<span class="num">${escapeHtml(student.number)}</span><span class="name">${escapeHtml(student.nameKanji)}</span>` : ''}
                    </div>`;
                }
            }
            gridHtml += '</div>';
        }
        gridHtml += '</div>';

        const html = `<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"><title>${escapeHtml(bus.name)} 座席表</title>
        <style>
            @page { size: A4 portrait; margin: 15mm; }
            body { font-family: sans-serif; padding: 10px; }
            h1 { text-align: center; margin-bottom: 10px; font-size: 18px; }
            .bus-print-layout { max-width: 100%; margin: 0 auto; }
            .bus-print-driver { background: #333; color: white; padding: 8px; text-align: center; border-radius: 8px 8px 0 0; font-size: 14px; }
            .bus-print-row { display: flex; gap: 2px; margin-top: 2px; justify-content: center; }
            .bus-print-seat { width: 70px; height: 40px; border: 1px solid #333; display: flex; flex-direction: column; align-items: center; justify-content: center; font-size: 10px; }
            .bus-print-seat.occupied { background: #e0f2fe; }
            .bus-print-seat .num { font-weight: bold; font-size: 11px; }
            .bus-print-seat .name { font-size: 9px; }
            .bus-print-aisle { width: 15px; }
        </style></head><body>
        <h1>${escapeHtml(bus.name)} 座席表</h1>
        <p style="text-align:center; font-size: 12px;">${new Date().toLocaleDateString('ja-JP')}</p>
        ${gridHtml}
        </body></html>`;

        const win = safeWindowOpen('', '', 'width=600,height=800');
        win.document.write(html);
        win.document.close();
        setTimeout(() => { win.focus(); win.print(); }, 500);
    },

    /**
     * 保存・読込モーダルを開く
     */
    openHistoryModal() {
        window.HistoryModal.open({
            modalId: 'busHistoryModal',
            title: '🚌 バス座席の保存・読込',
            getHistory: () => {
                const data = window.StorageManager?.getCurrentData() || {};
                const history = data.bus?.history || [];
                // 旧形式（busesキー）で保存された履歴も読めるよう正規化
                history.forEach(item => {
                    if (item.data === undefined && item.buses !== undefined) item.data = item.buses;
                });
                return history;
            },
            setHistory: (history) => {
                const data = window.StorageManager?.getCurrentData() || {};
                if (!data.bus) data.bus = {};
                data.bus.history = history;
                window.StorageManager?.updateCurrentData(data);
            },
            getSnapshot: () => this.buses,
            applySnapshot: (buses) => {
                this.buses = buses;
                this.currentBusIndex = 0;
                this.saveBuses();
                this.render();
            }
        });
    },

    /**
     * バスデータを保存
     */
    saveBuses() {
        const data = window.StorageManager?.getCurrentData() || {};
        if (!data.bus) data.bus = {};
        // 履歴(history)などの他フィールドを消さないよう、busesのみ上書きする
        data.bus.buses = this.buses;
        window.StorageManager?.updateCurrentData(data);
    },

    /**
     * バスデータを読み込み
     */
    loadBuses() {
        const data = window.StorageManager?.getCurrentData() || {};
        this.buses = data.bus?.buses || [{ ...this.defaultBusConfig, layout: {} }];
    }
};

// グローバルに公開
if (typeof window !== 'undefined') {
    window.BusModule = BusModule;
}
