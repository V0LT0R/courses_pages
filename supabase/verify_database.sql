-- READ ONLY. Run after the complete migration. Every line should be PASS.
with tables(name) as (values('profiles'),('courses'),('course_sections'),('content_blocks'),('enrollments'),('section_progress'),('certificate_requests'),('course_tests'),('test_questions'),('test_options'),('test_question_answers'),('test_attempts'),('certificates'),('certificate_pdfs'),('legacy_certificates'),('audit_log'),('course_revisions'),('app_settings')),
fns(sig) as (values('enroll_in_course(uuid)'),('mark_section_completed(uuid)'),('start_course_test(uuid)'),('submit_course_test(uuid,jsonb)'),('finalize_course_completion(uuid)'),('issue_certificate(uuid)'),('save_course_with_content(uuid,timestamp with time zone,jsonb)'),('app_readiness()')),
checks as (
 select 'table + RLS: '||t.name as object,exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname=t.name and c.relrowsecurity) as ok from tables t
 union all select 'RPC: '||sig,to_regprocedure('public.'||sig) is not null from fns
 union all select 'RPC no anon execute: '||sig,case when to_regprocedure('public.'||sig) is null then false else not has_function_privilege('anon',to_regprocedure('public.'||sig),'EXECUTE') end from fns
 union all select 'RPC protected search_path: '||sig,exists(select 1 from pg_proc p where p.oid=to_regprocedure('public.'||sig) and p.prosecdef and 'search_path=""'=any(p.proconfig)) from fns
 union all select 'private bucket',exists(select 1 from storage.buckets where id='course-files' and not public and file_size_limit<=26214400 and not('text/html'=any(allowed_mime_types)))
 union all select 'storage restrictive write fence',exists(select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='course_files_write_fence' and permissive='RESTRICTIVE')
 union all select 'one active attempt index',exists(select 1 from pg_indexes where schemaname='public' and indexname='test_attempts_one_active_per_course_uidx' and indexdef ilike '%UNIQUE%' and indexdef ilike '%completed_at IS NULL%')
 union all select 'certificates unique user/course',exists(select 1 from pg_constraint where conrelid=to_regclass('public.certificates') and contype='u' and pg_get_constraintdef(oid)='UNIQUE (user_id, course_id)')
 union all select 'enrollments unique user/course',exists(select 1 from pg_constraint where conrelid=to_regclass('public.enrollments') and contype='u' and pg_get_constraintdef(oid)='UNIQUE (user_id, course_id)')
 union all select 'progress unique user/section',exists(select 1 from pg_constraint where conrelid=to_regclass('public.section_progress') and contype='u' and pg_get_constraintdef(oid)='UNIQUE (user_id, section_id)')
 union all select 'correct option composite FK',exists(select 1 from pg_constraint where conrelid=to_regclass('public.test_question_answers') and conname='correct_option_belongs_to_question' and contype='f')
 union all select 'attempt/course composite FK',exists(select 1 from pg_constraint where conrelid=to_regclass('public.test_attempts') and conname='attempt_test_belongs_to_course' and contype='f')
 union all select 'certificate immutable trigger',exists(select 1 from pg_trigger where tgrelid=to_regclass('public.certificates') and tgname='certificates_immutable' and tgenabled<>'D')
 union all select 'deny direct authenticated writes: '||name,case when to_regclass('public.'||name) is null then false else not(has_table_privilege('authenticated',to_regclass('public.'||name),'INSERT') or has_table_privilege('authenticated',to_regclass('public.'||name),'UPDATE') or has_table_privilege('authenticated',to_regclass('public.'||name),'DELETE') or has_table_privilege('authenticated',to_regclass('public.'||name),'TRUNCATE')) end from tables
 union all select 'profile role has no column update grant',case when to_regclass('public.profiles') is null then false else not has_column_privilege('authenticated','public.profiles','role','UPDATE') end
 union all select 'private certificates deny anonymous select',case when to_regclass('public.certificates') is null then false else not has_table_privilege('anon','public.certificates','SELECT') end
 union all select 'answer policy exists',exists(select 1 from pg_policies where schemaname='public' and tablename='test_question_answers' and policyname='answer_read')
)
select case when ok then 'PASS' else 'FAIL' end as status,object from checks order by status,object;
-- Historical rows may predate NOT VALID constraints. Inspect these separately before VALIDATE CONSTRAINT.
select conrelid::regclass as table_name,conname,convalidated,pg_get_constraintdef(oid) as definition
from pg_constraint where connamespace='public'::regnamespace and not convalidated order by 1,2;
