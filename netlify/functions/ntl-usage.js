const https = require('https');

exports.handler = async (event, context) => {
  context.callbackWaitsForEmptyEventLoop = false;
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };

  const TOKEN = process.env.NETLIFY_TOKEN;
  if (!TOKEN) return { statusCode: 500, headers, body: JSON.stringify({ error: 'NETLIFY_TOKEN 미설정' }) };

  function req(hostname, path) {
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('timeout')), 15000);
      https.request({ hostname, port: 443, path, method: 'GET',
        headers: { 'Authorization': `Bearer ${TOKEN}`, 'Content-Type': 'application/json', 'User-Agent': 'ICTSamjung-JG/1.0' }
      }, (res) => {
        let d = '';
        res.on('data', c => d += c);
        res.on('end', () => { clearTimeout(t); try { resolve({ status: res.statusCode, data: JSON.parse(d) }); } catch(e) { resolve({ status: res.statusCode, raw: d.slice(0,200) }); }});
      }).on('error', e => { clearTimeout(t); reject(e); }).end();
    });
  }

  try {
    const [accRes, siteRes, rcRes] = await Promise.all([
      req('api.netlify.com', '/api/v1/accounts'),
      req('api.netlify.com', '/api/v1/sites/ictsamjung.netlify.app'),
      req('app.netlify.com', '/access-control/bb-api/api/v1/kisspkn7/receipts'),
    ]);

    const acc = Array.isArray(accRes.data) ? accRes.data[0] : {};
    const site = siteRes?.data;

    // receipts 파싱 — 실제 필드: id, display_amount, created_at, transaction_created_at
    const receipts = Array.isArray(rcRes.data) ? rcRes.data.map(r => ({
      id: r.id,
      // 날짜: created_at ISO 형식 사용
      date: new Date(r.created_at).toLocaleDateString('ko-KR', {
        year: 'numeric', month: 'long', day: 'numeric'
      }),
      // 금액: display_amount 그대로 사용 ($5.00 형식)
      amount: r.display_amount,
    })) : [];

    return { statusCode: 200, headers, body: JSON.stringify({
      account: {
        name: acc.name || "kisspkn7's team",
        slug: acc.slug || 'kisspkn7',
        plan: acc.type_name || 'Personal',
        build_minutes_used: acc.build_minutes_used || 0,
        build_minutes_included: acc.build_minutes_included || 300,
        next_billing_period_start: acc.next_billing_period_start || null,
      },
      site: site ? {
        url: site.url,
        published_deploy: site.published_deploy ? { created_at: site.published_deploy.created_at } : null,
      } : null,
      billing: { invoices: receipts },
    })};
  } catch(e) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};
