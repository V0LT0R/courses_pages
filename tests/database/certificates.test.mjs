import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
const admin = '11111111-1111-4111-8111-111111111111';
const student = '22222222-2222-4222-8222-222222222222';
const manager = '33333333-3333-4333-8333-333333333333';
const query = async (sql, params = []) => (await db.query(sql, params)).rows;
async function asRole(role, user, sql, params = []) {
  await db.exec(`begin; set local role ${role};`);
  try {
    await db.query("select set_config('request.jwt.claim.sub',$1,true)", [user || '']);
    const result = await query(sql, params); await db.exec('commit'); return result;
  } catch (error) { await db.exec('rollback'); throw error; }
}
const manual = (number, extras = {}) => ({ certificate_number: number, full_name: 'Тестовый Участник',
  course_name: 'Архивный семинар', issued_on: '2020-09-15', academic_hours: 18, issuer: 'AQUAGEO.KZ', city: 'Астана', ...extras });
const create = (user, payload) => asRole('authenticated', user, 'select * from public.admin_create_certificate($1)', [payload]);
let course;
test.before(async () => {
  await db.exec(fs.readFileSync('tests/integration/bootstrap.sql', 'utf8'));
  await db.exec(fs.readFileSync('supabase/full_schema.sql', 'utf8').replace(/create extension if not exists pgcrypto;/ig, ''));
  for (const [id, role] of [[admin, 'admin'], [student, 'student'], [manager, 'manager']])
    await query('insert into auth.users(id,email,raw_user_meta_data,raw_app_meta_data) values($1,$2,$3,$4)', [id, `${id}@example.invalid`, { full_name: 'Участник' }, { role }]);
  course = (await asRole('authenticated', admin, 'select public.save_course_with_content(null,null,$1) as id', [{ slug: 'test-certificates', title: 'Курс', sections: [] }]))[0].id;
});
test.after(() => db.close());

test('only admin can manually issue or list the entire registry', async () => {
  for (const id of [student, manager]) {
    await assert.rejects(create(id, manual('AQ-FORBIDDEN')), /Admin only/);
    await assert.rejects(asRole('authenticated', id, 'select public.admin_list_certificates()'), /Admin only/);
  }
  await assert.rejects(asRole('anon', null, 'select public.admin_create_certificate($1)', [manual('AQ-ANONYMOUS')]), /permission denied/);
  await assert.rejects(asRole('authenticated', admin, "select public.create_certificate_record($1,'manual')", [manual('AQ-INTERNAL')]), /permission denied/);
});
test('manual issuance works without an account/course; snapshots and audit actor are preserved', async () => {
  // LATERAL/function FROM avoids evaluating a volatile composite function once per projected column.
  const cert = (await asRole('authenticated', admin, 'select * from public.admin_create_certificate($1)', [manual('AQ-MANUAL-0001')]))[0];
  assert.equal(cert.user_id, null); assert.equal(cert.course_id, null); assert.equal(cert.issuance_source, 'manual');
  assert.equal(cert.issued_by, admin); assert.equal(cert.academic_hours_snapshot, 18);
  assert.equal((await query("select actor_id from public.audit_log where entity_id=$1 and entity_table='certificates'", [cert.id]))[0].actor_id, admin);
  assert.equal((await asRole('authenticated', student, 'select * from public.certificates')).length, 0);
  assert.equal((await asRole('authenticated', admin, 'select * from public.certificates')).length, 1);
  await assert.rejects(query("update public.certificates set full_name_snapshot='Подмена' where id=$1", [cert.id]), /immutable/);
});
test('duplicates and invalid dates/numbers are rejected without overwriting data', async () => {
  await assert.rejects(create(admin, manual('AQ-MANUAL-0001')), /CERTIFICATE_NUMBER_EXISTS/);
  for (const payload of [manual('bad'), manual('AQ-BAD-DATE', { issued_on: '2099-01-01' }), manual('AQ-BAD-HOURS', { academic_hours: 0 }), manual('AQ-BAD-FRACTION', { academic_hours: 1.5 }), manual('AQ-NO-NAME', { full_name: '' })])
    await assert.rejects(create(admin, payload));
  assert.equal((await query('select count(*)::int as n from public.certificates'))[0].n, 1);
});
test('linked manual certificate appears to its owner and blocks duplicate user/course issuance', async () => {
  const payload = manual('AQ-LINKED-0001', { user_id: student, course_id: course });
  await asRole('authenticated', admin, 'select * from public.admin_create_certificate($1)', [payload]);
  const owned = await asRole('authenticated', student, 'select * from public.certificates');
  assert.equal(owned.length, 1); assert.equal(owned[0].certificate_number, payload.certificate_number);
  await assert.rejects(create(admin, { ...payload, certificate_number: 'AQ-LINKED-0002' }), /unique constraint/);
  const issued = (await asRole('authenticated', student, 'select * from public.issue_certificate($1)', [course]))[0];
  assert.equal(issued.certificate_number, payload.certificate_number);
  assert.equal((await query('select count(*)::int as n from public.enrollments'))[0].n, 0);
});
test('legacy number collisions are blocked in both directions', async () => {
  await query('insert into public.legacy_certificates(certificate_number,record) values($1,$2)', ['AQ-LEGACY-0001', { certificate_number: 'AQ-LEGACY-0001', full_name: 'Архив', course_name: 'История', issued_at: '2020-01-01' }]);
  await assert.rejects(create(admin, manual('AQ-LEGACY-0001')), /CERTIFICATE_NUMBER_EXISTS/);
  await assert.rejects(query('insert into public.legacy_certificates(certificate_number,record) values($1,$2)', ['AQ-MANUAL-0001', {}]), /CERTIFICATE_NUMBER_EXISTS/);
});
test('import is backend only, atomic and idempotent, and preserves original PDF', async () => {
  const sql = 'select * from public.import_generated_certificate($1,$2,$3,$4)';
  const payload = manual('AQ-IMPORT-0001');
  const args = [payload, Buffer.from('%PDF-original-document').toString('base64'), 'a'.repeat(64), 'https://aquageo.kz/'];
  await assert.rejects(asRole('authenticated', admin, sql, args), /permission denied/);
  for (let i = 0; i < 2; i++) await asRole('service_role', null, sql, args);
  assert.equal((await query('select count(*)::int n from public.certificates where certificate_number=$1', [payload.certificate_number]))[0].n, 1);
  assert.equal((await query('select pdf_base64 from public.certificate_pdfs where certificate_number=$1', [payload.certificate_number]))[0].pdf_base64, args[1]);
  await assert.rejects(asRole('service_role', null, sql, [{ ...payload, full_name: 'Другой человек' }, ...args.slice(1)]), /CERTIFICATE_NUMBER_EXISTS/);
  await assert.rejects(asRole('service_role', null, sql, [payload, args[1], 'b'.repeat(64), args[3]]), /CERTIFICATE_PDF_CONFLICT/);
  await assert.rejects(asRole('service_role', null, sql, [manual('AQ-INVALID-PDF'), '', args[2], args[3]]), /CERTIFICATE_INVALID_PDF/);
  assert.equal((await query("select count(*)::int n from public.certificates where certificate_number='AQ-INVALID-PDF'"))[0].n, 0);
});
test('admin filters include manual, imported and legacy records and paginate with exact counts', async () => {
  for (let i = 0; i < 26; i++) await asRole('authenticated', admin, 'select * from public.admin_create_certificate($1)', [manual(`AQ-PAGE-${String(i).padStart(4, '0')}`, { full_name: `Поиск ${i}` })]);
  const listing = async (filter, search, page) => (await asRole('authenticated', admin, 'select public.admin_list_certificates($1,$2,$3) result', [filter, search, page]))[0].result;
  const first = await listing('', 'Поиск', 0), second = await listing('', 'Поиск', 1);
  assert.equal(first.count, 26); assert.equal(first.items.length, 25); assert.equal(second.items.length, 1);
  assert.equal(new Set([...first.items, ...second.items].map(item => item.certificate_number)).size, 26);
  assert.equal((await listing(course, '', 0)).count, 1);
  assert.equal((await listing('external', 'AQ-IMPORT', 0)).count, 1);
  assert.equal((await listing('', 'История', 0)).items[0].source, 'legacy');
  assert.equal((await listing('', '%', 0)).count, 0);
});
test('migration replay retains manual/imported data, original PDF and authorization', async () => {
  const before = await query('select * from public.certificates order by certificate_number');
  await db.exec(fs.readFileSync('supabase/migrate_existing_database.sql', 'utf8').replace(/create extension if not exists pgcrypto;/ig, ''));
  await db.exec(fs.readFileSync('supabase/certificate_admin_update.sql', 'utf8'));
  assert.deepEqual(await query('select * from public.certificates order by certificate_number'), before);
  await assert.rejects(asRole('authenticated', student, 'select public.admin_list_certificates()'), /Admin only/);
});
