import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { query, pool } from './db.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const adminName = process.argv[2] || process.env.SEED_ADMIN_NAME || '';
const adminEmail = (process.argv[3] || process.env.SEED_ADMIN_EMAIL || '').trim().toLowerCase();
const adminPassword = process.argv[4] || process.env.SEED_ADMIN_PASSWORD || '';

async function main() {
  if (adminName.trim().length < 2) throw new Error('Provide admin name as argument or SEED_ADMIN_NAME.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail)) throw new Error('Provide a valid admin email.');
  if (adminPassword.length < 12 || adminPassword.length > 128) throw new Error('Admin password must contain 12–128 characters.');

  const schema = await fs.readFile(path.join(__dirname, 'schema.sql'), 'utf8');
  await query(schema);

  const passwordHash = await bcrypt.hash(adminPassword, 12);
  const result = await query(
    `INSERT INTO users (name, email, password_hash, role)
     VALUES ($1, $2, $3, 'admin')
     ON CONFLICT (email) DO NOTHING
     RETURNING id`,
    [adminName.trim(), adminEmail, passwordHash]
  );

  console.log(result.rowCount ? `Admin created: ${adminEmail}` : `Admin already exists: ${adminEmail}`);
}

main()
  .catch((error) => {
    console.error(error.message || error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
