import test from 'node:test';
import assert from 'node:assert/strict';
import { generateCertificatePdf, renderCertificateHtml } from '../server/certificateService.js';
import { publicCertificate } from '../server/validation.js';

const cert = { certificate_number: 'AQ-PREVIEW-12345', full_name: 'Аманалы Айдана', course_name: 'Мониторинг водных ресурсов',
  academic_hours: 18, issued_at: '2026-09-24T00:00:00Z', issuer: 'AQUAGEO.KZ', status: 'active', verify_url: 'https://example.invalid/verify/AQ-PREVIEW-12345' };
test('certificate verification displays actual title and snapshotted hours', () => {
  const html = renderCertificateHtml(cert);
  assert.ok(html.includes(cert.course_name)); assert.ok(html.includes(cert.full_name));
  assert.match(html, /18 академических часов/); assert.match(html, /24\.09\.2026/);
  assert.match(html, /\/api\/certificates\/AQ-PREVIEW-12345\/pdf/);
});
test('unknown legacy hours are omitted, not replaced with invented program duration', () => {
  assert.doesNotMatch(renderCertificateHtml({ ...cert, academic_hours: null }), /Объём программы/);
});
test('PDF supports Kazakh names and maximum certificate fields on generation', async () => {
  const pdf = await generateCertificatePdf({ ...cert, full_name: 'Ә Қ Ғ Ң Ө Ұ Ү Һ І '.repeat(7).slice(0, 120), course_name: 'Водные ресурсы '.repeat(25).slice(0, 300) });
  assert.equal(pdf.subarray(0, 5).toString(), '%PDF-'); assert.ok(pdf.length > 10000);
});
test('public snapshot exposes only certificate facts, including immutable academic hours', () => {
  const result = publicCertificate({ certificate_number: cert.certificate_number, full_name_snapshot: cert.full_name,
    course_title_snapshot: cert.course_name, academic_hours_snapshot: 18, city_snapshot: 'Астана', user_id: 'private', email: 'private' });
  assert.equal(result.academic_hours, 18); assert.equal(result.city, 'Астана'); assert.equal(result.user_id, undefined); assert.equal(result.email, undefined);
});
