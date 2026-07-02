// Netlify Function: Netlify 사용량 + 결제 내역 조회
// 읽기 전용 — 실데이터에 영향 없음
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
          catch(e) { resolve({ status: res.statusCode, raw: data.slice(0, 300) }); }
        });
      });
      req.on('error', (e) => { clearTimeout(timer); reject(e); });
      req.end();
    });
  }

  try {
    // 계정 + 사이트 + 결제 병렬 조회
    const [accountsRes, siteRes] = await Promise.all([
      ntlRequest('/accounts'),
      ntlRequest('/sites/ictsamjung.netlify.app'),
    ]);

    const accounts = Array.isArray(accountsRes.data) ? accountsRes.data : [];
    const account = accounts[0] || {};
    const slug = account.slug;
    const site = siteRes?.data;

    // 결제 내역 조회
    let billing = null;
    if (slug) {
      const billingRes = await ntlRequest(`/accounts/${slug}/billing`).catch(() => null);
      billing = billingRes?.data || null;

      // 인보이스 내역 조회
      const invoicesRes = await ntlRequest(`/accounts/${slug}/invoices`).catch(() => null);
      if (invoicesRes?.data) billing = { ...billing, invoices: invoicesRes.data };
    }

    const summary = {
      account: {
        name: account.name || slug,
        slug,
        plan: account.type_name || account.plan || 'Personal',
        created_at: account.created_at || null,
        // 빌드 시간
        build_minutes_used: account.build_minutes_used || 0,
        build_minutes_included: account.build_minutes_included || 300,
        // 크레딧
        credits_used: account.credits_used || null,
        credits_included: account.credits_included || null,
        // 대역폭
        bandwidth_usage: account.bandwidth_usage || null,
      },
      site: site ? {
        name: site.name,
        url: site.url,
        published_deploy: site.published_deploy ? {
          created_at: site.published_deploy.created_at,
          branch: site.published_deploy.branch,
        } : null,
      } : null,
      billing,
      // 전체 raw 데이터 (필드 파악용)
      _raw_account_keys: Object.keys(account),
    };

    return { statusCode: 200, headers, body: JSON.stringify(summary) };
  } catch (e) {
    console.error('[ntl-usage] 오류:', e.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};
