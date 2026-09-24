import jwt from 'jsonwebtoken';
import { query } from './db.js';

function jwtSecret() {
  const secret = String(process.env.JWT_SECRET || '');
  if (secret.length < 32) {
    throw new Error('JWT_SECRET is missing or too short. Use at least 32 random characters.');
  }
  return secret;
}

const JWT_OPTIONS = {
  algorithm: 'HS256',
  issuer: 'aquageo-api',
  audience: 'aquageo-web',
};

export function signToken(user) {
  return jwt.sign(
    { sub: String(user.id) },
    jwtSecret(),
    { ...JWT_OPTIONS, expiresIn: '2h' }
  );
}

async function loadCurrentUser(decoded) {
  const id = Number(decoded?.sub || decoded?.id);
  if (!Number.isSafeInteger(id) || id <= 0) return null;
  const result = await query('SELECT id, name, email, role FROM users WHERE id = $1', [id]);
  return result.rows[0] || null;
}

export async function requireAuth(req, res, next) {
  const authHeader = String(req.headers.authorization || '');
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';

  if (!token) {
    return res.status(401).json({ message: 'Требуется авторизация.' });
  }

  try {
    const decoded = jwt.verify(token, jwtSecret(), JWT_OPTIONS);
    const currentUser = await loadCurrentUser(decoded);
    if (!currentUser) {
      return res.status(401).json({ message: 'Сессия недействительна. Войдите снова.' });
    }
    req.user = currentUser;
    return next();
  } catch (error) {
    if (error?.code && String(error.code).startsWith('23')) return next(error);
    return res.status(401).json({ message: 'Сессия недействительна. Войдите снова.' });
  }
}

export async function optionalAuth(req, _res, next) {
  const authHeader = String(req.headers.authorization || '');
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (!token) return next();

  try {
    const decoded = jwt.verify(token, jwtSecret(), JWT_OPTIONS);
    req.user = await loadCurrentUser(decoded);
  } catch {
    req.user = null;
  }
  return next();
}

export function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ message: 'Доступ только для администратора.' });
  }
  return next();
}
