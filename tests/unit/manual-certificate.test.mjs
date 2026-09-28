import test from 'node:test';
import assert from 'node:assert/strict';
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
test('all 39 source files match the registry hashes, numbers and metadata', async () => {
  const planned = await loadGeneratedCertificates('generated-certificates');
  assert.equal(planned.length, 39);
  assert.equal(new Set(planned.map(row => row.payload.certificate_number)).size, 39);
  for (const row of planned) {
    assert.equal(row.payload.issued_on, '2026-09-15'); assert.equal(row.payload.academic_hours, 18);
    assert.equal(row.payload.user_id, null); assert.equal(row.pdf.subarray(0, 5).toString(), '%PDF-');
  }
});
