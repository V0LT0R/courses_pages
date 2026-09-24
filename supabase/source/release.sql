-- Release 2: authoritative certificates, restricted writes, history and API metadata.
create table if not exists public.app_settings (
 id boolean primary key default true check(id),
 issuer_name text not null default 'AQUAGEO.KZ' check(length(issuer_name) between 1 and 160)
);
insert into public.app_settings(id) values(true) on conflict do nothing;
alter table public.app_settings enable row level security;
revoke all on public.app_settings from public, anon, authenticated;

create table if not exists public.certificates (
 id uuid primary key default gen_random_uuid(),
 certificate_number text not null unique default ('AQ-' || upper(replace(gen_random_uuid()::text,'-',''))),
 user_id uuid not null references public.profiles(id) on delete restrict,
 course_id uuid not null references public.courses(id) on delete restrict,
 full_name_snapshot text not null,
 course_title_snapshot text not null,
 score_snapshot integer check(score_snapshot between 0 and 100),
 issuer_snapshot text not null,
 issued_at timestamptz not null default clock_timestamp(),
 created_at timestamptz not null default clock_timestamp(),
 status text not null default 'active' check(status in ('active','revoked')),
 template_version integer not null default 2,
 unique(user_id,course_id),
 check(certificate_number ~ '^[A-Za-z0-9_-]{8,128}$')
);
create table if not exists public.certificate_pdfs (
 certificate_number text primary key references public.certificates(certificate_number) on delete restrict,
 pdf_base64 text not null check(length(pdf_base64) <= 4000000),
 sha256 text not null check(sha256 ~ '^[a-f0-9]{64}$'),
 verification_url text not null,
 created_at timestamptz not null default clock_timestamp()
);
-- Old records are preserved byte-for-byte as private JSON; only whitelisted fields are served.
create table if not exists public.legacy_certificates (
 certificate_number text primary key,
 record jsonb not null,
 imported_at timestamptz not null default clock_timestamp()
);
create table if not exists public.audit_log (
 id bigint generated always as identity primary key,
 actor_id uuid,
 action text not null,
 entity_table text not null,
 entity_id text not null,
 created_at timestamptz not null default clock_timestamp()
);
create index if not exists audit_log_created_idx on public.audit_log(created_at desc);
create table if not exists public.course_revisions (
 course_id uuid not null references public.courses(id) on delete restrict,
 revision bigint not null,
 snapshot jsonb not null,
 actor_id uuid,
 created_at timestamptz not null default clock_timestamp(),
 primary key(course_id,revision)
);
alter table public.courses add column if not exists revision bigint not null default 1;
alter table public.courses add column if not exists archived_at timestamptz;

alter table public.certificates enable row level security;
alter table public.certificate_pdfs enable row level security;
alter table public.legacy_certificates enable row level security;
alter table public.audit_log enable row level security;
alter table public.course_revisions enable row level security;
revoke all on public.certificates,public.certificate_pdfs,public.legacy_certificates,public.audit_log,public.course_revisions from public,anon,authenticated;
grant select on public.certificates,public.audit_log,public.course_revisions to authenticated;
grant all on public.certificates,public.certificate_pdfs,public.legacy_certificates,public.audit_log,public.course_revisions,public.app_settings to service_role;
grant usage on sequence public.audit_log_id_seq to service_role;
drop policy if exists certificates_owner on public.certificates;
create policy certificates_owner on public.certificates for select to authenticated using(user_id=auth.uid() or public.can_manage_course(course_id));
drop policy if exists audit_admin on public.audit_log;
create policy audit_admin on public.audit_log for select to authenticated using(public.current_user_role()='admin');
drop policy if exists revisions_manager on public.course_revisions;
create policy revisions_manager on public.course_revisions for select to authenticated using(public.can_manage_course(course_id));

create or replace function public.protect_certificate_snapshot() returns trigger
language plpgsql set search_path='' as $$
begin
 if (to_jsonb(new)-'status') is distinct from (to_jsonb(old)-'status') then
  raise exception 'Certificate snapshot is immutable';
 end if;
 return new;
end $$;
drop trigger if exists certificates_immutable on public.certificates;
create trigger certificates_immutable before update on public.certificates for each row execute function public.protect_certificate_snapshot();

create or replace function public.issue_certificate(check_course_id uuid)
returns public.certificates language plpgsql security definer set search_path='' as $$
declare target public.certificates%rowtype; c public.courses%rowtype; p public.profiles%rowtype; a public.test_attempts%rowtype;
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
 select * into c from public.courses where id=check_course_id for share;
 if c.id is null then raise exception 'Course not found'; end if;
 perform pg_advisory_xact_lock(hashtext(auth.uid()::text),hashtext(check_course_id::text));
 select * into target from public.certificates where user_id=auth.uid() and course_id=check_course_id;
 if target.id is not null then return target; end if;
 if not c.certificate then raise exception 'CERTIFICATE_DISABLED'; end if;
 if not public.is_enrolled(check_course_id) or not public.course_content_completed(check_course_id,auth.uid()) then
  raise exception 'Complete all course sections first';
 end if;
 select * into a from public.test_attempts where user_id=auth.uid() and course_id=check_course_id
  and passed=true and timed_out=false and completed_at is not null
  order by score desc,completed_at desc limit 1;
 if a.id is null then raise exception 'A passed non-expired test attempt is required'; end if;
 select * into p from public.profiles where id=auth.uid() for share;
 insert into public.certificates(user_id,course_id,full_name_snapshot,course_title_snapshot,score_snapshot,issuer_snapshot)
 values(auth.uid(),check_course_id,p.full_name,c.title,a.score,(select issuer_name from public.app_settings where id))
 on conflict(user_id,course_id) do nothing returning * into target;
 if target.id is null then select * into target from public.certificates where user_id=auth.uid() and course_id=check_course_id; end if;
 update public.enrollments set completed_at=coalesce(completed_at,a.completed_at),certificate_requested_at=coalesce(certificate_requested_at,target.issued_at)
 where user_id=auth.uid() and course_id=check_course_id;
 return target;
end $$;
revoke all on function public.issue_certificate(uuid) from public,anon;
grant execute on function public.issue_certificate(uuid) to authenticated;

create or replace function public.audit_entity() returns trigger
language plpgsql security definer set search_path='' as $$
declare item jsonb := case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
begin
 insert into public.audit_log(actor_id,action,entity_table,entity_id)
 values(auth.uid(),lower(tg_op),tg_table_name,coalesce(item->>'id',item->>'certificate_number'));
 return case when tg_op='DELETE' then old else new end;
end $$;
drop trigger if exists certificates_audit on public.certificates;
create trigger certificates_audit after insert or update on public.certificates for each row execute function public.audit_entity();
drop trigger if exists courses_audit on public.courses;
create trigger courses_audit after insert or update or delete on public.courses for each row execute function public.audit_entity();
drop trigger if exists tests_audit on public.course_tests;
create trigger tests_audit after insert or update on public.course_tests for each row execute function public.audit_entity();
drop trigger if exists profiles_audit on public.profiles;
create trigger profiles_audit after update of role on public.profiles for each row execute function public.audit_entity();

create or replace function public.snapshot_course_revision() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 insert into public.course_revisions(course_id,revision,actor_id,snapshot)
 values(old.id,old.revision,auth.uid(),jsonb_build_object('course',to_jsonb(old),
 'sections',(select coalesce(jsonb_agg(to_jsonb(s) || jsonb_build_object('blocks',
 (select coalesce(jsonb_agg(b),'[]') from public.content_blocks b where b.section_id=s.id))), '[]')
 from public.course_sections s where s.course_id=old.id))) on conflict do nothing;
 new.revision := old.revision+1;
 new.updated_at := clock_timestamp();
 return new;
end $$;
drop trigger if exists courses_revision on public.courses;
create trigger courses_revision before update on public.courses for each row execute function public.snapshot_course_revision();

create or replace function public.archive_course(check_course_id uuid,check_expected_updated_at timestamptz)
returns void language plpgsql security definer set search_path='' as $$
declare c public.courses%rowtype;
begin
 if auth.uid() is null or not public.can_manage_course(check_course_id) then raise exception 'Forbidden' using errcode='42501'; end if;
 select * into c from public.courses where id=check_course_id for update;
 if check_expected_updated_at is null or c.updated_at<>check_expected_updated_at then raise exception 'COURSE_EDIT_CONFLICT'; end if;
 update public.courses set archived_at=clock_timestamp() where id=c.id;
end $$;
revoke all on function public.archive_course(uuid,timestamptz) from public,anon;
grant execute on function public.archive_course(uuid,timestamptz) to authenticated;
-- Direct test edits bypass the editor's optimistic concurrency token: disable them.
revoke all on function public.save_course_test(uuid,integer,integer,jsonb) from public,anon,authenticated;

-- Rebuild policies on application-owned tables, so unknown old permissive policies cannot survive.
-- Canonical read policies remain; every mutation except profile fields uses RPC.
do $$ declare r record; begin
 for r in select schemaname,tablename,policyname from pg_policies where schemaname='public'
 and tablename in ('profiles','courses','course_sections','content_blocks','enrollments','section_progress','certificate_requests','course_tests','test_questions','test_options','test_question_answers','test_attempts')
 loop execute format('drop policy %I on %I.%I',r.policyname,r.schemaname,r.tablename); end loop;
end $$;
create policy profile_read on public.profiles for select to authenticated using(id=auth.uid() or public.current_user_role()='admin');
create policy profile_edit on public.profiles for update to authenticated using(id=auth.uid()) with check(id=auth.uid());
create policy course_read on public.courses for select to anon,authenticated using(true);
create policy section_read on public.course_sections for select to authenticated using(public.is_enrolled(course_id) or public.can_manage_course(course_id));
create policy block_read on public.content_blocks for select to authenticated using(exists(select 1 from public.course_sections s where s.id=section_id and (public.is_enrolled(s.course_id) or public.can_manage_course(s.course_id))));
create policy enrollment_read on public.enrollments for select to authenticated using(user_id=auth.uid() or public.can_manage_course(course_id));
create policy progress_read on public.section_progress for select to authenticated using(user_id=auth.uid() or exists(select 1 from public.course_sections s where s.id=section_id and public.can_manage_course(s.course_id)));
create policy request_read on public.certificate_requests for select to authenticated using(user_id=auth.uid() or public.can_manage_course(course_id));
create policy test_read on public.course_tests for select to authenticated using(public.is_enrolled(course_id) or public.can_manage_course(course_id));
create policy question_read on public.test_questions for select to authenticated using(public.can_view_test_version(test_id,version));
create policy option_read on public.test_options for select to authenticated using(exists(select 1 from public.test_questions q where q.id=question_id and public.can_view_test_version(q.test_id,q.version)));
create policy answer_read on public.test_question_answers for select to authenticated using(exists(select 1 from public.test_questions q join public.course_tests t on t.id=q.test_id where q.id=question_id and public.can_manage_course(t.course_id)));
create policy attempt_read on public.test_attempts for select to authenticated using(user_id=auth.uid() or public.can_manage_course(course_id));
-- Remove table and old column-level grants, including Supabase default grants.
do $$ declare r record; begin
 for r in select table_name,column_name from information_schema.columns where table_schema='public'
 and table_name in ('profiles','courses','course_sections','content_blocks','enrollments','section_progress','certificate_requests','course_tests','test_questions','test_options','test_question_answers','test_attempts') loop
 execute format('revoke insert(%I),update(%I),references(%I) on public.%I from public,anon,authenticated',r.column_name,r.column_name,r.column_name,r.table_name);
 end loop;
end $$;
revoke all on public.profiles,public.courses,public.course_sections,public.content_blocks,public.enrollments,public.section_progress,public.certificate_requests,public.course_tests,public.test_questions,public.test_options,public.test_question_answers,public.test_attempts from public,anon,authenticated;
grant select on public.courses to anon;
grant select on public.profiles,public.courses,public.course_sections,public.content_blocks,public.enrollments,public.section_progress,public.certificate_requests,public.course_tests,public.test_questions,public.test_options,public.test_question_answers,public.test_attempts to authenticated;
grant update(full_name,organization,phone) on public.profiles to authenticated;
-- Files are uploaded by Express after signature inspection. Direct Storage uploads are denied.
drop policy if exists "course files manager insert" on storage.objects;
drop policy if exists "course files manager update" on storage.objects;
drop policy if exists "course files manager delete" on storage.objects;
drop policy if exists "course files authenticated read" on storage.objects;
create policy "course files authenticated read" on storage.objects for select to authenticated
 using(bucket_id='course-files' and (public.can_access_course_file(name) or
 (coalesce(public.current_user_role()::text,'') in ('admin','manager') and (owner_id=auth.uid()::text or split_part(name,'/',1)=auth.uid()::text))));
-- Restrictive policies also stop unknown old policies from reopening this bucket.
drop policy if exists course_files_write_fence on storage.objects;
create policy course_files_write_fence on storage.objects as restrictive for all to anon,authenticated
 using(bucket_id<>'course-files' or (auth.uid() is not null and (public.can_access_course_file(name) or
 (coalesce(public.current_user_role()::text,'') in ('admin','manager') and (owner_id=auth.uid()::text or split_part(name,'/',1)=auth.uid()::text)))))
 with check(bucket_id<>'course-files');
-- DELETE needs its own restrictive fence (ALL USING above allows reads).
drop policy if exists course_files_delete_fence on storage.objects;
create policy course_files_delete_fence on storage.objects as restrictive for delete to anon,authenticated using(bucket_id<>'course-files');

-- Referential checks preserve existing data, while enforcing all new writes immediately.
create unique index if not exists test_options_question_id_id_uidx on public.test_options(question_id,id);
do $$ begin
 alter table public.test_question_answers add constraint correct_option_belongs_to_question
 foreign key(question_id,correct_option_id) references public.test_options(question_id,id) not valid;
exception when duplicate_object then null; end $$;
create unique index if not exists course_tests_course_id_id_uidx on public.course_tests(course_id,id);
do $$ begin
 alter table public.test_attempts add constraint attempt_test_belongs_to_course
 foreign key(course_id,test_id) references public.course_tests(course_id,id) not valid;
exception when duplicate_object then null; end $$;
do $$ begin
 alter table public.test_attempts add constraint attempt_result_check check(
 score is null or (score between 0 and 100 and (passed is not true or (completed_at is not null and not timed_out and completed_at < expires_at and score >= passing_score_snapshot)))) not valid;
exception when duplicate_object then null; end $$;
create index if not exists enrollments_course_idx on public.enrollments(course_id);
create index if not exists progress_section_idx on public.section_progress(section_id);
create index if not exists blocks_file_path_idx on public.content_blocks(file_path) where file_path is not null;
create index if not exists certificates_course_idx on public.certificates(course_id);
create index if not exists courses_catalog_idx on public.courses(created_at desc,id);
create or replace function public.app_readiness() returns text language sql security definer set search_path='' as $$ select 'aquageo-2'; $$;
revoke all on function public.app_readiness() from public,anon,authenticated;
grant execute on function public.app_readiness() to service_role;
-- Trigger functions are never callable by API roles.
revoke all on function public.protect_certificate_snapshot(),public.audit_entity(),public.snapshot_course_revision() from public,anon,authenticated;

grant select on public.profiles,public.courses to service_role;
-- Auth confirms the new email before updating auth.users.email. Keep the private profile in sync.
create or replace function public.sync_auth_email() returns trigger language plpgsql security definer set search_path='' as $$
begin
 update public.profiles set email=lower(new.email) where id=new.id;
 return new;
end $$;
drop trigger if exists on_auth_email_changed on auth.users;
create trigger on_auth_email_changed after update of email on auth.users for each row when(old.email is distinct from new.email) execute function public.sync_auth_email();
revoke all on function public.sync_auth_email() from public,anon,authenticated;
