-- READ-ONLY production hardening verification for Supabase/PostgreSQL.
-- Run in Supabase SQL Editor AFTER supabase/security_hardening_2026.sql.
-- It raises an exception if a required protection is missing.

do $$
begin
  if to_regprocedure('public.enroll_in_course(uuid)') is null then
    raise exception 'Missing function public.enroll_in_course(uuid)';
  end if;
  if to_regprocedure('public.mark_section_completed(uuid)') is null then
    raise exception 'Missing function public.mark_section_completed(uuid)';
  end if;
  if to_regprocedure('public.start_course_test(uuid)') is null then
    raise exception 'Missing function public.start_course_test(uuid)';
  end if;
  if to_regprocedure('public.submit_course_test(uuid,jsonb)') is null then
    raise exception 'Missing function public.submit_course_test(uuid,jsonb)';
  end if;
  if to_regprocedure('public.save_course_with_content(uuid,timestamp with time zone,jsonb)') is null then
    raise exception 'Missing function public.save_course_with_content(uuid,timestamptz,jsonb)';
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_indexes
    where schemaname='public' and tablename='profiles' and indexname='profiles_email_lower_uidx'
  ) then raise exception 'Missing profiles_email_lower_uidx'; end if;

  if not exists (
    select 1 from pg_indexes
    where schemaname='public' and tablename='test_attempts' and indexname='test_attempts_one_active_per_course_uidx'
  ) then raise exception 'Missing test_attempts_one_active_per_course_uidx'; end if;

  if not exists (
    select 1 from pg_indexes
    where schemaname='public' and tablename='enrollments'
      and indexdef ilike 'create unique index%'
      and indexdef ilike '%user_id%course_id%'
  ) then raise exception 'Missing unique enrollment protection on (user_id, course_id)'; end if;

  if not exists (
    select 1 from pg_indexes
    where schemaname='public' and tablename='section_progress'
      and indexdef ilike 'create unique index%'
      and indexdef ilike '%user_id%section_id%'
  ) then raise exception 'Missing unique section progress protection'; end if;
end $$;

do $$
declare bucket_public boolean;
begin
  select public into bucket_public from storage.buckets where id='course-files';
  if bucket_public is null then raise exception 'Missing storage bucket course-files'; end if;
  if bucket_public then raise exception 'course-files bucket is still PUBLIC'; end if;
end $$;

do $$
begin
  if has_function_privilege('anon', 'public.enroll_in_course(uuid)', 'EXECUTE') then
    raise exception 'anon can execute enroll_in_course';
  end if;
  if has_function_privilege('anon', 'public.start_course_test(uuid)', 'EXECUTE') then
    raise exception 'anon can execute start_course_test';
  end if;
  if has_function_privilege('anon', 'public.submit_course_test(uuid,jsonb)', 'EXECUTE') then
    raise exception 'anon can execute submit_course_test';
  end if;
  if to_regprocedure('public.is_email_taken(text)') is not null
     and has_function_privilege('anon', 'public.is_email_taken(text)', 'EXECUTE') then
    raise exception 'anon can enumerate account emails through is_email_taken';
  end if;

  if has_table_privilege('authenticated', 'public.enrollments', 'INSERT')
     or has_table_privilege('authenticated', 'public.enrollments', 'UPDATE')
     or has_table_privilege('authenticated', 'public.enrollments', 'DELETE') then
    raise exception 'authenticated still has direct enrollment mutation privileges';
  end if;

  if has_table_privilege('authenticated', 'public.certificate_requests', 'INSERT')
     or has_table_privilege('authenticated', 'public.certificate_requests', 'UPDATE')
     or has_table_privilege('authenticated', 'public.certificate_requests', 'DELETE') then
    raise exception 'authenticated still has direct certificate_requests mutation privileges';
  end if;
end $$;

select
  'PASS' as status,
  'Critical DB functions, uniqueness constraints, RPC privileges and private course-files bucket are configured.' as result;
