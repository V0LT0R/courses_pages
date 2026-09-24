import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const read=file=>fs.readFileSync(file,'utf8').replace(/create extension if not exists pgcrypto;/ig,'');
test('supplied previous schema migrates without losing course/user/progress/history',async()=>{
 const db=new PGlite();
 try{
  await db.exec(read('tests/integration/bootstrap.sql'));await db.exec(read('tests/fixtures/previous_schema.sql'));
  const user='44444444-4444-4444-8444-444444444444';
  await db.query("insert into auth.users(id,email,raw_user_meta_data) values($1,'migration@example.invalid','{\"full_name\":\"Migration User\"}')",[user]);
  const course=(await db.query("insert into public.courses(slug,title,category,date_text,duration,format,location,image_url,short_description,description,created_by) values('legacy','Legacy','','','','','','','','',$1) returning id",[user])).rows[0].id;
  const section=(await db.query("insert into public.course_sections(course_id,title) values($1,'Legacy section') returning id",[course])).rows[0].id;
  await db.query('insert into public.enrollments(user_id,course_id) values($1,$2)',[user,course]);
  await db.query('insert into public.section_progress(user_id,section_id,is_completed,completed_at) values($1,$2,true,now())',[user,section]);
  const before=(await db.query('select * from public.section_progress')).rows;
  await db.exec(read('supabase/migrate_existing_database.sql'));
  assert.deepEqual((await db.query('select * from public.section_progress')).rows,before);
  assert.equal((await db.query('select title from public.courses')).rows[0].title,'Legacy');
  assert.equal((await db.query('select count(*)::int n from public.profiles')).rows[0].n,1);
  const checks=await db.exec(read('supabase/verify_database.sql'));
  assert.deepEqual(checks[0].rows.filter(r=>r.status==='FAIL'),[]);
  await db.exec(read('supabase/migrate_existing_database.sql'));
  assert.deepEqual((await db.query('select * from public.section_progress')).rows,before);
 }finally{await db.close();}
});
