// Netlify Function: Netlify 사용량 + 결제 내역 조회
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

  function ntlRequest(path) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('timeout')), 15000);
      const options = {
        hostname: 'api.netlify.com',
        port: 443,
        path: `/api/v1${path}`,
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
          catch(e) { resolve({ status: res.statusCode, raw: data.slice(0, 500) }); }
        });
      });
      req.on('error', (e) => { clearTimeout(timer); reject(e); });
      req.end();
    });
  }

  try {
    const [accountsRes, siteRes] = await Promise.all([
      ntlRequest('/accounts'),
      ntlRequest('/sites/ictsamjung.netlify.app'),
    ]);

    const accounts = Array.isArray(accountsRes.data) ? accountsRes.data : [];
    const account = accounts[0] || {};
    const slug = account.slug;
    const site = siteRes?.data;

    // 가능한 모든 결제 관련 엔드포인트 시도
    const endpoints = [
      `/accounts/${slug}/billing`,
      `/accounts/${slug}/invoices`,
      `/accounts/${slug}/payment_history`,
      `/accounts/${slug}/receipts`,
      `/accounts/${slug}/subscriptions`,
      `/billing/invoices`,
      `/user/invoices`,
    ];

    const results = {};
    for (const ep of endpoints) {
      if (!slug && ep.includes(slug)) continue;
      try {
        const res = await ntlRequest(ep).catch(() => null);
        results[ep] = {
          status: res?.status,
          // 전체 응답 저장 (필드 파악용)
          data: res?.data || res?.raw,
        };
      } catch(e) {
        results[ep] = { error: e.message };
      }
    }

    const summary = {
      account: {
        name: account.name || slug,
        slug,
        plan: account.type_name || account.plan || 'Personal',
        build_minutes_used: account.build_minutes_used || 0,
        build_minutes_included: account.build_minutes_included || 300,
      },
      site: site ? {
        name: site.name,
        url: site.url,
        published_deploy: site.published_deploy ? {
          created_at: site.published_deploy.created_at,
        } : null,
      } : null,
      // 실제 API 응답 전체 — 어느 엔드포인트가 작동하는지 파악
      _debug_endpoints: results,
      _raw_account_keys: Object.keys(account),
      _raw_account: account,
    };

    return { statusCode: 200, headers, body: JSON.stringify(summary) };
  } catch (e) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};
