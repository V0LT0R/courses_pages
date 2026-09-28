import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import PDFDocument from 'pdfkit';
import Papa from 'papaparse';
import { manualCertificateInput, certificateFilters } from '../../server/validation.js';
import { loadGeneratedCertificates } from '../../server/generatedCertificateImport.js';
const input = { request_id: '11111111-1111-4111-8111-111111111111', full_name: 'Тестовый Участник', course_name: 'Курс', issuer: 'AQUAGEO.KZ', city: 'Астана', issued_on: '2020-09-15' };
test('manual numbers are stable across retries and snapshots are validated', () => {
  assert.equal(manualCertificateInput(input).certificate_number, manualCertificateInput(input).certificate_number);
  assert.equal(manualCertificateInput({ ...input, certificate_number: '  AQ-ARCHIVE-1234  ' }).certificate_number, 'AQ-ARCHIVE-1234');
  for (const change of [{ issued_on: '2026-02-30' }, { issued_on: '2099-01-01' }, { full_name: '' }, { academic_hours: 0 }, { score: 101 }, { academic_hours: '1.5' }, { user_id: 'invalid' }])
    assert.throws(() => manualCertificateInput({ ...input, ...change }));
});
test('registry filters reject invalid paging and repeated query params', () => {
  assert.deepEqual(certificateFilters({ course: 'external', search: ' Иван ', page: '2' }), { course: 'external', search: 'Иван', page: 2 });
  for (const query of [{ page: '-1' }, { page: '1.5' }, { search: ['a', 'b'] }, { course: 'invalid' }]) assert.throws(() => certificateFilters(query));
});
test('certificate import preserves registry data and rejects changed PDF hashes', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'aquageo-certificate-test-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const metadata = { course_name: 'Test course', issuer: 'Test issuer', city: 'Test city' };
  await fs.writeFile(path.join(directory, 'certificate_metadata.json'), JSON.stringify(metadata));
  const rows = [];
  const pdfs = [];
  for (let index = 1; index <= 2; index++) {
    const document = new PDFDocument();
    const chunks = [];
    const completed = new Promise((resolve, reject) => {
      document.on('data', chunk => chunks.push(chunk));
      document.on('end', () => resolve(Buffer.concat(chunks)));
      document.on('error', reject);
    });
    document.text(`Synthetic certificate ${index}`);
    document.end();
    const pdf = await completed;
    pdfs.push(pdf);
    const filename = `certificate-${index}.pdf`;
    await fs.writeFile(path.join(directory, filename), pdf);
    rows.push([`AQ-TEST-${index}`, 'Test', `Participant ${index}`, `Test Participant ${index}`,
      '18', '2020-09-15', filename, `https://example.com/${filename}`,
      crypto.createHash('sha256').update(pdf).digest('hex')]);
  }
  await fs.writeFile(path.join(directory, 'certificates_registry.csv'), Papa.unparse(rows));
  const planned = await loadGeneratedCertificates(directory);
  assert.equal(planned.length, rows.length);
  for (const [index, row] of planned.entries()) {
    assert.deepEqual(row.payload, {
      ...metadata, certificate_number: rows[index][0], full_name: rows[index][3],
      issued_on: '2020-09-15', academic_hours: 18, score: null, course_id: null, user_id: null,
    });
    assert.deepEqual(row.pdf, pdfs[index]);
    assert.equal(row.sha256, rows[index][8]);
    assert.equal(row.originalUrl, rows[index][7]);
  }
  await fs.appendFile(path.join(directory, rows[0][6]), '\n% modified');
  await assert.rejects(loadGeneratedCertificates(directory), /Контрольная сумма PDF отличается от CSV/);
});
