const http = require('http');
const https = require('https');
const { URL } = require('url');
const { pipeline } = require('stream/promises');

/**
 * GET urlString (following redirects) and stream the final 200 body to an Express response.
 * Used so clients (e.g. Expo File.downloadFileAsync) get one 200 + bytes instead of a 302 to CDN.
 *
 * @param {string} urlString
 * @param {import('express').Response} expressRes
 * @param {{ filename: string; fallbackContentType?: string }} opts
 */
async function proxyHttpUrlToExpressResponse(urlString, expressRes, opts) {
  const { filename, fallbackContentType } = opts;
  let current = urlString;

  for (let hop = 0; hop < 12; hop += 1) {
    const incoming = await new Promise((resolve, reject) => {
      const u = new URL(current);
      const lib = u.protocol === 'https:' ? https : http;
      const req = lib.get(
        current,
        { headers: { 'User-Agent': 'GOPASS-travel-order/1.0' } },
        (res) => resolve(res)
      );
      req.on('error', reject);
      req.setTimeout(120000, () => {
        req.destroy(new Error('Upstream timeout'));
      });
    });

    if (incoming.statusCode >= 300 && incoming.statusCode < 400 && incoming.headers.location) {
      current = new URL(incoming.headers.location, current).href;
      incoming.resume();
      continue;
    }

    if (incoming.statusCode !== 200) {
      incoming.resume();
      const err = new Error(`Upstream HTTP ${incoming.statusCode}`);
      err.statusCode = incoming.statusCode;
      throw err;
    }

    const rawCt = incoming.headers['content-type'];
    const ct =
      (rawCt && String(rawCt).split(';')[0].trim()) ||
      fallbackContentType ||
      'application/octet-stream';
    expressRes.setHeader('Content-Type', ct);
    expressRes.setHeader('Content-Disposition', `inline; filename="${filename}"`);

    await pipeline(incoming, expressRes);
    return;
  }

  throw new Error('Too many redirects when fetching remote attachment');
}

module.exports = { proxyHttpUrlToExpressResponse };
