// Netlify Function: Cloudinary 실제 사용량 조회 (Admin API)
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

  const CLD_CLOUD  = process.env.CLD_CLOUD_NAME || 'darovuaxi';
  const CLD_KEY    = process.env.CLD_API_KEY;
  const CLD_SECRET = process.env.CLD_API_SECRET;

  if (!CLD_KEY || !CLD_SECRET) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: '환경변수 미설정' }) };
  }

  // Basic Auth 헤더를 명시적으로 생성 (auth 옵션 대신)
  const basicAuth = Buffer.from(`${CLD_KEY}:${CLD_SECRET}`).toString('base64');

  function cldRequest(path) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('timeout')), 20000);
      const options = {
        hostname: 'api.cloudinary.com',
        port: 443,
        path: `/v1_1/${CLD_CLOUD}${path}`,
        method: 'GET',
        headers: {
          'Authorization': `Basic ${basicAuth}`,
          'Content-Type': 'application/json',
        }
      };
      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          clearTimeout(timer);
          try { resolve({ status: res.statusCode, data: JSON.parse(data) }); }
          catch (e) { resolve({ status: res.statusCode, raw: data.slice(0, 300) }); }
        });
      });
      req.on('error', (e) => { clearTimeout(timer); reject(e); });
      req.end();
    });
  }

  try {
    const result = await cldRequest('/usage');
    if (result.status !== 200) {
      return { statusCode: result.status, headers, body: JSON.stringify({ error: 'Cloudinary 오류', detail: result.data || result.raw }) };
    }

    const d = result.data || {};
    const summary = {
      plan: d.plan || null,
      credits: d.credits || null,
      storage: d.storage ? {
        usage_gb: +(d.storage.usage / 1024 / 1024 / 1024).toFixed(3),
        usage_mb: +(d.storage.usage / 1024 / 1024).toFixed(2),
      } : null,
      bandwidth: d.bandwidth ? {
        usage_gb: +(d.bandwidth.usage / 1024 / 1024 / 1024).toFixed(3),
        usage_mb: +(d.bandwidth.usage / 1024 / 1024).toFixed(2),
      } : null,
      transformations: d.transformations ? { usage: d.transformations.usage } : null,
      resources: d.resources || null,
      last_updated: d.last_updated || null,
    };

    return { statusCode: 200, headers, body: JSON.stringify(summary) };
  } catch (e) {
    console.error('[cld-usage] 오류:', e.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};
