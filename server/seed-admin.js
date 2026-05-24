import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { query, pool } from './db.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const adminName = process.argv[2] || 'Admin';
const adminEmail = process.argv[3] || 'admin@example.com';
const adminPassword = process.argv[4] || 'Admin12345';

async function main() {
  const schema = await fs.readFile(path.join(__dirname, 'schema.sql'), 'utf8');
  await query(schema);

  const exists = await query('SELECT id FROM users WHERE email = $1', [adminEmail]);
  if (exists.rowCount) {
    console.log(`Admin with email ${adminEmail} already exists.`);
    return;
  }

  const passwordHash = await bcrypt.hash(adminPassword, 10);
  await query(
    `INSERT INTO users (name, email, password_hash, role)
     VALUES ($1, $2, $3, 'admin')`,
    [adminName, adminEmail, passwordHash]
  );

  console.log(`Admin created: ${adminEmail} / ${adminPassword}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
