import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../../server/app.js';
import { httpError, publicCertificate } from '../../server/validation.js';
const input = { certificate_number: 'AQ-ADMIN-1234', full_name: 'Иван Иванов', course_name: 'Архивный курс',
  issued_on: '2020-09-15', academic_hours: 18, issuer: 'AQUAGEO.KZ', city: 'Астана' };
let created, calls = 0, filters;
const gateway = {
  async authenticate(token) { if (!['admin', 'manager', 'student'].includes(token)) throw httpError(401, 'Нет доступа.'); return { id: token }; },
  async requireRole(user, roles) { if (!roles.includes(user.id)) throw httpError(403, 'Недостаточно прав.'); },
  async createCertificate(user, payload) {
    calls++;
    if (created) throw httpError(409, 'Сертификат уже существует.');
    created = publicCertificate({ ...payload, issued_at: payload.issued_on, status: 'active', user_id: 'private', issued_by: user.id }); return created;
  },
  async listCertificates(_user, values) { filters = values; return { items: created ? [created] : [], count: created ? 1 : 0, page_size: 25 }; },
  async find(number) { return number === created?.certificate_number ? created : null; },
  async getPdf() { return { pdf_base64: Buffer.from('%PDF-original').toString('base64') }; },
};
let server, url;
test.before(async () => {
  server = createApp({ gateway, env: { PUBLIC_APP_URL: 'http://localhost:5173' }, logger: { info() {}, error() {} } }).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve)); url = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => new Promise(resolve => server.close(resolve)));
const request = (method, token, payload, path = '/api/admin/certificates') => fetch(url + path, {
  method, headers: { Authorization: token ? `Bearer ${token}` : '', 'Content-Type': 'application/json' },
  ...(payload ? { body: JSON.stringify(payload) } : {}),
});
test('anonymous, students and managers cannot list or create certificates', async () => {
  for (const token of ['', 'student', 'manager']) for (const method of ['GET', 'POST']) {
    const response = await request(method, token, method === 'POST' ? input : undefined);
    assert.equal(response.status, token ? 403 : 401);
  }
  assert.equal(calls, 0);
});
test('admin creates validated certificate; untrusted status/issuer actor fields are ignored', async () => {
  const response = await request('POST', 'admin', { ...input, status: 'revoked', issued_by: 'forged' });
  assert.equal(response.status, 201);
  const body = await response.json(); assert.equal(body.full_name, input.full_name); assert.equal(body.status, 'active');
  assert.equal(body.issued_by, undefined); assert.equal(body.user_id, undefined); assert.match(body.verify_url, /\/verify\/AQ-ADMIN-1234$/);
  assert.equal((await request('POST', 'admin', input)).status, 409);
});
test('admin filters and paging are validated at HTTP boundary', async () => {
  assert.equal((await request('GET', 'admin', null, '/api/admin/certificates?course=external&page=1&search=Иван')).status, 200);
  assert.deepEqual(filters, { course: 'external', page: 1, search: 'Иван' });
  assert.equal((await request('GET', 'admin', null, '/api/admin/certificates?page=-1')).status, 400);
  assert.equal((await request('POST', 'admin', { ...input, issued_on: '2026-02-30' })).status, 400);
});
test('manual certificate can be verified publicly; missing number returns 404; original PDF is served', async () => {
  const response = await fetch(`${url}/api/v1/verify/${input.certificate_number}`);
  const body = await response.json(); assert.equal(response.status, 200); assert.equal(body.valid, true);
  for (const field of ['user_id', 'email', 'issued_by']) assert.equal(body[field], undefined);
  assert.equal((await fetch(`${url}/api/v1/verify/AQ-NOT-FOUND`)).status, 404);
  const pdf = await fetch(`${url}/api/certificates/${input.certificate_number}/pdf`);
  assert.equal(await pdf.text(), '%PDF-original');
});
