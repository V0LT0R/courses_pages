import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import Papa from 'papaparse';
import { manualCertificateInput, detectFile } from './validation.js';

export async function loadGeneratedCertificates(directory, courseId = null) {
  const root = await fs.realpath(directory);
  const metadata = JSON.parse(await fs.readFile(path.join(root, 'certificate_metadata.json'), 'utf8'));
  const csv = Papa.parse(await fs.readFile(path.join(root, 'certificates_registry.csv'), 'utf8'), { skipEmptyLines: true });
  if (csv.errors.length || !csv.data.length) throw new Error('Некорректный CSV реестра.');
  const seen = new Set();
  const planned = [];
  for (const row of csv.data) {
    if (row.length !== 9) throw new Error('В CSV ожидаются девять столбцов без заголовка.');
    const [number, , , name, hours, date, filename, originalUrl, sha256] = row;
    if (seen.has(number)) throw new Error('В CSV повторяется номер сертификата.');
    seen.add(number);
    if (!filename || path.basename(filename) !== filename || /[\\/]/.test(filename)) throw new Error('Недопустимый путь к PDF.');
    const pdfPath = await fs.realpath(path.join(root, filename));
    if (path.dirname(pdfPath) !== root) throw new Error('PDF должен находиться в папке реестра.');
    const pdf = await fs.readFile(pdfPath);
    if (detectFile(pdf).ext !== 'pdf' || pdf.length > 3000000) throw new Error('Недопустимый PDF сертификата.');
    if (crypto.createHash('sha256').update(pdf).digest('hex') !== sha256) throw new Error('Контрольная сумма PDF отличается от CSV.');
    const original = new URL(originalUrl);
    if (!['https:', 'http:'].includes(original.protocol) || original.username || original.password) throw new Error('Недопустимая ссылка исходного PDF.');
    const payload = manualCertificateInput({ ...metadata, certificate_number: number, full_name: name,
      academic_hours: hours, issued_on: date, course_id: courseId });
    planned.push({ payload, pdf, sha256, originalUrl });
  }
  return planned;
}
