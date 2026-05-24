import dotenv from 'dotenv';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { query, pool } from './db.js';
import { seminars } from '../src/data/seminars.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function slugify(value) {
  return String(value)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9а-яё\s-]/gi, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

async function main() {
  const schema = await fs.readFile(path.join(__dirname, 'schema.sql'), 'utf8');
  await query(schema);

  const admin = await query("SELECT id FROM users WHERE role = 'admin' ORDER BY id ASC LIMIT 1");
  if (!admin.rowCount) {
    throw new Error('Сначала создайте администратора: npm run seed:admin');
  }

  const adminId = admin.rows[0].id;

  for (const seminar of seminars) {
    await query(
      `INSERT INTO seminars (
        slug, title, category, date_text, duration, format, location,
        image_url, short_description, description, outcomes,
        lecturer_name, lecturer_role, lecturer_bio, lecturer_photo,
        certificate, rating, pdf_url, created_by
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,
        $8,$9,$10,$11,
        $12,$13,$14,$15,
        $16,$17,$18,$19
      ) ON CONFLICT (slug) DO NOTHING`,
      [
        seminar.id || slugify(seminar.title),
        seminar.title,
        seminar.category,
        seminar.date,
        seminar.duration,
        seminar.format,
        seminar.location,
        seminar.image,
        seminar.shortDescription,
        seminar.description,
        seminar.outcomes,
        seminar.lecturer.name,
        seminar.lecturer.role,
        seminar.lecturer.bio,
        seminar.lecturer.photo,
        Boolean(seminar.certificate),
        seminar.rating || 5,
        seminar.pdf || null,
        adminId,
      ]
    );
  }

  console.log(`Seeded ${seminars.length} seminars.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
