// Netlify Function: Netlify 사용량 조회 (Personal Access Token)
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
      const timer = setTimeout(() => reject(new Error('Netlify API timeout')), 15000);
      const options = {
        hostname: 'api.netlify.com',
        port: 443,
        path: `/api/v1${path}`,
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${TOKEN}`,
          'Content-Type': 'application/json',
          'User-Agent': 'ICTGate-JG-ServiceMonitor/1.0',
        }
      };
      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          clearTimeout(timer);
          try { resolve({ status: res.statusCode, data: JSON.parse(data) }); }
          catch(e) { resolve({ status: res.statusCode, raw: data.slice(0, 200) }); }
        });
      });
      req.on('error', (e) => { clearTimeout(timer); reject(e); });
      req.end();
    });
  }

  try {
    // 1. 계정 목록 조회
    const accountsRes = await ntlRequest('/accounts');
    if (accountsRes.status !== 200) {
      return { statusCode: accountsRes.status, headers, body: JSON.stringify({ error: 'Netlify 계정 조회 실패', detail: accountsRes.data || accountsRes.raw }) };
    }

    const accounts = Array.isArray(accountsRes.data) ? accountsRes.data : [];
    const account = accounts[0];
    if (!account) return { statusCode: 404, headers, body: JSON.stringify({ error: '계정 없음' }) };

    const slug = account.slug;
    const plan = account.type_name || account.plan || '알 수 없음';
    const name = account.name || slug;

    // 2. 배포 목록 조회 (최근 배포 수 카운트)
    const deploysRes = await ntlRequest(`/sites/ictsamjung/deploys?per_page=1`).catch(()=>null);

    // 3. 사이트 정보 조회
    const siteRes = await ntlRequest(`/sites/ictsamjung.netlify.app`).catch(()=>null);
    const site = siteRes?.data;

    // 4. 빌드 사용량 조회
    const buildRes = await ntlRequest(`/accounts/${slug}/builds?per_page=1`).catch(()=>null);

    const summary = {
      account: {
        name,
        slug,
        plan,
        created_at: account.created_at || null,
      },
      site: site ? {
        name: site.name,
        url: site.url,
        published_deploy: site.published_deploy ? {
          created_at: site.published_deploy.created_at,
          branch: site.published_deploy.branch,
        } : null,
      } : null,
      billing: {
        plan,
        // 크레딧 기반 플랜
        credits_used: account.credits_used || null,
        credits_included: account.credits_included || null,
        bandwidth_usage: account.bandwidth_usage || null,
        build_minutes_used: account.build_minutes_used || null,
        build_minutes_included: account.build_minutes_included || null,
      },
      raw_account: account, // 전체 데이터 (어떤 필드가 있는지 파악용)
    };

    return { statusCode: 200, headers, body: JSON.stringify(summary) };
  } catch (e) {
    console.error('[ntl-usage] 오류:', e.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};
