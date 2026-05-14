const { pipeline } = require('stream/promises');
const { Readable } = require('stream');
const http = require('http');
const https = require('https');
const { URL } = require('url');

/**
 * GET urlString (following redirects) and stream the final 200 body to an Express response.
 * Used so clients (e.g. WebView / File.downloadFileAsync) get one 200 + bytes from our API.
 *
 * Prefers global fetch (Node 18+) for redirect handling; falls back to https.get loop.
 *
 * @param {string} urlString
 * @param {import('express').Response} expressRes
 * @param {{ filename: string; fallbackContentType?: string }} opts
 */
async function proxyHttpUrlToExpressResponse(urlString, expressRes, opts) {
  const { filename, fallbackContentType } = opts;

  if (typeof globalThis.fetch === 'function') {
    const res = await globalThis.fetch(urlString, {
      redirect: 'follow',
      headers: { 'User-Agent': 'GOPASS-travel-order/1.0', Accept: '*/*' },
    });

    if (!res.ok) {
      const err = new Error(`Upstream HTTP ${res.status}`);
      err.statusCode = res.status;
      throw err;
    }

    const rawCt = res.headers.get('content-type');
    const ct =
      (rawCt && String(rawCt).split(';')[0].trim()) ||
      fallbackContentType ||
      'application/octet-stream';
    expressRes.setHeader('Content-Type', ct);
    expressRes.setHeader('Content-Disposition', `inline; filename="${filename}"`);

    const body = res.body;
    if (body && typeof Readable.fromWeb === 'function') {
      const nodeReadable = Readable.fromWeb(body);
      await pipeline(nodeReadable, expressRes);
      return;
    }

    const ab = await res.arrayBuffer();
    expressRes.send(Buffer.from(ab));
    return;
  }

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
