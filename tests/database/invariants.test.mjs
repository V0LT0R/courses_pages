import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
const db=new PGlite();
const admin='11111111-1111-4111-8111-111111111111',student='22222222-2222-4222-8222-222222222222',other='33333333-3333-4333-8333-333333333333';
let course,section,attempt,answers,payload,certificate;
const q=async(sql,args=[])=>(await db.query(sql,args)).rows;
async function asUser(id,sql,args=[]){await db.exec('begin; set local role authenticated;');try{await db.query("select set_config('request.jwt.claim.sub',$1,true)",[id]);const result=await q(sql,args);await db.exec('commit');return result;}catch(e){await db.exec('rollback');throw e;}}
const coursePayload=()=>({slug:'integration-course',title:'Научно-практический семинар',sections:[{title:'Раздел',blocks:[{type:'text',content:'Материал'}]}],test:{passingScore:70,timeLimitMinutes:10,questions:Array.from({length:5},(_,i)=>({text:`Вопрос ${i}`,options:['Да','Нет'],correctOptionIndex:0}))}});
test.before(async()=>{
 await db.exec(fs.readFileSync('tests/integration/bootstrap.sql','utf8'));
 await db.exec(fs.readFileSync('supabase/full_schema.sql','utf8').replace(/create extension if not exists pgcrypto;/ig,''));
 for(const [id,role] of [[admin,'admin'],[student,'student'],[other,'student']])await db.query("insert into auth.users(id,email,raw_user_meta_data,raw_app_meta_data) values($1,$2,$3,$4)",[id,`${role}-${id}@example.invalid`,JSON.stringify({full_name:'Тестовый Пользователь',role:'admin'}),JSON.stringify({role})]);
});
test.after(()=>db.close());
test('public registration cannot promote user_metadata.role',async()=>{assert.equal((await q('select role from public.profiles where id=$1',[student]))[0].role,'student');});
test('student cannot update role or call admin RPC',async()=>{
 await assert.rejects(asUser(student,"update public.profiles set role='admin' where id=$1",[student]),/permission denied/);
 await assert.rejects(asUser(student,'select public.save_course_with_content(null,null,$1)',[JSON.stringify(coursePayload())]),/Only admin or manager/);
});
test('course + sections + test save atomically',async()=>{
 payload=coursePayload();course=(await asUser(admin,'select public.save_course_with_content(null,null,$1) as id',[JSON.stringify(payload)]))[0].id;
 section=(await q('select id from public.course_sections where course_id=$1',[course]))[0].id;
 assert.equal((await q('select question_count from public.course_tests where course_id=$1',[course]))[0].question_count,5);
});
test('idempotent enrollment and progress are unique',async()=>{
 for(let i=0;i<20;i++)await asUser(student,'select public.enroll_in_course($1)',[course]);
 for(let i=0;i<20;i++)await asUser(student,'select public.mark_section_completed($1)',[section]);
 assert.equal((await q('select count(*)::int as n from public.enrollments where user_id=$1 and course_id=$2',[student,course]))[0].n,1);
 assert.equal((await q('select count(*)::int as n from public.section_progress where user_id=$1 and section_id=$2',[student,section]))[0].n,1);
});
test('foreign progress and unearned certificates are blocked',async()=>{
 await assert.rejects(asUser(other,"update public.section_progress set is_completed=false where user_id=$1",[student]),/permission denied/);
 await assert.rejects(asUser(other,'select public.mark_section_completed($1)',[section]),/enrolled/);
 await assert.rejects(asUser(other,'select public.issue_certificate($1)',[course]),/Complete all/);
 await assert.rejects(asUser(student,'select public.issue_certificate($1)',[course]),/passed non-expired/);
});
test('repeated start reuses one active attempt',async()=>{
 const ids=[];for(let i=0;i<10;i++)ids.push((await asUser(student,'select * from public.start_course_test($1)',[course]))[0].attempt_id);
 assert.equal(new Set(ids).size,1);attempt=ids[0];
 answers=(await q('select question_id,correct_option_id as option_id from public.test_question_answers'));
});
test('correct answers are invisible to students',async()=>{assert.deepEqual(await asUser(student,'select * from public.test_question_answers'),[]);});
test('duplicate questions and foreign options rejected without consuming attempt',async()=>{
 await assert.rejects(asUser(student,'select * from public.submit_course_test($1,$2)',[attempt,JSON.stringify([answers[0],answers[0]])]),/Only one answer/);
 await assert.rejects(asUser(student,'select * from public.submit_course_test($1,$2)',[attempt,JSON.stringify([{...answers[0],option_id:answers[1].option_id}])]),/invalid question/);
 await assert.rejects(asUser(student,'select * from public.submit_course_test($1,$2)',[attempt,JSON.stringify([{question_id:other,option_id:answers[0].option_id}])]),/invalid question/);
 await assert.rejects(asUser(student,'select * from public.submit_course_test($1,$2)',[attempt,'[{}]']),/invalid question/);
});
test('score is computed in DB; replay and foreign attempt rejected',async()=>{
 await assert.rejects(asUser(other,'select * from public.submit_course_test($1,$2)',[attempt,JSON.stringify(answers)]),/not found/);
 const result=(await asUser(student,'select * from public.submit_course_test($1,$2)',[attempt,JSON.stringify(answers)]))[0];
 assert.equal(result.score,100);assert.equal(result.passed,true);
 await assert.rejects(asUser(student,'select * from public.submit_course_test($1,$2)',[attempt,JSON.stringify(answers)]),/already been submitted/);
});
test('certificate snapshots immutable; repeat after name change returns same certificate',async()=>{
 certificate=(await asUser(student,'select (public.issue_certificate($1)).*',[course]))[0];
 await asUser(student,"update public.profiles set full_name='Новое Имя' where id=$1",[student]);
 for(let i=0;i<20;i++)assert.equal((await asUser(student,'select (public.issue_certificate($1)).*',[course]))[0].certificate_number,certificate.certificate_number);
 assert.equal((await q('select full_name_snapshot from public.certificates'))[0].full_name_snapshot,'Тестовый Пользователь');
 await assert.rejects(q("update public.certificates set full_name_snapshot='Подмена'"),/immutable/);
 assert.equal((await q('select count(*)::int as n from public.audit_log where entity_table=\'certificates\' and action=\'insert\''))[0].n,1);
});
test('expired attempt cannot pass even with all correct answers',async()=>{
 const a=(await asUser(student,'select * from public.start_course_test($1)',[course]))[0];
 await q("update public.test_attempts set expires_at=clock_timestamp()-interval '1 second' where id=$1",[a.attempt_id]);
 const result=(await asUser(student,'select * from public.submit_course_test($1,$2)',[a.attempt_id,JSON.stringify(answers)]))[0];
 assert.equal(result.timed_out,true);assert.equal(result.passed,false);
});
test('optimistic concurrency token required; deleting used section rolls back',async()=>{
 await assert.rejects(asUser(admin,'select public.save_course_with_content($1,null,$2)',[course,JSON.stringify(payload)]),/COURSE_EDIT_CONFLICT/);
 const stamp=(await q('select updated_at::text from public.courses where id=$1',[course]))[0].updated_at;
 await assert.rejects(asUser(admin,'select public.save_course_with_content($1,$2,$3)',[course,stamp,JSON.stringify({...payload,sections:[]})]),/SECTION_HAS_PROGRESS/);
 assert.equal((await q('select count(*)::int as n from public.section_progress'))[0].n,1);
 const updated={...payload,title:'Новое название',sections:[{...payload.sections[0],id:section}]};
 await asUser(admin,'select public.save_course_with_content($1,$2,$3)',[course,stamp,JSON.stringify(updated)]);
 await assert.rejects(asUser(admin,'select public.save_course_with_content($1,$2,$3)',[course,stamp,JSON.stringify(updated)]),/COURSE_EDIT_CONFLICT/);
 assert.equal((await q('select course_title_snapshot from public.certificates'))[0].course_title_snapshot,payload.title);
 assert.equal((await q('select count(*)::int as n from public.course_revisions'))[0].n,1);
});
test('all-or-nothing migration replay preserves certificates/results',async()=>{
 await db.exec(fs.readFileSync('supabase/migrate_existing_database.sql','utf8').replace(/create extension if not exists pgcrypto;/ig,''));
 assert.equal((await q('select count(*)::int as n from public.certificates'))[0].n,1);
 assert.equal((await q('select count(*)::int as n from public.test_attempts'))[0].n,2);
});
test('anon cannot read private materials or certificates; direct storage upload denied',async()=>{
 await db.exec('begin;set local role anon;');
 try{await assert.rejects(q('select * from public.content_blocks'),/permission denied/);}finally{await db.exec('rollback');}
 await assert.rejects(asUser(admin,"insert into storage.objects(bucket_id,name) values('course-files','spoof.html')"),/row-level security/);
 await assert.rejects(asUser(student,'insert into public.certificates(user_id,course_id,full_name_snapshot,course_title_snapshot,issuer_snapshot) values($1,$2,\'Fake\',\'Fake\',\'Fake\')',[student,course]),/permission denied/);
});
