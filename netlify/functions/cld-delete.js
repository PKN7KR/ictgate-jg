
const https = require('https');

exports.handler = async (event, context) => {
  context.callbackWaitsForEmptyEventLoop = false;

  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch (e) { return { statusCode: 400, headers, body: JSON.stringify({ error: '잘못된 요청' }) }; }

  const { public_ids } = body;
  if (!public_ids || !Array.isArray(public_ids) || !public_ids.length) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'public_ids 필요' }) };
  }

  const CLD_CLOUD  = process.env.CLD_CLOUD_NAME || 'darovuaxi';
  const CLD_KEY    = process.env.CLD_API_KEY;
  const CLD_SECRET = process.env.CLD_API_SECRET;

  if (!CLD_KEY || !CLD_SECRET) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: '환경변수 미설정' }) };
  }

  function cldDelete(ids) {
    return new Promise((resolve, reject) => {
      const qs = ids.map(id => `public_ids[]=${encodeURIComponent(id)}`).join('&') + '&invalidate=true';
      const path = `/v1_1/${CLD_CLOUD}/resources/image/upload?${qs}`;
      const options = {
        hostname: 'api.cloudinary.com',
        port: 443,
        path: path,
        method: 'DELETE',
        auth: `${CLD_KEY}:${CLD_SECRET}`,
        headers: { 'Content-Type': 'application/json' }
      };
      cons
