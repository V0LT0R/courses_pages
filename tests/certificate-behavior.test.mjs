import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

test('Russian certificate uses requested participant wording and does not render duration', () => {
  const source = read('server/certificateService.js');
  assert.match(source, /выдан участнику Научно-практических семинаров и тренингов/);
  assert.doesNotMatch(source, /meta\.push\(`\$\{labels\.duration\}/);
  assert.doesNotMatch(source, /course_duration_hours \? `<div/);
});

test('certificate issue is persisted and reused per user/course', () => {
  const index = read('server/index.js');
  const schema = read('server/schema.sql');
  assert.match(index, /INSERT INTO local_certificate_records/);
  assert.match(index, /WHERE external_user_id = \$1/);
  assert.match(index, /reused: true/);
  assert.match(schema, /UNIQUE \(external_user_id, course_id\)/);
});

test('verification route renders the persisted certificate', () => {
  const index = read('server/index.js');
  assert.match(index, /app\.get\('\/verify\/:number'/);
  assert.match(index, /renderCertificateHtml/);
  assert.match(index, /SELECT \* FROM local_certificate_records WHERE certificate_number = \$1/);
});

test('npm run dev launches both backend and Vite', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.match(pkg.scripts.dev, /npm run server/);
  assert.match(pkg.scripts.dev, /npm run dev:client/);
});

test('local certificate verification URL points to backend, not the Vite frontend', () => {
  const envExample = read('.env.example');
  assert.match(envExample, /CERT_BASE_URL=http:\/\/localhost:4000/);
  assert.match(envExample, /VITE_API_URL=\/api/);
});
