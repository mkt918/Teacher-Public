// ===== クラウド同期モジュール =====
// GASと通信してアプリの全データ（生徒名簿・出欠・メモ・座席・バス・
// グループ・係・保護者会・時間割・ToDo・年間行事・テスト問題・所見）を自動同期する

// 同期対象のトップレベルフィールド
// ※appSettings（GAS URL等の端末ローカル設定）とsyncSettingsは同期しない
const SYNC_FIELDS = [
    'students', 'attendance', 'memos', 'personalMemos',
    'seating', 'bus', 'groups', 'duties', 'dutiesHistory',
    'meeting', 'schedule', 'todos', 'calendar',
    'testTemplates', 'reports'
];

const CloudSync = {
    // GASのデプロイURL（配布版のデフォルトは空文字。「各種設定」で
    // 利用者自身のGAS URLを登録すると、その値が使われる）
    gasUrl: '',
    apiKey: 'teacher-app-sync-key-2026',

    // 同期状態
    enabled: false,
    syncing: false,
    lastSyncAt: null,
    syncTimer: null,
    SYNC_DEBOUNCE: 2000, // データ変更後2秒で同期

    // 初期化
    init() {
        // 「各種設定」で保存済みのGASエンドポイントURLがあればそちらを優先し、
        // なければデフォルトURL（this.gasUrl の初期値）を使う
        const data = StorageManager.getCurrentData();
        const savedUrl = data.appSettings?.gasEndpointUrl || '';
        if (savedUrl) this.gasUrl = savedUrl;
        this.enabled = !!this.gasUrl;

        if (this.enabled) {
            // 起動時にクラウドから読み込む
            this.loadFromCloud();
        }

        this._updateStatusUI();
    },

    // データ変更後に呼ばれる（debounce付き）
    triggerSync() {
        if (!this.enabled || !this.gasUrl) return;
        if (this.syncTimer) clearTimeout(this.syncTimer);
        this.syncTimer = setTimeout(() => {
            this.saveToCloud();
        }, this.SYNC_DEBOUNCE);
    },

    // クラウドに保存
    async saveToCloud() {
        if (!this.gasUrl || this.syncing) return;
        this.syncing = true;
        this._updateStatusUI('syncing');

        try {
            const data = StorageManager.getCurrentData();

            // v2: 同期対象フィールドをまとめて送る
            const appData = {};
            SYNC_FIELDS.forEach(field => {
                if (data[field] !== undefined) appData[field] = data[field];
            });

            const payload = {
                action: 'save',
                apiKey: this.apiKey,
                appData: appData,
                // v1互換: GASが旧バージョンのままでも従来分は保存されるようにする
                schedule: data.schedule || null,
                todos: data.todos || [],
                calendar: data.calendar || null
            };

            const res = await fetch(this.gasUrl, {
                method: 'POST',
                body: JSON.stringify(payload)
            });
            const json = await res.json();

            if (json.ok) {
                this.lastSyncAt = json.updatedAt;
                this._updateStatusUI('saved');
            } else {
                throw new Error(json.error || '保存失敗');
            }
        } catch (e) {
            console.error('[CloudSync] 保存エラー:', e);
            this._updateStatusUI('error');
        } finally {
            this.syncing = false;
        }
    },

    // クラウドのレスポンスからローカルデータへ反映する（適用したらtrue）
    _applyCloudData(data, json) {
        let changed = false;

        if (json.appData) {
            // v2: 全データをまとめて反映
            SYNC_FIELDS.forEach(field => {
                if (json.appData[field] !== undefined && json.appData[field] !== null) {
                    data[field] = json.appData[field];
                    changed = true;
                }
            });
        } else {
            // v1互換: GASが旧バージョンのまま（appData未対応）の場合
            console.warn('[CloudSync] GASが旧バージョンです。gas/Code.gs を再デプロイすると全データが同期されます');
            if (json.schedule) { data.schedule = json.schedule; changed = true; }
            if (json.todos)    { data.todos = json.todos;       changed = true; }
            if (json.calendar) { data.calendar = json.calendar; changed = true; }
        }

        return changed;
    },

    // クラウド反映後に各モジュールのキャッシュと表示を更新する
    _refreshModules() {
        // 内部キャッシュを持つモジュールを再読込
        if (window.ScheduleModule)   window.ScheduleModule.loadData?.();
        if (window.AttendanceModule) window.AttendanceModule.loadData?.();
        if (window.MemoModule)       window.MemoModule.loadPersonalMemos?.();
        if (window.BusModule)        window.BusModule.loadBuses?.();
        if (window.GroupsModule)     window.GroupsModule.loadGroupSets?.();

        // ダッシュボード表示を更新
        if (window.ScheduleModule)  window.ScheduleModule.render?.('dashboardSchedule');
        if (window.DashboardModule) window.DashboardModule.renderTodos?.();
        if (window.CalendarModule)  window.CalendarModule.render?.();

        // 表示中のページを再描画
        if (window.Router?.currentPage) {
            window.Router.navigateTo(window.Router.currentPage, false);
        }
    },

    // クラウドから読み込む
    async loadFromCloud() {
        if (!this.gasUrl) return;
        this._updateStatusUI('syncing');

        try {
            const url = `${this.gasUrl}?apiKey=${encodeURIComponent(this.apiKey)}`;
            const res = await fetch(url);
            const json = await res.json();

            if (!json.ok) throw new Error(json.error || '読み込み失敗');

            const data = StorageManager.getCurrentData();

            // タイムスタンプ比較（クラウドの方が新しければ上書き）
            const localUpdatedAt = data.syncSettings?.lastSyncAt || null;
            const cloudUpdatedAt = json.updatedAt;

            if (!localUpdatedAt || (cloudUpdatedAt && cloudUpdatedAt > localUpdatedAt)) {
                // クラウドが新しい → 上書き
                const changed = this._applyCloudData(data, json);

                if (changed) {
                    data.syncSettings = data.syncSettings || {};
                    data.syncSettings.lastSyncAt = cloudUpdatedAt;
                    StorageManager.updateCurrentData(data);
                    this._refreshModules();
                    console.log('[CloudSync] クラウドから最新データを読み込みました');
                }
            }

            this.lastSyncAt = cloudUpdatedAt;
            this._updateStatusUI('saved');
        } catch (e) {
            console.error('[CloudSync] 読み込みエラー:', e);
            this._updateStatusUI('error');
        }
    },

    // クラウドから強制上書き読み込み（タイムスタンプ比較なし）
    async loadFromCloudForce() {
        if (!this.gasUrl) return;
        this._updateStatusUI('syncing');

        try {
            const url = `${this.gasUrl}?apiKey=${encodeURIComponent(this.apiKey)}`;
            const res = await fetch(url);
            const json = await res.json();

            if (!json.ok) throw new Error(json.error || '読み込み失敗');

            const data = StorageManager.getCurrentData();
            const changed = this._applyCloudData(data, json);

            if (changed) {
                data.syncSettings = data.syncSettings || {};
                data.syncSettings.lastSyncAt = json.updatedAt;
                StorageManager.updateCurrentData(data);
                this._refreshModules();
            }

            this.lastSyncAt = json.updatedAt;
            this._updateStatusUI('saved');
        } catch (e) {
            console.error('[CloudSync] 強制読み込みエラー:', e);
            this._updateStatusUI('error');
        }
    },

    // GAS URLを設定・保存（保存先は data.appSettings.gasEndpointUrl に統一）
    setGasUrl(url) {
        this.gasUrl = url.trim();
        this.enabled = !!this.gasUrl;

        this._updateStatusUI();

        if (this.enabled) {
            this.loadFromCloud();
        }
    },

    // ステータスUI更新
    _updateStatusUI(state) {
        const el = document.getElementById('cloudSyncStatus');
        if (!el) return;
        if (!this.enabled) {
            el.textContent = '☁️ 同期: 未設定';
            el.style.color = '#94a3b8';
        } else if (state === 'syncing') {
            el.textContent = '☁️ 同期中...';
            el.style.color = '#f59e0b';
        } else if (state === 'saved') {
            const t = this.lastSyncAt ? new Date(this.lastSyncAt).toLocaleTimeString('ja-JP') : '';
            el.textContent = `☁️ 同期済 ${t}`;
            el.style.color = '#10b981';
        } else if (state === 'error') {
            el.textContent = '☁️ 同期エラー';
            el.style.color = '#dc2626';
        } else {
            el.textContent = '☁️ 同期: 有効';
            el.style.color = '#10b981';
        }
    }
};

window.CloudSync = CloudSync;
