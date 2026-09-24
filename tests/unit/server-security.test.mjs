import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
  allowedCorsOrigins,
  corsOptions,
  createRateLimiter,
  requestId,
  securityHeaders,
} from '../../server/security.js';

function withEnv(values, fn) {
  const previous = {};
  for (const [key, value] of Object.entries(values)) {
    previous[key] = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    return fn();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

function rawEd25519Pair() {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519');
  const privateDer = privateKey.export({ format: 'der', type: 'pkcs8' });
  const publicDer = publicKey.export({ format: 'der', type: 'spki' });
  return {
    privateRaw: privateDer.subarray(privateDer.length - 32).toString('base64'),
    publicRaw: publicDer.subarray(publicDer.length - 32).toString('base64'),
  };
}

function makeResponse() {
  return {
    headers: new Map(),
    statusCode: 200,
    body: null,
    setHeader(name, value) { this.headers.set(String(name).toLowerCase(), String(value)); },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

test('development CORS includes local Vite origins and deduplicates configured origins', () => {
  withEnv({
    NODE_ENV: 'development',
    CORS_ORIGINS: 'https://example.org/,https://example.org',
    FRONTEND_URL: undefined,
    PUBLIC_SITE_URL: undefined,
    CERT_BASE_URL: undefined,
  }, () => {
    const origins = allowedCorsOrigins();
    assert.equal(origins.filter((v) => v === 'https://example.org').length, 1);
    assert.ok(origins.includes('http://localhost:5173'));
    assert.ok(origins.includes('http://127.0.0.1:5173'));
  });
});

test('CORS rejects an untrusted browser origin', async () => {
  await withEnv({ NODE_ENV: 'production', CORS_ORIGINS: 'https://trusted.example' }, async () => {
    const options = corsOptions();
    const err = await new Promise((resolve) => options.origin('https://evil.example', (error) => resolve(error)));
    assert.ok(err instanceof Error);
    assert.equal(err.status, 403);
  });
});

test('request IDs are generated safely and unsafe incoming IDs are ignored', () => {
  const req = { headers: { 'x-request-id': '<script>alert(1)</script>' } };
  const res = makeResponse();
  requestId(req, res, () => {});
  assert.match(req.requestId, /^[0-9a-f-]{36}$/i);
  assert.equal(res.headers.get('x-request-id'), req.requestId);
});

test('security headers include the principal browser hardening headers', () => {
  const req = { headers: { 'x-forwarded-proto': 'https' }, secure: true };
  const res = makeResponse();
  securityHeaders(req, res, () => {});
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(res.headers.get('x-frame-options'), 'SAMEORIGIN');
  assert.match(res.headers.get('content-security-policy'), /default-src 'none'/);
  assert.match(res.headers.get('strict-transport-security'), /max-age=31536000/);
});

test('rate limiter returns 429 after the configured limit', () => {
  const limiter = createRateLimiter({ windowMs: 60_000, max: 2, namespace: `test-${crypto.randomUUID()}` });
  const req = { ip: '203.0.113.10', socket: {} };
  const first = makeResponse();
  const second = makeResponse();
  const third = makeResponse();
  let nextCount = 0;
  limiter(req, first, () => { nextCount += 1; });
  limiter(req, second, () => { nextCount += 1; });
  limiter(req, third, () => { nextCount += 1; });
  assert.equal(nextCount, 2);
  assert.equal(third.statusCode, 429);
  assert.equal(typeof third.body?.message, 'string');
  assert.equal(third.headers.get('ratelimit-remaining'), '0');
});
