const http = require('http');const https = require('https');
const { URL } = require('url');

/** Max bytes to buffer when proxying (travel supporting files are capped at 5 MB each in routes). */
const PROXY_MAX_BYTES = 12 * 1024 * 1024;

/**
 * GET urlString (following redirects) and send the final 200 body to an Express response.
 * Used so clients (e.g. mobile fetch) get one 200 + bytes from our API.
 *
 * Buffers the upstream body up to PROXY_MAX_BYTES for reliability (avoids stream/pipeline
 * issues between undici fetch and Express in some Node versions).
 *
 * @param {string} urlString
 * @param {import('express').Response} expressRes
 * @param {{ filename: string; fallbackContentType?: string }} opts
 */
async function proxyHttpUrlToExpressResponse(urlString, expressRes, opts) {
  const { filename, fallbackContentType } = opts;

  if (typeof globalThis.fetch === 'function') {
    const response = await globalThis.fetch(urlString, {
      redirect: 'follow',
      headers: { 'User-Agent': 'GOPASS-travel-order/1.0', Accept: '*/*' },
    });

    if (!response.ok) {
      const err = new Error(`Upstream HTTP ${response.status}`);
      err.statusCode = response.status;
      throw err;
    }

    const lenHeader = response.headers.get('content-length');
    if (lenHeader) {
      const n = parseInt(lenHeader, 10);
      if (Number.isFinite(n) && n > PROXY_MAX_BYTES) {
        const err = new Error(`Upstream body too large (${n} bytes)`);
        err.statusCode = 413;
        throw err;
      }
    }

    const ab = await response.arrayBuffer();
    if (ab.byteLength > PROXY_MAX_BYTES) {
      const err = new Error(`Upstream body too large (${ab.byteLength} bytes)`);
      err.statusCode = 413;
      throw err;
    }

    const rawCt = response.headers.get('content-type');
    const ct =
      (rawCt && String(rawCt).split(';')[0].trim()) ||
      fallbackContentType ||
      'application/octet-stream';
    expressRes.setHeader('Content-Type', ct);
    expressRes.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    expressRes.send(Buffer.from(ab));
    return;
  }

  let current = urlString;
  for (let hop = 0; hop < 12; hop += 1) {
    const incoming = await new Promise((resolve, reject) => {
      const lib = new URL(current).protocol === 'https:' ? https : http;
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

    const chunks = [];
    for await (const chunk of incoming) {
      chunks.push(chunk);
      let total = 0;
      for (const c of chunks) total += c.length;
      if (total > PROXY_MAX_BYTES) {
        incoming.destroy();
        const err = new Error('Upstream body too large');
        err.statusCode = 413;
        throw err;
      }
    }
    expressRes.send(Buffer.concat(chunks));
    return;
  }

  throw new Error('Too many redirects when fetching remote attachment');
}

module.exports = { proxyHttpUrlToExpressResponse };
