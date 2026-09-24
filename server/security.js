import crypto from 'crypto';

function envList(name) {
  return String(process.env[name] || '')
    .split(',')
    .map((value) => value.trim().replace(/\/$/, ''))
    .filter(Boolean);
}

function normalizeOrigin(value) {
  if (!value) return '';
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) return '';
    return url.origin;
  } catch {
    return '';
  }
}

export function allowedCorsOrigins() {
  const configured = [
    ...envList('CORS_ORIGINS'),
    process.env.FRONTEND_URL,
    process.env.PUBLIC_SITE_URL,
    process.env.PUBLIC_APP_URL,
    process.env.CERT_BASE_URL,
  ]
    .map(normalizeOrigin)
    .filter(Boolean);

  if (process.env.NODE_ENV !== 'production') {
    configured.push('http://localhost:5173', 'http://127.0.0.1:5173');
  }

  return [...new Set(configured)];
}

export function corsOptions() {
  const allowed = new Set(allowedCorsOrigins());
  return {
    origin(origin, callback) {
      // Requests without Origin are server-to-server, CLI, health checks, or direct navigation.
      if (!origin) return callback(null, true);
      const normalized = normalizeOrigin(origin);
      if (normalized && allowed.has(normalized)) return callback(null, true);
      return callback(Object.assign(new Error('Origin is not allowed by CORS.'), { status: 403 }));
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type'],
    credentials: false,
    maxAge: 600,
  };
}

export function securityHeaders(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'none'; style-src 'unsafe-inline'; img-src 'self' data:; script-src 'none'; frame-src 'self'; connect-src 'self'; frame-ancestors 'self'; base-uri 'none'; form-action 'self'"
  );

  if (req.secure) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }

  next();
}

const buckets = new Map();
let lastSweep = Date.now();

function sweepExpired(now) {
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [key, value] of buckets) {
    if (value.resetAt <= now) buckets.delete(key);
  }
}

function clientKey(req) {
  // req.ip is proxy-aware only when Express trust proxy is configured.
  return String(req.ip || req.socket?.remoteAddress || 'unknown');
}

export function createRateLimiter({ windowMs = 60_000, max = 120, namespace = 'global' } = {}) {
  return (req, res, next) => {
    const now = Date.now();
    sweepExpired(now);
    const key = `${namespace}:${clientKey(req)}`;
    let bucket = buckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + windowMs };
      buckets.set(key, bucket);
    }

    bucket.count += 1;
    if (buckets.size > 50_000) {
      // This limiter is a secondary origin safeguard, not a replacement for an edge WAF.
      const oldestKey = buckets.keys().next().value;
      if (oldestKey && oldestKey !== key) buckets.delete(oldestKey);
    }
    const remaining = Math.max(0, max - bucket.count);
    res.setHeader('RateLimit-Limit', String(max));
    res.setHeader('RateLimit-Remaining', String(remaining));
    res.setHeader('RateLimit-Reset', String(Math.ceil(bucket.resetAt / 1000)));

    if (bucket.count > max) {
      const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
      res.setHeader('Retry-After', String(retryAfter));
      return res.status(429).json({ message: 'Слишком много запросов. Повторите попытку позже.' });
    }

    next();
  };
}

export function requestId(req, res, next) {
  const incoming = String(req.headers['x-request-id'] || '');
  const safeIncoming = /^[A-Za-z0-9._:-]{8,128}$/.test(incoming) ? incoming : '';
  const id = safeIncoming || crypto.randomUUID();
  req.requestId = id;
  res.setHeader('X-Request-Id', id);
  next();
}
