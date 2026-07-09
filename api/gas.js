// ============================================================
//  api/gas.js  — Vercel サーバーレス関数（GAS プロキシ）
//  役割：ブラウザ → Vercel(/api/gas) → GAS の中継役
//        ・CORS 問題を解消
//        ・GAS のリダイレクト（302）を POST のまま追いかける
// ============================================================

module.exports = async function handler(req, res) {

  // ── CORS ヘッダー ──────────────────────────────────────────
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')   return res.status(405).json({ error: 'Method not allowed' });

  // ── GAS の URL を環境変数から取得 ─────────────────────────
  var GAS_URL = process.env.GAS_URL;
  if (!GAS_URL) {
    return res.status(500).json({
      error: '環境変数 GAS_URL が設定されていません。Vercel の設定を確認してください。'
    });
  }

  // ── GAS へリクエストを中継（リダイレクトを POST のまま追う） ─
  var bodyStr = JSON.stringify(req.body);

  async function postTo(url) {
    return fetch(url, {
      method:  'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body:    bodyStr,
      redirect: 'manual',   // 手動でリダイレクトを追う（GAS は 302 を返す）
    });
  }

  try {
    var response = await postTo(GAS_URL);

    // GAS の 302 リダイレクトを POST のまま追いかける（最大 5 回）
    var hops = 0;
    while ([301, 302, 303, 307, 308].includes(response.status) && hops < 5) {
      var location = response.headers.get('location');
      if (!location) break;
      response = await postTo(location);
      hops++;
    }

    // GAS からのレスポンスを JSON としてパース
    var text = await response.text();
    var data;
    try {
      data = JSON.parse(text);
    } catch (_) {
      data = { error: 'GAS からのレスポンスが JSON ではありません', raw: text.slice(0, 200) };
    }

    return res.status(200).json(data);

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
