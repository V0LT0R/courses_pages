import 'dotenv/config';
import pg from 'pg';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
// Real parallel PostgreSQL sessions, not Promise.all on an embedded single connection.
if(!process.env.TEST_DATABASE_URL||process.env.ALLOW_TEST_WRITES!=='YES'){
 console.error('Set TEST_DATABASE_URL to a disposable migrated PostgreSQL database and ALLOW_TEST_WRITES=YES. Never use production.');process.exit(2);
}
const pool=new pg.Pool({connectionString:process.env.TEST_DATABASE_URL,max:24,connectionTimeoutMillis:10000,statement_timeout:20000});
const admin=crypto.randomUUID(),student=crypto.randomUUID();let course;
async function session(id,sql,args=[]){const c=await pool.connect();try{await c.query('begin');await c.query('set local role authenticated');await c.query("select set_config('request.jwt.claim.sub',$1,true)",[id]);const result=await c.query(sql,args);await c.query('commit');return result.rows;}catch(e){await c.query('rollback');throw e;}finally{c.release();}}
const race=async(n,fn)=>Promise.all(Array.from({length:n},fn));
try{
 for(const [id,role] of [[admin,'admin'],[student,'student']])await pool.query('insert into auth.users(id,email,raw_user_meta_data,raw_app_meta_data) values($1,$2,$3,$4)',[id,`${id}@example.invalid`,JSON.stringify({full_name:'Concurrency Test'}),JSON.stringify({role})]);
 const payload={slug:'test-'+crypto.randomUUID(),title:'Concurrency fixture',sections:[{title:'Section',blocks:[]}],test:{passingScore:70,timeLimitMinutes:10,questions:Array.from({length:5},(_,i)=>({text:`Q${i}`,options:['A','B'],correctOptionIndex:0}))}};
 course=(await session(admin,'select public.save_course_with_content(null,null,$1) id',[JSON.stringify(payload)]))[0].id;
 const section=(await pool.query('select id from public.course_sections where course_id=$1',[course])).rows[0].id;
 await race(20,()=>session(student,'select public.enroll_in_course($1)',[course]));
 assert.equal((await pool.query('select count(*)::int n from public.enrollments where user_id=$1 and course_id=$2',[student,course])).rows[0].n,1);console.log('PASS A: 20 enroll requests => 1 row');
 await race(20,()=>session(student,'select public.mark_section_completed($1)',[section]));
 assert.equal((await pool.query('select count(*)::int n from public.section_progress where user_id=$1 and section_id=$2',[student,section])).rows[0].n,1);console.log('PASS B: 20 progress requests => 1 row');
 const starts=await race(10,()=>session(student,'select * from public.start_course_test($1)',[course]));
 assert.equal(new Set(starts.map(r=>r[0].attempt_id)).size,1);console.log('PASS C: 10 sessions => 1 active attempt');
 const id=starts[0][0].attempt_id;
 const answers=(await pool.query('select a.question_id,a.correct_option_id option_id from public.test_question_answers a join public.test_questions q on q.id=a.question_id join public.course_tests t on t.id=q.test_id where t.course_id=$1 and q.version=t.version',[course])).rows;
 const submissions=await Promise.allSettled([session(student,'select * from public.submit_course_test($1,$2)',[id,JSON.stringify(answers)]),session(student,'select * from public.submit_course_test($1,$2)',[id,JSON.stringify(answers)])]);
 assert.equal(submissions.filter(r=>r.status==='fulfilled').length,1);assert.match(submissions.find(r=>r.status==='rejected').reason.message,/already been submitted/);console.log('PASS D: simultaneous duplicate submission rejected');
 const certificates=await race(20,()=>session(student,'select * from public.issue_certificate($1)',[course]));
 assert.equal(new Set(certificates.map(r=>r[0].certificate_number)).size,1);console.log('PASS H: 20 certificate requests => 1 certificate');
 const stamp=(await pool.query('select updated_at::text from public.courses where id=$1',[course])).rows[0].updated_at;
 const edit={...payload,sections:[{...payload.sections[0],id:section}]};
 const edits=await Promise.allSettled([session(admin,'select public.save_course_with_content($1,$2,$3)',[course,stamp,JSON.stringify(edit)]),session(admin,'select public.save_course_with_content($1,$2,$3)',[course,stamp,JSON.stringify(edit)])]);
 assert.equal(edits.filter(r=>r.status==='fulfilled').length,1);assert.match(edits.find(r=>r.status==='rejected').reason.message,/COURSE_EDIT_CONFLICT/);console.log('PASS: simultaneous editors cannot overwrite each other');
}finally{
 // Delete ONLY this run's random fixtures, including those from a failed scenario.
 if(course){await pool.query('delete from public.certificate_pdfs where certificate_number in(select certificate_number from public.certificates where course_id=$1)',[course]);await pool.query('delete from public.certificates where course_id=$1',[course]);await pool.query('delete from public.course_revisions where course_id=$1',[course]);await pool.query('delete from public.courses where id=$1',[course]);}
 await pool.query('delete from auth.users where id=any($1::uuid[])',[[admin,student]]);
 await pool.query('delete from public.audit_log where actor_id=any($1::uuid[])',[[admin,student]]);
 await pool.end();
}
