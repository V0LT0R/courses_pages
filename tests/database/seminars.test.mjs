import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
const admin = '11111111-1111-4111-8111-111111111111';
const student = '22222222-2222-4222-8222-222222222222';
const stranger = '33333333-3333-4333-8333-333333333333';
const query = async (sql, params = []) => (await db.query(sql, params)).rows;
async function asUser(user, sql, params = []) {
  await db.exec('begin; set local role authenticated;');
  try {
    await db.query("select set_config('request.jwt.claim.sub',$1,true)", [user]);
    const result = await query(sql, params);
    await db.exec('commit');
    return result;
  } catch (error) { await db.exec('rollback'); throw error; }
}
const questions = [
  { type: 'single_choice', text: 'Один ответ', options: ['Да', 'Нет'], correctOptionIndex: 0 },
  { type: 'multiple_choice', text: 'Два ответа', options: ['А', 'Б', 'В'], correctOptionIndices: [0, 2] },
  { type: 'true_false', text: 'Верно?', options: ['Верно', 'Неверно'], correctOptionIndex: 1 },
  { type: 'short_answer', text: 'Город', acceptedAnswers: ['Астана', 'Astana city'] },
];
const payload = (slug, testValue = { enabled: true, passingScore: 70, timeLimitMinutes: 10, questions }) => ({
  title: 'Семинар', slug, academicHours: 18, certificate: true,
  sections: [{ title: 'Материалы', blocks: [{ type: 'text', content: 'Изучите материал.' }] }], test: testValue,
});
async function save(data, id = null) {
  const stamp = id ? (await query('select updated_at::text from public.courses where id=$1', [id]))[0].updated_at : null;
  return (await asUser(admin, 'select public.save_course_with_content($1,$2,$3) id', [id, stamp, JSON.stringify(data)]))[0].id;
}
async function ready(id, user = student) {
  await asUser(user, 'select public.enroll_in_course($1)', [id]);
  const sections = await query('select id from public.course_sections where course_id=$1', [id]);
  for (const section of sections) await asUser(user, 'select public.mark_section_completed($1)', [section.id]);
  return sections;
}
async function start(id, user = student) { return (await asUser(user, 'select * from public.start_course_test($1)', [id]))[0]; }
async function answers(attempt) {
  const rows = await query('select q.id,q.question_type,a.* from public.test_questions q join public.test_question_answers a on a.question_id=q.id where q.test_id=$1 and q.version=$2 order by q.position', [attempt.test_id, attempt.test_version]);
  return rows.map(row => ({ question_id: row.id, ...(row.question_type === 'short_answer' ? { text: '  ASTANA   city  ' } : row.question_type === 'multiple_choice' ? { option_ids: [...row.correct_option_ids].reverse() } : { option_id: row.correct_option_id }) }));
}
async function submit(attempt, input, user = student) { return (await asUser(user, 'select * from public.submit_course_test($1,$2)', [attempt.attempt_id, JSON.stringify(input)]))[0]; }
let course;
test.before(async () => {
  await db.exec(fs.readFileSync('tests/integration/bootstrap.sql', 'utf8'));
  await db.exec(fs.readFileSync('supabase/full_schema.sql', 'utf8').replace(/create extension if not exists pgcrypto;/ig, ''));
  for (const [id, role] of [[admin, 'admin'], [student, 'student'], [stranger, 'student']]) {
    await query('insert into auth.users(id,email,raw_user_meta_data,raw_app_meta_data) values($1,$2,$3,$4)', [id, `${id}@example.invalid`, { full_name: 'Тестовый Участник' }, { role }]);
  }
  course = await save(payload('mixed-test'));
  await ready(course);
});
test.after(() => db.close());

test('all four question types saved; correct answers hidden before and during an attempt', async () => {
  assert.deepEqual((await query('select question_type from public.test_questions order by position')).map(r => r.question_type), questions.map(q => q.type));
  assert.deepEqual(await asUser(student, 'select * from public.test_questions'), []);
  await start(course);
  assert.equal((await asUser(student, 'select * from public.test_questions')).length, 4);
  assert.deepEqual(await asUser(student, 'select * from public.test_question_answers'), []);
  assert.deepEqual(await asUser(stranger, 'select * from public.test_questions'), []);
  await assert.rejects(asUser(admin, 'select public.save_course_test($1,70,10,$2)', [course, JSON.stringify(questions)]), /permission denied/);
});
test('multi-select exact set and normalized accepted text score 100 on the server', async () => {
  const attempt = await start(course);
  const result = await submit(attempt, await answers(attempt));
  assert.equal(result.score, 100); assert.equal(result.correct_answers, 4); assert.equal(result.passed, true);
});
test('partial/extra choices and wrong free text do not receive credit', async () => {
  for (const extra of [false, true]) {
    const attempt = await start(course); const input = await answers(attempt);
    const other = (await query('select id from public.test_options where question_id=$1 and not(id=any($2::uuid[]))', [input[1].question_id, input[1].option_ids]))[0].id;
    input[1].option_ids = extra ? [...input[1].option_ids, other] : input[1].option_ids.slice(0, 1);
    input[3].text = 'Неверно';
    const result = await submit(attempt, input);
    assert.equal(result.score, 50); assert.equal(result.passed, false);
  }
});
test('duplicate selections, foreign options, wrong shapes and oversize text rejected atomically', async () => {
  const attempt = await start(course); const input = await answers(attempt);
  const invalid = [
    [{ ...input[1], option_ids: [input[1].option_ids[0], input[1].option_ids[0]] }],
    [{ ...input[1], option_ids: [input[0].option_id] }],
    [{ ...input[1], option_ids: [null] }],
    [{ question_id: input[1].question_id, option_id: input[1].option_ids[0] }],
    [{ ...input[0], option_ids: [input[0].option_id] }],
    [{ ...input[3], text: 'a'.repeat(501) }],
    [{ ...input[3], text: null }],
    [input[1], input[1]], [{}],
  ];
  for (const value of invalid) await assert.rejects(submit(attempt, value));
  assert.equal((await query('select completed_at from public.test_attempts where id=$1', [attempt.attempt_id]))[0].completed_at, null);
  assert.equal((await submit(attempt, input)).score, 100);
});
test('all malformed admin question payloads roll back the entire course creation', async () => {
  const invalid = [
    { ...questions[0], correctOptionIndex: null },
    { ...questions[1], correctOptionIndices: [] },
    { ...questions[1], correctOptionIndices: [0, 0] },
    { ...questions[1], correctOptionIndices: [9] },
    { ...questions[1], correctOptionIndices: [1.5] },
    { ...questions[2], options: ['A', 'B', 'C'] },
    { ...questions[3], acceptedAnswers: ['  '] },
    { ...questions[3], acceptedAnswers: [null] },
    { ...questions[0], type: 'unknown' },
  ];
  for (const question of invalid) await assert.rejects(save(payload('invalid-test', { passingScore: 70, timeLimitMinutes: 10, questions: [question] })));
  assert.equal((await query("select count(*)::int n from public.courses where slug='invalid-test'"))[0].n, 0);
});
test('course without test completes from materials and never issues a certificate despite forged flag', async () => {
  const id = await save(payload('no-test', null));
  assert.equal((await query('select certificate from public.courses where id=$1', [id]))[0].certificate, false);
  await asUser(student, 'select public.enroll_in_course($1)', [id]);
  await assert.rejects(asUser(student, 'select public.finalize_course_completion($1)', [id]), /Complete all/);
  await ready(id);
  assert.ok((await asUser(student, 'select completed_at from public.enrollments where course_id=$1', [id]))[0].completed_at);
  await assert.rejects(start(id), /not been configured/);
  await assert.rejects(asUser(student, 'select public.issue_certificate($1)', [id]), /CERTIFICATE_DISABLED/);
});
test('new certificates snapshot hours, city, title and name; updates cannot alter snapshots', async () => {
  const cert = (await asUser(student, 'select (public.issue_certificate($1)).*', [course]))[0];
  assert.equal(cert.academic_hours_snapshot, 18); assert.equal(cert.city_snapshot, 'Астана'); assert.equal(cert.template_version, 3);
  await assert.rejects(query('update public.certificates set academic_hours_snapshot=999 where id=$1', [cert.id]), /immutable/);
});
test('disabling test keeps old attempts usable but blocks new certificates and new attempts', async () => {
  const id = await save(payload('disable-test')); const sections = await ready(id); const attempt = await start(id); const input = await answers(attempt);
  const edit = payload('disable-test', null); edit.sections[0].id = sections[0].id;
  await save(edit, id);
  assert.equal((await submit(attempt, input)).passed, true);
  await assert.rejects(start(id), /not been configured/);
  await assert.rejects(asUser(student, 'select public.issue_certificate($1)', [id]), /CERTIFICATE_DISABLED/);
  assert.equal((await query('select count(*)::int n from public.test_questions q join public.course_tests t on t.id=q.test_id where t.course_id=$1', [id]))[0].n, 4);
});
test('editing tests retains grading of old active versions; existing certificates remain available after disabling', async () => {
  const attempt = await start(course); const input = await answers(attempt);
  const sections = await query('select id from public.course_sections where course_id=$1', [course]);
  const edit = payload('mixed-test', { passingScore: 100, timeLimitMinutes: 1, questions: [{ ...questions[0], correctOptionIndex: 1 }] });
  edit.sections[0].id = sections[0].id; edit.academicHours = 40;
  await save(edit, course);
  assert.equal((await submit(attempt, input)).score, 100);
  edit.test = null; await save(edit, course);
  const cert = (await asUser(student, 'select (public.issue_certificate($1)).*', [course]))[0];
  assert.equal(cert.academic_hours_snapshot, 18);
});
test('migration replay preserves types, accepted answers, disabled tests and immutable certificates', async () => {
  const before = await query('select * from public.test_question_answers order by question_id');
  await db.exec(fs.readFileSync('supabase/migrate_existing_database.sql', 'utf8').replace(/create extension if not exists pgcrypto;/ig, ''));
  assert.deepEqual(await query('select * from public.test_question_answers order by question_id'), before);
  assert.equal((await query('select certificate from public.courses where id=$1', [course]))[0].certificate, false);
  assert.equal((await query('select academic_hours_snapshot from public.certificates where course_id=$1', [course]))[0].academic_hours_snapshot, 18);
});

test('ratings require real completion; one vote per participant, public averages and private identities', async () => {
  const id = await save({ ...payload('rated-seminar', null), rating: 1 });
  assert.equal(Number((await query('select rating from public.courses where id=$1', [id]))[0].rating), 5);
  // Historical author-entered ratings must not affect the public aggregate.
  await query('update public.courses set rating=1 where id=$1', [id]);
  const summary = async () => {
    await db.exec('begin; set local role anon;');
    try {
      const rows = await query('select * from public.get_course_rating_summaries($1)', [[id]]);
      await db.exec('commit'); return rows[0];
    } catch (error) { await db.exec('rollback'); throw error; }
  };
  assert.deepEqual(await summary(), { course_id: id, rating: '5', rating_count: 0 });
  await assert.rejects(asUser(student, 'select public.rate_course($1,4)', [id]), /Complete all/);
  await asUser(student, 'select public.enroll_in_course($1)', [id]);
  await assert.rejects(asUser(student, 'select public.rate_course($1,4)', [id]), /Complete all/);
  await ready(id);
  for (const rating of [null, 0, 6, -1, 1.5]) await assert.rejects(asUser(student, 'select public.rate_course($1,$2)', [id, rating]));
  assert.ok((await query('select completed_at from public.enrollments where course_id=$1 and user_id=$2', [id, student]))[0].completed_at);
  assert.equal((await query('select count(*)::int n from public.course_ratings where course_id=$1', [id]))[0].n, 0);
  const before = (await query('select updated_at from public.courses where id=$1', [id]))[0];
  await asUser(student, 'select public.rate_course($1,4)', [id]);
  await asUser(student, 'select public.rate_course($1,2)', [id]);
  assert.deepEqual(await summary(), { course_id: id, rating: '2.0', rating_count: 1 });
  assert.deepEqual((await query('select updated_at from public.courses where id=$1', [id]))[0], before);
  await ready(id, stranger);
  await asUser(stranger, 'select public.rate_course($1,5)', [id]);
  assert.deepEqual(await summary(), { course_id: id, rating: '3.5', rating_count: 2 });
  const own = await asUser(student, 'select * from public.course_ratings where course_id=$1', [id]);
  assert.equal(own.length, 1); assert.equal(own[0].user_id, student);
  assert.deepEqual(await asUser(admin, 'select * from public.course_ratings where course_id=$1', [id]), []);
  for (const sql of [
    'update public.course_ratings set rating=5 where course_id=$1',
    'delete from public.course_ratings where course_id=$1',
    `insert into public.course_ratings(course_id,user_id,rating) values($1,'${admin}',5)`,
  ]) await assert.rejects(asUser(student, sql, [id]), /permission denied/);
  await db.exec('begin; set local role anon;');
  await assert.rejects(query('select * from public.course_ratings'), /permission denied/);
  await db.exec('rollback; begin; set local role anon;');
  await assert.rejects(query('select public.rate_course($1,5)', [id]), /permission denied/);
  await db.exec('rollback');
  const rows = await query('select * from public.course_ratings order by user_id');
  await db.exec(fs.readFileSync('supabase/ratings_update.sql', 'utf8'));
  await db.exec(fs.readFileSync('supabase/ratings_update.sql', 'utf8'));
  await db.exec(fs.readFileSync('supabase/migrate_existing_database.sql', 'utf8').replace(/create extension if not exists pgcrypto;/ig, ''));
  assert.deepEqual(await query('select * from public.course_ratings order by user_id'), rows);
  assert.deepEqual(await summary(), { course_id: id, rating: '3.5', rating_count: 2 });
});

test('a seminar with a test requires a passing attempt before rating, but no certificate request', async () => {
  const id = await save(payload('rating-after-test'));
  await ready(id);
  await assert.rejects(asUser(student, 'select public.rate_course($1,5)', [id]), /passed non-expired/);
  const failed = await start(id);
  await submit(failed, []);
  await assert.rejects(asUser(student, 'select public.rate_course($1,5)', [id]), /passed non-expired/);
  const passed = await start(id);
  await submit(passed, await answers(passed));
  await asUser(student, 'select public.rate_course($1,5)', [id]);
  assert.equal((await query('select count(*)::int n from public.certificates where course_id=$1', [id]))[0].n, 0);
  assert.equal((await asUser(student, 'select rating from public.course_ratings where course_id=$1', [id]))[0].rating, 5);
});
