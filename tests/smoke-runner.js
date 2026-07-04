// ===== 最小限のブラウザテストランナー（npm不要・依存なし） =====
// tests/smoke.html から読み込んで使う。ビルドツールを導入せず、
// ブラウザでファイルを開くだけで結果が見えることを重視した設計。

// アプリのconfirm()/alert()は実際のブラウザダイアログを開くため、
// テスト実行がブロックされないよう自動応答するスタブに差し替える。
window.confirm = () => true;
window.alert = () => {};

const SmokeTests = [];

function test(name, fn) {
    SmokeTests.push({ name, fn });
}

function assertEqual(actual, expected, msg) {
    const a = JSON.stringify(actual);
    const e = JSON.stringify(expected);
    if (a !== e) {
        throw new Error(`${msg ? msg + ': ' : ''}期待値 ${e} に対し実際は ${a}`);
    }
}

function assertTrue(cond, msg) {
    if (!cond) throw new Error(msg || 'assertion failed');
}

// 各テスト前にアプリの状態をクリーンな状態にリセットする
function resetAppState() {
    localStorage.removeItem(StorageManager.STORAGE_KEY);
    StorageManager.currentData = StorageManager.getDefaultData();
}

async function runSmokeTests() {
    const results = [];
    for (const t of SmokeTests) {
        resetAppState();
        try {
            await t.fn();
            results.push({ name: t.name, pass: true });
        } catch (e) {
            results.push({ name: t.name, pass: false, error: e.message });
        }
    }

    // 後片付け（作成した一時DOM等が残っていれば削除）
    document.querySelectorAll('[id^="smoke"]').forEach(el => el.remove());

    window.__SMOKE_RESULTS__ = results;
    renderResults(results);
    return results;
}

function renderResults(results) {
    const out = document.getElementById('results');
    if (!out) return;

    const passCount = results.filter(r => r.pass).length;
    const failCount = results.length - passCount;

    let html = `<h2>${failCount === 0 ? '✅' : '❌'} ${passCount} / ${results.length} 件成功</h2>`;
    html += '<ul>';
    results.forEach(r => {
        html += `<li style="color:${r.pass ? 'green' : 'red'}">${r.pass ? '✅' : '❌'} ${r.name}${r.error ? ` — ${r.error}` : ''}</li>`;
    });
    html += '</ul>';
    out.innerHTML = html;

    // Playwright等のヘッドレス実行から機械的に判定できるよう、bodyに結果を明示する
    document.body.dataset.smokeStatus = failCount === 0 ? 'pass' : 'fail';
}
