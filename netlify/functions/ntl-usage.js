// Netlify Function: Netlify 사용량 + 실제 결제 내역 조회
// bb-api 엔드포인트 사용 (Netlify 앱 내부 API)
const https = require('https');

exports.handler = async (event, context) => {
  context.callbackWaitsForEmptyEventLoop = false;

  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'GET') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  const TOKEN = process.env.NETLIFY_TOKEN;
  if (!TOKEN) return { statusCode: 500, headers, body: JSON.stringify({ error: 'NETLIFY_TOKEN 환경변수 미설정' }) };

  function ntlRequest(hostname, path) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('timeout')), 15000);
      const options = {
        hostname,
        port: 443,
        path,
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${TOKEN}`,
          'Content-Type': 'application/json',
          'User-Agent': 'ICTSamjung-JG-ServiceMonitor/1.0',
        }
      };
      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          clearTimeout(timer);
          try { resolve({ status: res.statusCode, data: JSON.parse(data) }); }
          catch(e) { resolve({ status: res.statusCode, raw: data.slice(0, 300) }); }
        });
      });
      req.on('error', (e) => { clearTimeout(timer); reject(e); });
      req.end();
    });
  }

  try {
    // 공개 API + bb-api 병렬 조회
    const [accountsRes, siteRes, receiptsRes] = await Promise.all([
      ntlRequest('api.netlify.com', '/api/v1/accounts'),
      ntlRequest('api.netlify.com', '/api/v1/sites/ictsamjung.netlify.app'),
      // 실제 결제 내역 — bb-api 엔드포인트
      ntlRequest('app.netlify.com', '/access-control/bb-api/api/v1/kisspkn7/receipts'),
    ]);

    const accounts = Array.isArray(accountsRes.data) ? accountsRes.data : [];
    const account = accounts[0] || {};
    const site = siteRes?.data;

    // 결제 내역 파싱
    const receipts = Array.isArray(receiptsRes.data) ? receiptsRes.data.map(r => ({
      id: r.id,
      date: r.transaction_created_at,
      amount: r.display_amount,
      created_at: r.created_at,
      transaction_id: r.transaction_id,
    })) : [];

    const summary = {
      account: {
        name: account.name || 'kisspkn7\'s team',
        slug: account.slug || 'kisspkn7',
        plan: account.type_name || account.plan || 'Personal',
        build_minutes_used: account.build_minutes_used || 0,
        build_minutes_included: account.build_minutes_included || 300,
        next_billing_period_start: account.next_billing_period_start || null,
        current_billing_period_start: account.current_billing_period_start || null,
      },
      site: site ? {
        name: site.name,
        url: site.url,
        published_deploy: site.published_deploy ? {
          created_at: site.published_deploy.created_at,
        } : null,
      } : null,
      // 실제 결제 내역
      billing: {
        invoices: receipts,
      },
    };

    return { statusCode: 200, headers, body: JSON.stringify(summary) };
  } catch (e) {
    console.error('[ntl-usage] 오류:', e.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};
