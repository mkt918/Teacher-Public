// ===== スモークテスト本体 =====
// これまで実際に発生した「保存のたびに他データが消える」
// 「エスケープ漏れ」「履歴の復元対象がずれる」といったバグの
// 再発を機械的に検知するための最小限のテスト集。

test('escapeHtml: scriptタグ・引用符を正しくエスケープする', () => {
    assertEqual(
        escapeHtml('<script>alert(1)</script>'),
        '&lt;script&gt;alert(1)&lt;/script&gt;'
    );
    assertEqual(escapeHtml(`"'&`), '&quot;&#039;&amp;');
});

test('getFiscalYear: 未設定時は今日の日付から年度を自動算出する', () => {
    StorageManager.currentData.appSettings = {};
    const today = new Date();
    const expected = today.getMonth() >= 3 ? today.getFullYear() : today.getFullYear() - 1;
    assertEqual(getFiscalYear(), expected);
});

test('getFiscalYear: 設定済みの年度があればそれを優先する', () => {
    StorageManager.currentData.appSettings = { fiscalYear: 2024 };
    assertEqual(getFiscalYear(), 2024);
});

test('BusModule.saveBuses: 保存時に履歴(history)を消さない（回帰テスト）', () => {
    StorageManager.currentData.bus = {
        buses: [],
        history: [{ name: '既存の履歴', timestamp: new Date().toISOString(), data: [] }]
    };
    BusModule.buses = [{ name: 'テストバス', rows: 1, layout: {} }];
    BusModule.saveBuses();

    assertEqual(StorageManager.currentData.bus.history.length, 1, '履歴が消えていないこと');
    assertEqual(StorageManager.currentData.bus.buses[0].name, 'テストバス');
});

test('GroupsModule.saveGroupSets: 保存時に履歴(history)を消さない（回帰テスト）', () => {
    StorageManager.currentData.groups = {
        groupSets: [],
        history: [{ name: '既存の履歴', timestamp: new Date().toISOString(), data: [] }]
    };
    GroupsModule.groupSets = [{ name: 'テスト班' }];
    GroupsModule.saveGroupSets();

    assertEqual(StorageManager.currentData.groups.history.length, 1, '履歴が消えていないこと');
    assertEqual(StorageManager.currentData.groups.groupSets[0].name, 'テスト班');
});

test('ScheduleModule.saveData: 保存時に未知のフィールドを消さない（回帰テスト）', () => {
    StorageManager.currentData.schedule = { someFutureField: 'keep-me' };
    ScheduleModule.saveData();
    assertEqual(StorageManager.currentData.schedule.someFutureField, 'keep-me');
});

test('CalendarModule.saveEvents: 保存時に未知のフィールドを消さない（回帰テスト）', () => {
    StorageManager.currentData.calendar = { someFutureField: 'keep-me' };
    CalendarModule.events = [];
    CalendarModule.saveEvents();
    assertEqual(StorageManager.currentData.calendar.someFutureField, 'keep-me');
});

test('HistoryModal: 新しい順に表示され、選んだ履歴が正しく復元される（回帰テスト）', () => {
    let historyArr = [];
    let currentValue = '';
    let restoredTo = null;

    const config = {
        modalId: 'smokeHistoryModal',
        title: 'スモークテスト履歴',
        getHistory: () => historyArr,
        setHistory: (h) => { historyArr = h; },
        getSnapshot: () => currentValue,
        applySnapshot: (v) => { restoredTo = v; }
    };

    currentValue = 'first-save';
    window.HistoryModal.open(config);
    document.getElementById('smokeHistoryModal_titleInput').value = 'A';
    document.getElementById('smokeHistoryModal_saveBtn').click();

    currentValue = 'second-save';
    document.getElementById('smokeHistoryModal_titleInput').value = 'B';
    document.getElementById('smokeHistoryModal_saveBtn').click();

    const titles = Array.from(document.querySelectorAll('#smokeHistoryModal .history-title')).map(el => el.textContent);
    assertEqual(titles, ['B', 'A'], '新しい順（B, A）に表示されること');

    // 2番目に表示されている「A」を復元する
    document.querySelectorAll('#smokeHistoryModal .load-history-btn')[1].click();
    assertEqual(restoredTo, 'first-save', '「A」を選んだら保存時点(first-save)が復元されること');
});

test('DutiesModule.printDuties: 印刷HTMLに未エスケープのタグが混入しない（回帰テスト）', () => {
    const data = StorageManager.currentData;
    data.students = [{
        id: 'xx',
        number: '<img src=x onerror=alert(1)>',
        nameKanji: '<script>alert(2)</script>'
    }];
    data.duties = [{
        id: 'd1', name: '<b>係名</b>', description: '<i>説明</i>',
        assignedStudents: ['xx'], maxStudents: 1
    }];

    const originalOpen = window.open;
    let captured = '';
    window.open = () => ({
        closed: false,
        document: { write: (h) => { captured = h; }, close: () => {} },
        focus() {}, print() {}
    });

    try {
        DutiesModule.printDuties();
    } finally {
        window.open = originalOpen;
    }

    assertTrue(!captured.includes('<script>alert(2)</script>'), '生のscriptタグが含まれないこと');
    assertTrue(!captured.includes('<img src=x onerror=alert(1)>'), '生のimg onerrorが含まれないこと');
    assertTrue(captured.includes('&lt;b&gt;係名&lt;/b&gt;'), '係名がエスケープされていること');
});
