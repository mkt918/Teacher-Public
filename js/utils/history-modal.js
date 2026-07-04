// ===== 汎用 履歴保存/読込モーダル =====
// 席替え・保護者会で確立した「保存名を入力→一覧から復元/削除」UIを、
// バス座席・グループ分け・クラス係でも共有するための共通実装。
// prompt()/alert() ベースの旧UI（番号を手入力させる形式）を置き換える。

const HistoryModal = {
    /**
     * 履歴の保存・読込モーダルを開く（既存なら中身を再描画して開く）
     * @param {Object} config
     * @param {string}   config.modalId       - モーダルのDOM ID（呼び出し元ごとに一意にする）
     * @param {string}   config.title         - モーダルタイトル
     * @param {()=>Array}          config.getHistory    - 現在の履歴配列を取得
     * @param {(arr:Array)=>void}  config.setHistory    - 履歴配列を保存（内部でtrimして渡す）
     * @param {()=>any}            config.getSnapshot   - 保存する現在状態のスナップショットを取得
     * @param {(data:any)=>void}   config.applySnapshot - スナップショットを復元し、再描画まで行う
     * @param {number}   [config.maxItems=10]
     */
    open(config) {
        let modal = document.getElementById(config.modalId);
        if (!modal) {
            modal = document.createElement('div');
            modal.id = config.modalId;
            modal.className = 'modal';
            modal.setAttribute('role', 'dialog');
            modal.setAttribute('aria-modal', 'true');
            modal.innerHTML = `
                <div class="modal-content">
                    <div class="modal-header">
                        <h3>${escapeHtml(config.title)}</h3>
                        <button class="modal-close" aria-label="閉じる">✕</button>
                    </div>
                    <div class="modal-body"></div>
                </div>
            `;
            document.body.appendChild(modal);
            modal.querySelector('.modal-close').addEventListener('click', () => modal.classList.remove('active'));
            modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.remove('active'); });
        }

        this._render(modal, config);
        modal.classList.add('active');
    },

    _render(modal, config) {
        const { getHistory, setHistory, getSnapshot, applySnapshot, maxItems = 10 } = config;
        const body = modal.querySelector('.modal-body');
        const history = getHistory();

        let html = `
            <div style="background: #f0fff4; padding: 15px; border-radius: 8px; border: 1px solid #c6f6d5; margin-bottom: 20px;">
                <h4 style="margin-top:0; color: #2f855a;">現在の状態を保存</h4>
                <div style="display:flex; gap:10px;">
                    <input type="text" id="${modal.id}_titleInput" class="form-control" placeholder="保存名（例: 1学期分）" style="flex:1;">
                    <button class="btn btn-success" id="${modal.id}_saveBtn">保存</button>
                </div>
            </div>
            <h4 style="border-bottom: 2px solid #eee; padding-bottom: 5px;">保存済み履歴</h4>
            <div class="history-list" style="max-height: 400px; overflow-y: auto;">
        `;

        if (history.length === 0) {
            html += `<p style="color:#666; padding: 20px; text-align:center;">履歴はありません</p>`;
        } else {
            // getHistory()はunshift保存のため配列先頭が最新。そのままの並び順（新しい順）で表示する
            history.forEach((item, i) => {
                const dateStr = item.timestamp ? new Date(item.timestamp).toLocaleString('ja-JP') : (item.date || '');
                html += `
                    <div class="history-item">
                        <div class="history-info">
                            <div class="history-date">${escapeHtml(dateStr)}</div>
                            <div class="history-title">${escapeHtml(item.name || '(無題)')}</div>
                        </div>
                        <div class="history-actions">
                            <button class="btn btn-sm btn-primary load-history-btn" data-index="${i}">復元</button>
                            <button class="btn btn-sm btn-danger delete-history-btn" data-index="${i}">削除</button>
                        </div>
                    </div>
                `;
            });
        }
        html += `</div>`;
        body.innerHTML = html;

        // 保存
        body.querySelector(`#${modal.id}_saveBtn`).addEventListener('click', () => {
            const input = body.querySelector(`#${modal.id}_titleInput`);
            const name = input.value.trim() || '無題';

            const newHistory = getHistory();
            newHistory.unshift({
                name,
                timestamp: new Date().toISOString(),
                data: JSON.parse(JSON.stringify(getSnapshot()))
            });
            setHistory(newHistory.slice(0, maxItems));

            this._render(modal, config);
            const freshBody = modal.querySelector('.modal-body');
            const successMsg = document.createElement('div');
            successMsg.textContent = '✅ 保存しました';
            successMsg.style.cssText = 'background:#dcfce7; color:#166534; padding:8px 12px; border-radius:6px; font-size:0.85em; font-weight:bold; margin-bottom:12px;';
            freshBody.insertBefore(successMsg, freshBody.firstChild);
            setTimeout(() => successMsg.remove(), 2500);
        });

        // 復元
        body.querySelectorAll('.load-history-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const idx = parseInt(btn.dataset.index, 10);
                const target = getHistory()[idx];
                if (target && confirm(`「${target.name}」を復元しますか？\n現在の内容は上書きされます。`)) {
                    applySnapshot(JSON.parse(JSON.stringify(target.data)));
                    modal.classList.remove('active');
                }
            });
        });

        // 削除
        body.querySelectorAll('.delete-history-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                if (confirm('この履歴を削除しますか？')) {
                    const idx = parseInt(btn.dataset.index, 10);
                    const h = getHistory();
                    h.splice(idx, 1);
                    setHistory(h);
                    this._render(modal, config);
                }
            });
        });
    }
};

window.HistoryModal = HistoryModal;
