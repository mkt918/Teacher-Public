/**
 * DashboardModule - ダッシュボード管理（スケジュール＆ToDo）
 * 
 * 機能:
 * - 4週間スケジュール表の表示
 * - 日付付きToDoリストの管理
 * - 各種バッジ更新
 */

const DashboardModule = {
    name: 'DashboardModule',
    initialized: false,

    // ToDoデータ
    todos: [],
    // ToDoソート順: 'date' (日付・タスク順) | 'manual' (手動)
    todoSortOrder: 'date',

    // 週オフセット（0で今週、-1で先週、1で来週...）
    weekOffset: 0,

    /**
     * 初期化
     */
    init() {
        if (this.initialized) return;

        // 依存モジュールの初期化
        if (window.ScheduleModule) window.ScheduleModule.init();
        if (window.CalendarModule) window.CalendarModule.init();

        this.setupEventListeners();
        this.loadTodos();
        this.initialized = true;
        console.log('🏠 DashboardModule initialized (Schedule Mode)');
    },

    /**
     * イベントリスナー
     */
    setupEventListeners() {
        const addBtn = document.getElementById('addTodoBtn');
        const textInput = document.getElementById('todoInput');
        const dateInput = document.getElementById('todoDateInput');

        if (addBtn && textInput) {
            addBtn.addEventListener('click', () => this.addTodo());
            textInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') this.addTodo();
            });
            if (dateInput) {
                dateInput.addEventListener('keypress', (e) => {
                    if (e.key === 'Enter') this.addTodo();
                });
            }
        }

        // ソートボタン（入力行に統合）
        document.getElementById('sortDateBtn')?.addEventListener('click', () => {
            this.todoSortOrder = 'date';
            this.renderTodos();
        });
        document.getElementById('sortManualBtn')?.addEventListener('click', () => {
            this.todoSortOrder = 'manual';
            this.renderTodos();
        });

        // 週ずらしボタン
        document.getElementById('prevWeekBtn')?.addEventListener('click', () => {
            this.weekOffset--;
            this.render();
        });
        document.getElementById('nextWeekBtn')?.addEventListener('click', () => {
            this.weekOffset++;
            this.render();
        });
        document.getElementById('todayBtn')?.addEventListener('click', () => {
            this.weekOffset = 0;
            this.render();
        });

        // ToDo詳細モーダルのイベント
        document.getElementById('saveTodoDetailBtn')?.addEventListener('click', () => this.saveTodoDetail());
        document.getElementById('cancelTodoDetailBtn')?.addEventListener('click', () => this.closeTodoDetailModal());
        document.getElementById('closeTodoDetailModal')?.addEventListener('click', () => this.closeTodoDetailModal());
        document.getElementById('deleteTodoDetailBtn')?.addEventListener('click', () => {
            const id = document.getElementById('todoDetailId').value;
            if (id) this.deleteTodo(id);
            this.closeTodoDetailModal();
        });
    },

    closeTodoDetailModal() {
        const modal = document.getElementById('todoDetailModal');
        if (modal) modal.style.display = 'none';
    },

    /**
     * 描画
     */
    render() {
        // 今日の日付を表示
        this._updateTodayDateDisplay();

        // 週表示範囲を更新
        this._updateWeekRangeDisplay();

        // スケジュール表の描画
        if (window.ScheduleModule) {
            // 週オフセットをScheduleModuleに渡す
            window.ScheduleModule.weekOffset = this.weekOffset;
            this._syncEventsToSchedule();
            window.ScheduleModule.render('dashboardSchedule');
        }

        // 行事一覧を表示（今月の行事）
        this._renderMonthEvents();

        this.renderTodos();
        this.updateBadges();
    },

    // 今日の日付をyyyy-mm-dd(曜日)形式で表示
    _updateTodayDateDisplay() {
        const container = document.getElementById('todayDateDisplay');
        if (!container) return;

        const today = new Date();
        const yyyy = today.getFullYear();
        const mm = String(today.getMonth() + 1).padStart(2, '0');
        const dd = String(today.getDate()).padStart(2, '0');
        const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
        const dayName = weekdays[today.getDay()];

        container.textContent = `📅 ${yyyy}-${mm}-${dd}(${dayName})`;
    },

    _updateWeekRangeDisplay() {
        const display = document.getElementById('weekRangeDisplay');
        if (!display) return;

        const baseDate = new Date();
        baseDate.setDate(baseDate.getDate() + this.weekOffset * 7);
        const startOfWeek = new Date(baseDate);
        startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay() + 1); // 月曜
        const endOfWeek = new Date(startOfWeek);
        endOfWeek.setDate(endOfWeek.getDate() + 4); // 金曜

        const formatDate = (d) => `${d.getMonth() + 1}/${d.getDate()}`;
        const label = this.weekOffset === 0 ? '今週' : (this.weekOffset > 0 ? `${this.weekOffset}週後` : `${Math.abs(this.weekOffset)}週前`);
        display.textContent = `${formatDate(startOfWeek)} 〜 ${formatDate(endOfWeek)} (${label})`;
    },

    _renderMonthEvents() {
        // 年間行事を表示（ToDoパネルの上）
        let container = document.getElementById('monthEventsDisplay');
        if (!container) {
            // 既存のweekEventsDisplayがあれば削除
            const oldContainer = document.getElementById('weekEventsDisplay');
            if (oldContainer) oldContainer.remove();

            const todoPanel = document.querySelector('.todo-panel');
            if (todoPanel) {
                container = document.createElement('div');
                container.id = 'monthEventsDisplay';
                container.style.marginBottom = '15px';
                container.style.padding = '10px';
                container.style.background = '#f0f9ff';
                container.style.borderRadius = '8px';
                container.style.border = '1px solid #bae6fd';
                container.style.cursor = 'pointer';
                // クリックで年間行事予定に遷移
                container.addEventListener('click', () => {
                    if (window.Router) {
                        window.Router.navigateTo('calendar');
                    }
                });
                todoPanel.parentNode.insertBefore(container, todoPanel);
            }
        }

        if (!container || !window.CalendarModule) return;

        // weekOffsetに基づいて基準日を計算
        const baseDate = new Date();
        baseDate.setDate(baseDate.getDate() + this.weekOffset * 7);

        // 基準日の月を「今月」として使用
        const thisYear = baseDate.getFullYear();
        const thisMonth = baseDate.getMonth();

        // 来月
        const nextMonthDate = new Date(thisYear, thisMonth + 1, 1);
        const nextYear = nextMonthDate.getFullYear();
        const nextMonth = nextMonthDate.getMonth();

        const thisMonthEvents = window.CalendarModule.getEventsForMonth(thisYear, thisMonth);
        const nextMonthEvents = window.CalendarModule.getEventsForMonth(nextYear, nextMonth);

        // 日付パースヘルパー
        const parseAsLocalDate = (dateStr) => {
            if (!dateStr) return null;
            if (dateStr instanceof Date) return new Date(dateStr.getFullYear(), dateStr.getMonth(), dateStr.getDate());
            const match = String(dateStr).match(/^(\d{4})-(\d{2})-(\d{2})/);
            if (match) {
                return new Date(parseInt(match[1]), parseInt(match[2]) - 1, parseInt(match[3]));
            }
            const d = new Date(dateStr);
            return new Date(d.getFullYear(), d.getMonth(), d.getDate());
        };

        // ミニカレンダーを生成する関数（月曜始まり）
        const renderMiniCalendar = (year, month, events) => {
            const firstDay = new Date(year, month, 1);
            const lastDay = new Date(year, month + 1, 0);
            const daysInMonth = lastDay.getDate();

            // 月曜始まりに調整（0=月, 1=火, ..., 6=日）
            let startDayOfWeek = firstDay.getDay() - 1;
            if (startDayOfWeek < 0) startDayOfWeek = 6;

            // 行事がある日のセットを作成
            const eventDays = new Set();
            const highlightDays = new Set();
            events.forEach(e => {
                const start = parseAsLocalDate(e.start);
                if (start) {
                    eventDays.add(start.getDate());
                    if (e.highlight) highlightDays.add(start.getDate());
                }
            });

            // 今日の日付
            const today = new Date();
            const isCurrentMonth = today.getFullYear() === year && today.getMonth() === month;
            const todayDate = today.getDate();

            // カレンダーHTML生成
            let calendarHtml = `
                <div style="flex: 1; min-width: 140px; max-width: 180px;">
                    <div style="text-align: center; font-weight: bold; margin-bottom: 5px; font-size: 0.85em;">
                        ${year}年${month + 1}月
                    </div>
                    <table style="width: 100%; border-collapse: collapse; font-size: 0.7em; table-layout: fixed;">
                        <thead>
                            <tr style="background: #e0f2fe;">
                                <th style="padding: 2px; text-align: center;">月</th>
                                <th style="padding: 2px; text-align: center;">火</th>
                                <th style="padding: 2px; text-align: center;">水</th>
                                <th style="padding: 2px; text-align: center;">木</th>
                                <th style="padding: 2px; text-align: center;">金</th>
                                <th style="padding: 2px; text-align: center; color: #0369a1;">土</th>
                                <th style="padding: 2px; text-align: center; color: #dc2626;">日</th>
                            </tr>
                        </thead>
                        <tbody>`;

            let dayCount = 1;
            for (let week = 0; week < 6; week++) {
                if (dayCount > daysInMonth) break;
                calendarHtml += '<tr>';
                for (let dow = 0; dow < 7; dow++) {
                    if (week === 0 && dow < startDayOfWeek) {
                        calendarHtml += '<td style="padding: 2px;"></td>';
                    } else if (dayCount > daysInMonth) {
                        calendarHtml += '<td style="padding: 2px;"></td>';
                    } else {
                        const hasEvent = eventDays.has(dayCount);
                        const hasHighlight = highlightDays.has(dayCount);
                        const isToday = isCurrentMonth && dayCount === todayDate;
                        const isSaturday = dow === 5;
                        const isSunday = dow === 6;

                        let cellStyle = 'padding: 2px; text-align: center;';
                        if (isToday) {
                            cellStyle += ' background: #fef3c7; border-radius: 50%; font-weight: bold;';
                        }
                        if (hasHighlight) {
                            cellStyle += ' color: #dc2626; font-weight: bold;';
                        } else if (hasEvent) {
                            cellStyle += ' background: #dbeafe; border-radius: 3px;';
                        } else if (isSunday) {
                            cellStyle += ' color: #dc2626;';
                        } else if (isSaturday) {
                            cellStyle += ' color: #0369a1;';
                        }

                        calendarHtml += `<td style="${cellStyle}">${dayCount}</td>`;
                        dayCount++;
                    }
                }
                calendarHtml += '</tr>';
            }

            calendarHtml += '</tbody></table></div>';
            return calendarHtml;
        };

        // イベントをHTML化する関数
        const renderEvents = (events, monthLabel) => {
            if (events.length === 0) {
                return `<div style="margin-bottom: 10px;">
                    <strong>📅 ${monthLabel}</strong>
                    <p style="margin: 5px 0 0; color: #999; font-size: 0.9em;">予定なし</p>
                </div>`;
            }

            return `<div style="margin-bottom: 10px;">
                <strong>📅 ${monthLabel}</strong>
                ${events.map(e => {
                const start = parseAsLocalDate(e.start);
                const dateStr = `${start.getMonth() + 1}/${start.getDate()}`;
                let endStr = '';
                if (e.end) {
                    const end = parseAsLocalDate(e.end);
                    if (start.getTime() !== end.getTime()) {
                        endStr = `〜${end.getDate()}`;
                    }
                }
                const weekday = ['日', '月', '火', '水', '木', '金', '土'][start.getDay()];
                const highlightStyle = e.highlight ? 'color: #dc2626; font-weight: bold;' : '';
                return `<div style="margin-top: 5px; font-size: 0.9em; ${highlightStyle}">
                        <span style="color: ${e.highlight ? '#dc2626' : '#0369a1'};">${dateStr}${endStr}(${weekday})</span> ${this._escapeHtml(e.title)}
                    </div>`;
            }).join('')}
            </div>`;
        };

        // ミニカレンダー2ヶ月分を横並びで表示
        const calendarsHtml = `
            <div style="display: flex; gap: 10px; margin-bottom: 15px; justify-content: center;">
                ${renderMiniCalendar(thisYear, thisMonth, thisMonthEvents)}
                ${renderMiniCalendar(nextYear, nextMonth, nextMonthEvents)}
            </div>
        `;

        const eventsHtml = `
            <div style="display: flex; gap: 20px; margin-bottom: 10px;">
                <div style="flex: 1;">
                    ${renderEvents(thisMonthEvents, `今月の行事（${thisMonth + 1}月）`)}
                </div>
                <div style="flex: 1;">
                    ${renderEvents(nextMonthEvents, `来月の行事（${nextMonth + 1}月）`)}
                </div>
            </div>
            <p style="margin: 0; font-size: 0.8em; color: #64748b; text-align: right;">クリックで編集 →</p>
        `;

        container.innerHTML = calendarsHtml + eventsHtml;
    },

    /**
     * カレンダーの予定をスケジュールの日次変更データに反映（表示用）
     */
    _syncEventsToSchedule() {
        if (!window.CalendarModule || !window.ScheduleModule) return;

        // 向こう4週間分の日付について処理
        const weeks = window.ScheduleModule._generateWeeks(4);
        weeks.forEach(week => {
            week.forEach(date => {
                const dateStr = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
                const events = window.CalendarModule.getEventsForDate(dateStr);

                // 行事予定があれば反映（既存の手動変更は維持）
                if (events.length > 0) {
                    // 同一日でも複数の行事がある場合は連結、ただし備考として表示するなど工夫が必要
                    // ここではシンプルに行事名を表示
                    const eventNames = events.map(e => e.title).join(', ');

                    // 日付ヘッダー部分へのイベント表示ロジックはScheduleModule側で対応
                    // ここではScheduleModuleのdailyEventsプロパティ等にセットする形が望ましいが
                    // ScheduleModuleの設計に合わせて、DOM更新時にイベントラベルへ書き込むアプローチをとる

                    // ScheduleModuleのrender後にDOM操作を行うため、ここでは何もしない
                    // またはScheduleModuleに行事データセット用のメソッドを追加する
                }
            });
        });

        // 実際のDOM更新はScheduleModule.render後に、イベントリスナー内かcallbackで行う必要があるが
        // 今回はScheduleModule.render内でCalendarModuleを直接参照するように改修する方がスマート。
        // （後ほどScheduleModuleを微修正する）
    },

    /**
     * ToDoリストを描画（2カラム版）
     */
    renderTodos() {
        const importantContainer = document.getElementById('todoListImportant');
        const normalContainer = document.getElementById('todoListNormal');
        if (!importantContainer || !normalContainer) return;

        // ソートボタンの状態更新
        const sortDateBtn = document.getElementById('sortDateBtn');
        const sortManualBtn = document.getElementById('sortManualBtn');
        if (sortDateBtn) sortDateBtn.className = `btn-sort-inline ${this.todoSortOrder === 'date' ? 'active' : ''}`;
        if (sortManualBtn) sortManualBtn.className = `btn-sort-inline ${this.todoSortOrder === 'manual' ? 'active' : ''}`;

        // カラム別にフィルタリング
        const importantTodos = this.todos.filter(t => t.important && t.type !== 'separator');
        const normalTodos = this.todos.filter(t => !t.important || t.type === 'separator');

        // ソート適用
        const sortedImportant = this._sortTodos(importantTodos);
        const sortedNormal = this._sortTodos(normalTodos);

        // 重要カラムのカウンタ更新
        const importantActiveCount = importantTodos.filter(t => !t.completed).length;
        const importantCountEl = document.getElementById('importantCount');
        if (importantCountEl) importantCountEl.textContent = `${importantActiveCount}/5`;

        // 上限超過の視覚フィードバック
        const importantCol = document.getElementById('todoColumnImportant');
        if (importantCol) {
            importantCol.classList.toggle('todo-column--over-limit', importantActiveCount > 5);
        }

        // 通常カラムのカウンタ更新
        const normalActiveCount = normalTodos.filter(t => !t.completed && t.type !== 'separator').length;
        const normalCountEl = document.getElementById('normalCount');
        if (normalCountEl) normalCountEl.textContent = normalActiveCount;

        // 各カラムを描画
        importantContainer.innerHTML = this._buildTodoHtml(sortedImportant, 'important');
        normalContainer.innerHTML = this._buildTodoHtml(sortedNormal, 'normal');

        // イベント設定
        this._setupTodoEvents(importantContainer);
        this._setupTodoEvents(normalContainer);

        // DnD設定（常に有効化）
        this._setupTodoDnDv2(importantContainer, normalContainer);
    },

    /**
     * ToDoリストのソート（カラム別）
     */
    _sortTodos(todos) {
        if (this.todoSortOrder !== 'date') return todos;

        return [...todos].sort((a, b) => {
            if (a.type === 'separator' && b.type !== 'separator') return 1;
            if (a.type !== 'separator' && b.type === 'separator') return -1;
            if (a.completed !== b.completed) return a.completed ? 1 : -1;
            if (!a.dueDate && b.dueDate) return 1;
            if (a.dueDate && !b.dueDate) return -1;
            if (a.dueDate && b.dueDate && a.dueDate !== b.dueDate) {
                return new Date(a.dueDate) - new Date(b.dueDate);
            }
            return (a.text || '').localeCompare(b.text || '');
        });
    },

    /**
     * ToDoアイテムのHTML生成
     */
    _buildTodoHtml(todos, columnKey) {
        if (todos.length === 0) {
            const msg = columnKey === 'important' ? '重要タスクなし' : 'タスクはありません';
            return `<div class="empty-state-small"><p>${msg}</p></div>`;
        }

        const _now = new Date();
        const today = `${_now.getFullYear()}-${String(_now.getMonth()+1).padStart(2,'0')}-${String(_now.getDate()).padStart(2,'0')}`;
        const isManualMode = this.todoSortOrder === 'manual';

        return todos.map((todo, index) => {
            // 区切り線（通常カラムのみ）
            if (todo.type === 'separator') {
                return `
                    <div class="todo-separator" draggable="true"
                         data-id="${todo.id}" data-index="${index}" data-column="${columnKey}">
                        <div class="todo-drag-handle">⋮⋮</div>
                        <hr>
                        <button class="todo-delete separator-delete" title="削除">×</button>
                    </div>`;
            }

            const isOverdue = !todo.completed && todo.dueDate && todo.dueDate < today;
            const isToday = !todo.completed && todo.dueDate === today;

            let dateLabel = '';
            if (todo.dueDate) {
                const d = new Date(todo.dueDate + 'T00:00:00');
                dateLabel = `<span class="todo-date ${isOverdue ? 'overdue' : ''} ${isToday ? 'today' : ''}">
                    ${d.getMonth() + 1}/${d.getDate()}
                </span>`;
            }

            // ⭐ ボタン（カラム間移動用）
            const starBtn = `<button class="todo-star ${todo.important ? 'active' : ''}"
                data-id="${todo.id}" title="${todo.important ? '重要を解除' : '重要にする'}">⭐</button>`;

            const hasNote = todo.note && todo.note.trim() !== '';

            return `
            <div class="todo-item ${todo.completed ? 'completed' : ''} ${isOverdue ? 'overdue-item' : ''}"
                 draggable="true"
                 data-id="${todo.id}" data-index="${index}" data-column="${columnKey}">
                <div class="todo-drag-handle">⋮⋮</div>
                <div class="todo-main">
                    <input type="checkbox" class="todo-checkbox" ${todo.completed ? 'checked' : ''}>
                    ${dateLabel}
                    <span class="todo-text">${this._escapeHtml(todo.text)}${hasNote ? ' <small style="opacity:0.6;">📝</small>' : ''}</span>
                </div>
                ${starBtn}
                <button class="todo-delete">×</button>
            </div>`;
        }).join('');
    },

    addSeparator() {
        this.todos.push({
            id: Date.now().toString(),
            type: 'separator',
            text: '---',
            completed: false,
            createdAt: new Date().toISOString()
        });
        this.saveTodos();
        this.renderTodos(); // 描画更新
    },

    /**
     * ToDoイベント設定（チェック・削除・⭐ボタン）
     */
    _setupTodoEvents(container) {
        container.querySelectorAll('.todo-checkbox').forEach(cb => {
            cb.addEventListener('change', (e) => {
                const id = e.target.closest('.todo-item').dataset.id;
                this.toggleTodo(id);
            });
        });

        container.querySelectorAll('.todo-delete').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const parent = e.target.closest('.todo-item') || e.target.closest('.todo-separator');
                if (parent) {
                    this.deleteTodo(parent.dataset.id);
                }
            });
        });

        // ⭐ ボタン：カラム間移動
        container.querySelectorAll('.todo-star').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.toggleImportant(btn.dataset.id);
            });
        });

        // 詳細表示
        container.querySelectorAll('.todo-main').forEach(el => {
            el.addEventListener('click', (e) => {
                if (e.target.type === 'checkbox') return;
                const id = e.target.closest('.todo-item').dataset.id;
                this.openTodoDetail(id);
            });
        });
    },

    /**
     * ToDo詳細モーダルを開く
     */
    openTodoDetail(id) {
        const todo = this.todos.find(t => t.id === id);
        if (!todo) return;

        document.getElementById('todoDetailId').value = todo.id;
        document.getElementById('todoDetailText').value = todo.text || '';
        document.getElementById('todoDetailDate').value = todo.dueDate || '';
        document.getElementById('todoDetailNote').value = todo.note || '';
        document.getElementById('todoDetailImportant').checked = !!todo.important;

        const modal = document.getElementById('todoDetailModal');
        if (modal) modal.style.display = 'flex';
    },

    /**
     * ToDo詳細を保存
     */
    saveTodoDetail() {
        const id = document.getElementById('todoDetailId').value;
        const text = document.getElementById('todoDetailText').value.trim();
        const dueDate = document.getElementById('todoDetailDate').value;
        const note = document.getElementById('todoDetailNote').value;
        const important = document.getElementById('todoDetailImportant').checked;

        if (!text) {
            alert('タスク名を入力してください。');
            return;
        }

        const todo = this.todos.find(t => t.id === id);
        if (todo) {
            // 重要フラグの変更がある場合の上限チェック
            if (important && !todo.important) {
                const importantActiveCount = this.todos.filter(
                    t => t.important && !t.completed && t.type !== 'separator'
                ).length;
                if (importantActiveCount >= 5) {
                    alert('重要タスクは最大5件までです。');
                    return;
                }
            }

            todo.text = text;
            todo.dueDate = dueDate;
            todo.note = note;
            todo.important = important;

            this.saveTodos();
            this.renderTodos();
            this.closeTodoDetailModal();
        }
    },

    /**
     * 2カラム対応のドラッグアンドドロップ設定
     */
    _setupTodoDnDv2(importantContainer, normalContainer) {
        const containers = [importantContainer, normalContainer];

        containers.forEach(container => {
            // ドラッグ開始
            container.querySelectorAll('[draggable="true"]').forEach(item => {
                item.addEventListener('dragstart', (e) => {
                    e.dataTransfer.setData('text/plain', JSON.stringify({
                        id: item.dataset.id,
                        fromColumn: item.dataset.column
                    }));
                    e.dataTransfer.effectAllowed = 'move';
                    item.classList.add('dragging');
                    // ドラッグ中は全コンテナをドロップ可能状態に
                    containers.forEach(c => c.classList.add('dnd-active'));
                });

                item.addEventListener('dragend', () => {
                    item.classList.remove('dragging');
                    containers.forEach(c => {
                        c.classList.remove('dnd-active', 'drag-over-container');
                        c.querySelectorAll('.drag-over-top, .drag-over-bottom')
                         .forEach(el => el.classList.remove('drag-over-top', 'drag-over-bottom'));
                    });
                });
            });

            // アイテム上へのドロップ
            container.querySelectorAll('.todo-item, .todo-separator').forEach(item => {
                item.addEventListener('dragover', (e) => {
                    e.preventDefault();
                    const rect = item.getBoundingClientRect();
                    const mid = rect.top + rect.height / 2;
                    item.classList.remove('drag-over-top', 'drag-over-bottom');
                    item.classList.add(e.clientY < mid ? 'drag-over-top' : 'drag-over-bottom');
                });

                item.addEventListener('dragleave', () => {
                    item.classList.remove('drag-over-top', 'drag-over-bottom');
                });

                item.addEventListener('drop', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    item.classList.remove('drag-over-top', 'drag-over-bottom');
                    this._handleDrop(e, item);
                });
            });

            // コンテナの空き領域へのドロップ（末尾追加）
            container.addEventListener('dragover', (e) => {
                e.preventDefault();
                container.classList.add('drag-over-container');
            });

            container.addEventListener('dragleave', (e) => {
                // コンテナの子要素へのdragleaveは無視
                if (!container.contains(e.relatedTarget)) {
                    container.classList.remove('drag-over-container');
                }
            });

            container.addEventListener('drop', (e) => {
                container.classList.remove('drag-over-container');
                // アイテム上のドロップは各アイテムのdropが処理済みのため
                // ここではコンテナの空き部分へのドロップのみ処理
                const target = e.target.closest('.todo-item, .todo-separator');
                if (!target) {
                    this._handleDropToContainer(e, container);
                }
            });
        });
    },

    /**
     * アイテム上へのドロップ処理
     */
    _handleDrop(e, targetItem) {
        let payload;
        try {
            payload = JSON.parse(e.dataTransfer.getData('text/plain'));
        } catch { return; }

        const { id: draggedId, fromColumn } = payload;
        const toColumnEl = targetItem.closest('.todo-column');
        if (!toColumnEl) return;
        const toColumn = toColumnEl.dataset.column;
        const toId = targetItem.dataset.id;

        if (draggedId === toId) return;

        // 重要カラムへの移動時に上限チェック
        if (toColumn === 'important' && fromColumn === 'normal') {
            const count = this.todos.filter(t => t.important && !t.completed && t.type !== 'separator').length;
            if (count >= 5) {
                alert('重要タスクは最大5件までです。');
                return;
            }
        }

        const rect = targetItem.getBoundingClientRect();
        const insertAfter = e.clientY >= rect.top + rect.height / 2;

        // 手動モードでなければ切り替え
        if (this.todoSortOrder !== 'manual') {
            this.todoSortOrder = 'manual';
            // 通知（オプション）
            // console.log('Switched to manual sort mode');
        }

        // 配列操作
        const draggedIndex = this.todos.findIndex(t => t.id === draggedId);
        if (draggedIndex === -1) return;
        const movedItem = this.todos.splice(draggedIndex, 1)[0];

        // important フラグを更新
        if (movedItem.type !== 'separator') {
            movedItem.important = (toColumn === 'important');
        }

        // ターゲットの位置を探して挿入
        let targetIndex = this.todos.findIndex(t => t.id === toId);
        if (targetIndex === -1) targetIndex = this.todos.length;
        if (insertAfter) targetIndex++;

        this.todos.splice(targetIndex, 0, movedItem);
        this.saveTodos();
        this.renderTodos();
    },

    /**
     * コンテナの空き領域へのドロップ処理（末尾追加）
     */
    _handleDropToContainer(e, container) {
        let payload;
        try {
            payload = JSON.parse(e.dataTransfer.getData('text/plain'));
        } catch { return; }

        const { id: draggedId, fromColumn } = payload;
        const toColumnEl = container.closest('.todo-column');
        if (!toColumnEl) return;
        const toColumn = toColumnEl.dataset.column;

        // 手動モードでなければ切り替え
        if (this.todoSortOrder !== 'manual') {
            this.todoSortOrder = 'manual';
        }

        if (toColumn === 'important' && fromColumn === 'normal') {
            const count = this.todos.filter(t => t.important && !t.completed && t.type !== 'separator').length;
            if (count >= 5) {
                alert('重要タスクは最大5件までです。');
                return;
            }
        }

        const draggedIndex = this.todos.findIndex(t => t.id === draggedId);
        if (draggedIndex === -1) return;
        const movedItem = this.todos.splice(draggedIndex, 1)[0];

        if (movedItem.type !== 'separator') {
            movedItem.important = (toColumn === 'important');
        }

        // そのカラムの最後のアイテムの後ろに挿入
        let insertAt = -1;
        for (let i = this.todos.length - 1; i >= 0; i--) {
            const t = this.todos[i];
            const isTargetColumn = toColumn === 'important' ? (t.important && t.type !== 'separator') : (!t.important || t.type === 'separator');
            if (isTargetColumn) {
                insertAt = i + 1;
                break;
            }
        }
        if (insertAt === -1) insertAt = this.todos.length;

        this.todos.splice(insertAt, 0, movedItem);
        this.saveTodos();
        this.renderTodos();
    },

    /**
     * ToDoを追加
     */
    addTodo() {
        const textInput = document.getElementById('todoInput');
        const dateInput = document.getElementById('todoDateInput');

        if (!textInput) return;

        const text = textInput.value.trim();
        const dueDate = dateInput ? dateInput.value : '';

        if (!text) return;

        this.todos.push({
            id: Date.now().toString(),
            text: text,
            dueDate: dueDate,
            completed: false,
            important: false,
            createdAt: new Date().toISOString()
        });

        textInput.value = '';
        if (dateInput) dateInput.value = '';

        this.saveTodos();
        this.renderTodos();
    },

    /**
     * ToDo完了切り替え
     */
    toggleTodo(id) {
        const todo = this.todos.find(t => t.id === id);
        if (todo) {
            todo.completed = !todo.completed;
            this.saveTodos();
            this.renderTodos();
        }
    },

    /**
     * ToDo重要フラグ切り替え（⭐ボタン）
     */
    toggleImportant(id) {
        const todo = this.todos.find(t => t.id === id);
        if (!todo) return;

        // 重要カラムへの昇格時に上限チェック
        if (!todo.important) {
            const importantActiveCount = this.todos.filter(
                t => t.important && !t.completed && t.type !== 'separator'
            ).length;
            if (importantActiveCount >= 5) {
                alert('重要タスクは最大5件までです。\n完了済みのタスクを確認してください。');
                return;
            }
        }

        todo.important = !todo.important;
        this.saveTodos();
        this.renderTodos();
    },

    /**
     * ToDo削除
     */
    deleteTodo(id) {
        if (!confirm('このタスクを削除しますか？')) return;
        this.todos = this.todos.filter(t => t.id !== id);
        this.saveTodos();
        this.renderTodos();
    },

    /**
     * 各種バッジ更新
     */
    updateBadges() {
        // ... (既存ロジックと同じ) ...
        const data = window.StorageManager?.getCurrentData() || {};
        const studentCount = document.getElementById('studentCount');
        if (studentCount) studentCount.textContent = `${data.students?.length || 0}名`;
    },

    /**
     * データ保存・読み込み
     */
    saveTodos() {
        const data = window.StorageManager?.getCurrentData() || {};
        data.todos = this.todos;
        window.StorageManager?.updateCurrentData(data);
        if (window.CloudSync) window.CloudSync.triggerSync();
    },

    loadTodos() {
        const data = window.StorageManager?.getCurrentData() || {};
        // 既存データに important フィールドがない場合はデフォルト false を付与
        this.todos = (data.todos || []).map(todo => ({
            important: false,
            ...todo
        }));
    },

    _escapeHtml(str) {
        if (!str) return '';
        return str.replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m]));
    }
};



if (typeof window !== 'undefined') {
    window.DashboardModule = DashboardModule;
}
