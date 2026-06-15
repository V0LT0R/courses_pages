import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  console.warn('DATABASE_URL is not configured.');
}

function shouldUseSsl(connectionString = '') {
  return /sslmode=require/i.test(connectionString) || (/^postgres/i.test(connectionString) && !/localhost|127\.0\.0\.1/i.test(connectionString));
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: shouldUseSsl(process.env.DATABASE_URL) ? { rejectUnauthorized: false } : false,
});

export async function query(text, params = []) {
  return pool.query(text, params);
}
