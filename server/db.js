import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  console.warn('DATABASE_URL is not configured.');
}

function shouldUseSsl(connectionString = '') {
  return /sslmode=require/i.test(connectionString)
    || (/^postgres/i.test(connectionString) && !/localhost|127\.0\.0\.1/i.test(connectionString));
}

function sslOptions(connectionString = '') {
  if (!shouldUseSsl(connectionString)) return false;
  const rejectUnauthorized = String(process.env.PGSSL_REJECT_UNAUTHORIZED || 'true').toLowerCase() !== 'false';
  return { rejectUnauthorized };
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: sslOptions(process.env.DATABASE_URL),
  max: Math.max(2, Math.min(20, Number(process.env.DB_POOL_MAX || 10))),
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
  statement_timeout: 15_000,
  query_timeout: 20_000,
  application_name: 'aquageo-courses-api',
});

pool.on('error', (error) => {
  console.error('Unexpected PostgreSQL pool error:', error);
});

export async function query(text, params = []) {
  return pool.query(text, params);
}
