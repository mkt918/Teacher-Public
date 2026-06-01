// ===== クラウド同期モジュール =====
// GASと通信して schedule / todos / events を自動同期する

const CloudSync = {
    // GASのデプロイURL
    gasUrl: 'https://script.google.com/macros/s/AKfycby9oh4D6RFTNpqW0qzvWbKh3J2omyD-ohr5CVNvZN5UilOKPNCeOqwRS50Jfc95bOw/exec',
    apiKey: 'teacher-app-sync-key-2026',

    // 同期状態
    enabled: false,
    syncing: false,
    lastSyncAt: null,
    syncTimer: null,
    SYNC_DEBOUNCE: 2000, // データ変更後2秒で同期

    // 初期化
    init() {
        this.enabled = true;

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
            const payload = {
                action: 'save',
                apiKey: this.apiKey,
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
                let changed = false;
                if (json.schedule) { data.schedule = json.schedule; changed = true; }
                if (json.todos)    { data.todos = json.todos;       changed = true; }
                if (json.calendar) { data.calendar = json.calendar; changed = true; }

                if (changed) {
                    data.syncSettings = data.syncSettings || {};
                    data.syncSettings.lastSyncAt = cloudUpdatedAt;
                    StorageManager.updateCurrentData(data);

                    // 表示を更新
                    if (window.ScheduleModule) window.ScheduleModule.loadData();
                    if (window.ScheduleModule) window.ScheduleModule.render('dashboardSchedule');
                    if (window.DashboardModule) window.DashboardModule.renderTodos();
                    if (window.CalendarModule) window.CalendarModule.render?.();

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
            let changed = false;
            if (json.schedule) { data.schedule = json.schedule; changed = true; }
            if (json.todos)    { data.todos = json.todos;       changed = true; }
            if (json.calendar) { data.calendar = json.calendar; changed = true; }

            if (changed) {
                data.syncSettings = data.syncSettings || {};
                data.syncSettings.lastSyncAt = json.updatedAt;
                StorageManager.updateCurrentData(data);

                if (window.ScheduleModule) window.ScheduleModule.loadData();
                if (window.ScheduleModule) window.ScheduleModule.render('dashboardSchedule');
                if (window.DashboardModule) window.DashboardModule.renderTodos();
                if (window.CalendarModule) window.CalendarModule.render?.();
            }

            this.lastSyncAt = json.updatedAt;
            this._updateStatusUI('saved');
        } catch (e) {
            console.error('[CloudSync] 強制読み込みエラー:', e);
            this._updateStatusUI('error');
        }
    },

    // GAS URLを設定・保存
    setGasUrl(url) {
        this.gasUrl = url.trim();
        this.enabled = !!this.gasUrl;
        this.apiKey = 'teacher-app-sync-key-2026';

        const data = StorageManager.getCurrentData();
        data.syncSettings = data.syncSettings || {};
        data.syncSettings.gasUrl = this.gasUrl;
        StorageManager.updateCurrentData(data);

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
