-- Supabase schema for AQUAGEO.KZ seminars platform
-- Run this file in Supabase SQL Editor after creating a project.

create extension if not exists pgcrypto;

-- Roles and block types
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('admin', 'manager', 'student');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.content_block_type AS ENUM ('text', 'youtube', 'pdf', 'image');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- For existing projects that already created the enum before image blocks were added.
DO $$ BEGIN
  ALTER TYPE public.content_block_type ADD VALUE IF NOT EXISTS 'image';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Profiles are connected to auth.users. Students are created by public registration.
-- Managers are created by the create-manager Edge Function.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  email text not null unique,
  role public.app_role not null default 'student',
  organization text,
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.courses (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  category text not null,
  date_text text not null,
  duration text not null,
  format text not null,
  location text not null,
  image_url text not null,
  short_description text not null,
  description text not null,
  outcomes text[] not null default '{}',
  lecturer_name text,
  lecturer_role text,
  lecturer_bio text,
  lecturer_photo text,
  certificate boolean not null default true,
  rating numeric(2,1) not null default 5.0,
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.course_sections (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  title text not null,
  description text,
  position integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.content_blocks (
  id uuid primary key default gen_random_uuid(),
  section_id uuid not null references public.course_sections(id) on delete cascade,
  type public.content_block_type not null,
  title text,
  content text,
  file_path text,
  position integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.enrollments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade,
  enrolled_at timestamptz not null default now(),
  completed_at timestamptz,
  certificate_requested_at timestamptz,
  unique(user_id, course_id)
);

create table if not exists public.section_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  section_id uuid not null references public.course_sections(id) on delete cascade,
  is_completed boolean not null default false,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, section_id)
);

create table if not exists public.certificate_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade,
  full_name text not null,
  course_title text not null,
  completed_at timestamptz not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_profiles_email on public.profiles(email);
create index if not exists idx_courses_slug on public.courses(slug);
create index if not exists idx_courses_created_by on public.courses(created_by);
create index if not exists idx_sections_course_position on public.course_sections(course_id, position);
create index if not exists idx_blocks_section_position on public.content_blocks(section_id, position);
create index if not exists idx_enrollments_user on public.enrollments(user_id);
create index if not exists idx_progress_user on public.section_progress(user_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists courses_updated_at on public.courses;
create trigger courses_updated_at before update on public.courses
for each row execute function public.set_updated_at();

drop trigger if exists sections_updated_at on public.course_sections;
create trigger sections_updated_at before update on public.course_sections
for each row execute function public.set_updated_at();

drop trigger if exists blocks_updated_at on public.content_blocks;
create trigger blocks_updated_at before update on public.content_blocks
for each row execute function public.set_updated_at();

drop trigger if exists progress_updated_at on public.section_progress;
create trigger progress_updated_at before update on public.section_progress
for each row execute function public.set_updated_at();

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  profile_role public.app_role := 'student';
  meta_full_name text;
begin
  if (new.raw_app_meta_data ->> 'role') in ('admin', 'manager', 'student') then
    profile_role := (new.raw_app_meta_data ->> 'role')::public.app_role;
  end if;

  meta_full_name := coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'fullName', split_part(new.email, '@', 1));

  insert into public.profiles (id, full_name, email, role)
  values (new.id, meta_full_name, lower(new.email), profile_role)
  on conflict (id) do update set
    email = excluded.email,
    full_name = coalesce(public.profiles.full_name, excluded.full_name),
    role = coalesce(public.profiles.role, excluded.role);

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

create or replace function public.current_user_role()
returns public.app_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.is_email_taken(check_email text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(select 1 from public.profiles where email = lower(trim(check_email)));
$$;

create or replace function public.can_manage_course(check_course_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.courses c
    where c.id = check_course_id
      and (
        public.current_user_role() = 'admin'
        or (public.current_user_role() = 'manager' and c.created_by = auth.uid())
      )
  );
$$;

create or replace function public.is_enrolled(check_course_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.enrollments e
    where e.course_id = check_course_id and e.user_id = auth.uid()
  );
$$;

grant execute on function public.is_email_taken(text) to anon, authenticated;
grant execute on function public.current_user_role() to authenticated;
grant execute on function public.can_manage_course(uuid) to authenticated;
grant execute on function public.is_enrolled(uuid) to authenticated;

alter table public.profiles enable row level security;
alter table public.courses enable row level security;
alter table public.course_sections enable row level security;
alter table public.content_blocks enable row level security;
alter table public.enrollments enable row level security;
alter table public.section_progress enable row level security;
alter table public.certificate_requests enable row level security;

-- Basic table grants; RLS policies still restrict rows.
grant select on public.courses to anon, authenticated;
grant select on public.profiles to authenticated;
grant select, insert, update, delete on public.courses, public.course_sections, public.content_blocks, public.enrollments, public.section_progress, public.certificate_requests to authenticated;
revoke update on public.profiles from authenticated;
grant update (full_name, organization, phone) on public.profiles to authenticated;

-- Profiles
DROP POLICY IF EXISTS "profiles select own or admin" ON public.profiles;
CREATE POLICY "profiles select own or admin" ON public.profiles
FOR SELECT TO authenticated
USING (id = auth.uid() OR public.current_user_role() = 'admin');

DROP POLICY IF EXISTS "profiles update own editable fields" ON public.profiles;
CREATE POLICY "profiles update own editable fields" ON public.profiles
FOR UPDATE TO authenticated
USING (id = auth.uid())
WITH CHECK (id = auth.uid());

-- Courses: catalog is public, editing is role-based.
DROP POLICY IF EXISTS "courses public select" ON public.courses;
CREATE POLICY "courses public select" ON public.courses
FOR SELECT TO anon, authenticated
USING (true);

DROP POLICY IF EXISTS "courses insert managers" ON public.courses;
CREATE POLICY "courses insert managers" ON public.courses
FOR INSERT TO authenticated
WITH CHECK (created_by = auth.uid() AND public.current_user_role() IN ('admin', 'manager'));

DROP POLICY IF EXISTS "courses update managers" ON public.courses;
CREATE POLICY "courses update managers" ON public.courses
FOR UPDATE TO authenticated
USING (public.current_user_role() = 'admin' OR (public.current_user_role() = 'manager' AND created_by = auth.uid()))
WITH CHECK (public.current_user_role() = 'admin' OR (public.current_user_role() = 'manager' AND created_by = auth.uid()));

DROP POLICY IF EXISTS "courses delete managers" ON public.courses;
CREATE POLICY "courses delete managers" ON public.courses
FOR DELETE TO authenticated
USING (public.current_user_role() = 'admin' OR (public.current_user_role() = 'manager' AND created_by = auth.uid()));

-- Sections are visible only to enrolled students or course managers.
DROP POLICY IF EXISTS "sections select enrolled or manager" ON public.course_sections;
CREATE POLICY "sections select enrolled or manager" ON public.course_sections
FOR SELECT TO authenticated
USING (public.is_enrolled(course_id) OR public.can_manage_course(course_id));

DROP POLICY IF EXISTS "sections insert manager" ON public.course_sections;
CREATE POLICY "sections insert manager" ON public.course_sections
FOR INSERT TO authenticated
WITH CHECK (public.can_manage_course(course_id));

DROP POLICY IF EXISTS "sections update manager" ON public.course_sections;
CREATE POLICY "sections update manager" ON public.course_sections
FOR UPDATE TO authenticated
USING (public.can_manage_course(course_id))
WITH CHECK (public.can_manage_course(course_id));

DROP POLICY IF EXISTS "sections delete manager" ON public.course_sections;
CREATE POLICY "sections delete manager" ON public.course_sections
FOR DELETE TO authenticated
USING (public.can_manage_course(course_id));

-- Content blocks inherit permissions from their section/course.
DROP POLICY IF EXISTS "blocks select enrolled or manager" ON public.content_blocks;
CREATE POLICY "blocks select enrolled or manager" ON public.content_blocks
FOR SELECT TO authenticated
USING (exists (
  select 1 from public.course_sections s
  where s.id = section_id and (public.is_enrolled(s.course_id) or public.can_manage_course(s.course_id))
));

DROP POLICY IF EXISTS "blocks insert manager" ON public.content_blocks;
CREATE POLICY "blocks insert manager" ON public.content_blocks
FOR INSERT TO authenticated
WITH CHECK (exists (
  select 1 from public.course_sections s
  where s.id = section_id and public.can_manage_course(s.course_id)
));

DROP POLICY IF EXISTS "blocks update manager" ON public.content_blocks;
CREATE POLICY "blocks update manager" ON public.content_blocks
FOR UPDATE TO authenticated
USING (exists (
  select 1 from public.course_sections s
  where s.id = section_id and public.can_manage_course(s.course_id)
))
WITH CHECK (exists (
  select 1 from public.course_sections s
  where s.id = section_id and public.can_manage_course(s.course_id)
));

DROP POLICY IF EXISTS "blocks delete manager" ON public.content_blocks;
CREATE POLICY "blocks delete manager" ON public.content_blocks
FOR DELETE TO authenticated
USING (exists (
  select 1 from public.course_sections s
  where s.id = section_id and public.can_manage_course(s.course_id)
));

-- Enrollments
DROP POLICY IF EXISTS "enrollments select own or manager" ON public.enrollments;
CREATE POLICY "enrollments select own or manager" ON public.enrollments
FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.can_manage_course(course_id));

DROP POLICY IF EXISTS "enrollments insert own" ON public.enrollments;
CREATE POLICY "enrollments insert own" ON public.enrollments
FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "enrollments update own" ON public.enrollments;
CREATE POLICY "enrollments update own" ON public.enrollments
FOR UPDATE TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- Section progress
DROP POLICY IF EXISTS "progress select own or manager" ON public.section_progress;
CREATE POLICY "progress select own or manager" ON public.section_progress
FOR SELECT TO authenticated
USING (user_id = auth.uid() OR exists (
  select 1 from public.course_sections s
  where s.id = section_id and public.can_manage_course(s.course_id)
));

DROP POLICY IF EXISTS "progress insert own enrolled" ON public.section_progress;
CREATE POLICY "progress insert own enrolled" ON public.section_progress
FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid() AND exists (
  select 1 from public.course_sections s
  where s.id = section_id and public.is_enrolled(s.course_id)
));

DROP POLICY IF EXISTS "progress update own enrolled" ON public.section_progress;
CREATE POLICY "progress update own enrolled" ON public.section_progress
FOR UPDATE TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- Certificate requests
DROP POLICY IF EXISTS "certificate select own or manager" ON public.certificate_requests;
CREATE POLICY "certificate select own or manager" ON public.certificate_requests
FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.can_manage_course(course_id));

DROP POLICY IF EXISTS "certificate insert own" ON public.certificate_requests;
CREATE POLICY "certificate insert own" ON public.certificate_requests
FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

-- Public bucket for course PDF files.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('course-files', 'course-files', true, 52428800, array['application/pdf','image/jpeg','image/png','image/webp','image/gif'])
on conflict (id) do update set public = true, file_size_limit = 52428800, allowed_mime_types = array['application/pdf','image/jpeg','image/png','image/webp','image/gif'];

DROP POLICY IF EXISTS "course files public read" ON storage.objects;
CREATE POLICY "course files public read" ON storage.objects
FOR SELECT TO anon, authenticated
USING (bucket_id = 'course-files');

DROP POLICY IF EXISTS "course files manager insert" ON storage.objects;
CREATE POLICY "course files manager insert" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'course-files' AND public.current_user_role() IN ('admin', 'manager'));

DROP POLICY IF EXISTS "course files manager update" ON storage.objects;
CREATE POLICY "course files manager update" ON storage.objects
FOR UPDATE TO authenticated
USING (bucket_id = 'course-files' AND public.current_user_role() IN ('admin', 'manager'))
WITH CHECK (bucket_id = 'course-files' AND public.current_user_role() IN ('admin', 'manager'));

DROP POLICY IF EXISTS "course files manager delete" ON storage.objects;
CREATE POLICY "course files manager delete" ON storage.objects
FOR DELETE TO authenticated
USING (bucket_id = 'course-files' AND public.current_user_role() IN ('admin', 'manager'));

-- Bootstrap first admin:
-- 1) Register normally on /signup.
-- 2) Run this query with your email:
-- update public.profiles set role = 'admin' where email = 'your-email@example.com';


-- Course testing module migration for existing AQUAGEO.KZ Supabase projects.
-- Run this file once in Supabase SQL Editor.

create table if not exists public.course_tests (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null unique references public.courses(id) on delete cascade,
  enabled boolean not null default true,
  passing_score integer not null default 70 check (passing_score in (60, 70, 80, 90, 100)),
  time_limit_minutes integer not null default 10 check (time_limit_minutes > 0),
  question_count integer not null default 0 check (question_count >= 0),
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.test_questions (
  id uuid primary key default gen_random_uuid(),
  test_id uuid not null references public.course_tests(id) on delete cascade,
  version integer not null check (version > 0),
  question_text text not null,
  position integer not null default 1,
  created_at timestamptz not null default now()
);

create table if not exists public.test_options (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.test_questions(id) on delete cascade,
  option_text text not null,
  position integer not null default 1,
  created_at timestamptz not null default now()
);

-- Correct answers are intentionally stored separately so students can never
-- download them together with normal test options.
create table if not exists public.test_question_answers (
  question_id uuid primary key references public.test_questions(id) on delete cascade,
  correct_option_id uuid not null references public.test_options(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.test_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade,
  test_id uuid not null references public.course_tests(id) on delete cascade,
  test_version integer not null,
  passing_score_snapshot integer not null,
  time_limit_minutes_snapshot integer not null,
  started_at timestamptz not null default now(),
  expires_at timestamptz not null,
  completed_at timestamptz,
  answers jsonb not null default '[]'::jsonb,
  correct_answers integer,
  total_questions integer,
  score integer,
  passed boolean,
  timed_out boolean not null default false,
  duration_seconds integer,
  created_at timestamptz not null default now()
);

create index if not exists idx_course_tests_course on public.course_tests(course_id);
create index if not exists idx_test_questions_version on public.test_questions(test_id, version, position);
create index if not exists idx_test_options_question on public.test_options(question_id, position);
create index if not exists idx_test_attempts_user_course on public.test_attempts(user_id, course_id, completed_at);
create index if not exists idx_test_attempts_test_version on public.test_attempts(test_id, test_version);

create or replace function public.set_course_test_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists course_tests_updated_at on public.course_tests;
create trigger course_tests_updated_at before update on public.course_tests
for each row execute function public.set_course_test_updated_at();

-- Returns true only when every course section has been acknowledged.
create or replace function public.course_content_completed(check_course_id uuid, check_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    count(s.id) > 0
    and count(s.id) = count(p.section_id) filter (where p.is_completed = true)
  from public.course_sections s
  left join public.section_progress p
    on p.section_id = s.id
   and p.user_id = check_user_id
  where s.course_id = check_course_id;
$$;

-- Students can read actual questions only while they have an active attempt.
-- Course owners/admins can always read the test for editing.
create or replace function public.can_view_test_version(check_test_id uuid, check_version integer)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.course_tests t
    where t.id = check_test_id
      and public.can_manage_course(t.course_id)
  ) or exists (
    select 1
    from public.test_attempts a
    where a.test_id = check_test_id
      and a.test_version = check_version
      and a.user_id = auth.uid()
      and a.completed_at is null
      and a.expires_at >= now() - interval '30 seconds'
  );
$$;

-- Atomically saves a new version of a course test.
-- Old question versions are retained so historical attempts stay valid.
create or replace function public.save_course_test(
  check_course_id uuid,
  check_passing_score integer,
  check_time_limit_minutes integer,
  check_questions jsonb
)
returns table(test_id uuid, test_version integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  target_test_id uuid;
  target_version integer;
  question_item jsonb;
  option_item jsonb;
  question_pos bigint;
  option_pos bigint;
  question_id uuid;
  option_id uuid;
  correct_option_id uuid;
  correct_index integer;
  question_text_value text;
  option_text_value text;
  question_total integer;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not public.can_manage_course(check_course_id) then
    raise exception 'You do not have permission to edit this course test';
  end if;

  if check_passing_score not in (60, 70, 80, 90, 100) then
    raise exception 'Passing score must be 60, 70, 80, 90 or 100';
  end if;

  if check_time_limit_minutes is null or check_time_limit_minutes <= 0 then
    raise exception 'Time limit must be greater than zero';
  end if;

  if check_questions is null or jsonb_typeof(check_questions) <> 'array' then
    raise exception 'Questions must be an array';
  end if;

  question_total := jsonb_array_length(check_questions);
  if question_total < 5 then
    raise exception 'A test must contain at least 5 questions';
  end if;

  insert into public.course_tests (
    course_id, enabled, passing_score, time_limit_minutes, question_count, version
  ) values (
    check_course_id, true, check_passing_score, check_time_limit_minutes, question_total, 1
  )
  on conflict (course_id) do update set
    enabled = true,
    passing_score = excluded.passing_score,
    time_limit_minutes = excluded.time_limit_minutes,
    question_count = excluded.question_count,
    version = public.course_tests.version + 1,
    updated_at = now()
  returning id, version into target_test_id, target_version;

  for question_item, question_pos in
    select value, ordinality
    from jsonb_array_elements(check_questions) with ordinality
  loop
    question_text_value := trim(coalesce(question_item->>'text', ''));
    if question_text_value = '' then
      raise exception 'Question % has no text', question_pos;
    end if;

    if jsonb_typeof(question_item->'options') <> 'array'
       or jsonb_array_length(question_item->'options') < 2
       or jsonb_array_length(question_item->'options') > 6 then
      raise exception 'Question % must contain from 2 to 6 answer options', question_pos;
    end if;

    correct_index := coalesce((question_item->>'correctOptionIndex')::integer, -1);
    if correct_index < 0 or correct_index >= jsonb_array_length(question_item->'options') then
      raise exception 'Question % has an invalid correct answer', question_pos;
    end if;

    insert into public.test_questions (test_id, version, question_text, position)
    values (target_test_id, target_version, question_text_value, question_pos)
    returning id into question_id;

    correct_option_id := null;
    for option_item, option_pos in
      select value, ordinality
      from jsonb_array_elements(question_item->'options') with ordinality
    loop
      option_text_value := trim(coalesce(option_item #>> '{}', ''));
      if option_text_value = '' then
        raise exception 'Question % contains an empty answer option', question_pos;
      end if;

      insert into public.test_options (question_id, option_text, position)
      values (question_id, option_text_value, option_pos)
      returning id into option_id;

      if option_pos - 1 = correct_index then
        correct_option_id := option_id;
      end if;
    end loop;

    if correct_option_id is null then
      raise exception 'Question % has no correct answer', question_pos;
    end if;

    insert into public.test_question_answers (question_id, correct_option_id)
    values (question_id, correct_option_id);
  end loop;

  return query select target_test_id, target_version;
end;
$$;

-- Creates a timed attempt only after the student has acknowledged all sections.
create or replace function public.start_course_test(check_course_id uuid)
returns table(
  attempt_id uuid,
  test_id uuid,
  test_version integer,
  started_at timestamptz,
  expires_at timestamptz,
  time_limit_minutes integer,
  passing_score integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  target_test public.course_tests%rowtype;
  new_attempt public.test_attempts%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not public.is_enrolled(check_course_id) then
    raise exception 'You must be enrolled in the course before taking the test';
  end if;

  if not public.course_content_completed(check_course_id, auth.uid()) then
    raise exception 'Complete all course sections before starting the test';
  end if;

  select * into target_test
  from public.course_tests
  where course_id = check_course_id and enabled = true;

  if target_test.id is null then
    raise exception 'The course test has not been configured yet';
  end if;

  if target_test.question_count < 5 then
    raise exception 'The course test is not ready';
  end if;

  insert into public.test_attempts (
    user_id, course_id, test_id, test_version,
    passing_score_snapshot, time_limit_minutes_snapshot,
    started_at, expires_at
  ) values (
    auth.uid(), check_course_id, target_test.id, target_test.version,
    target_test.passing_score, target_test.time_limit_minutes,
    clock_timestamp(), clock_timestamp() + make_interval(mins => target_test.time_limit_minutes)
  ) returning * into new_attempt;

  return query select
    new_attempt.id,
    new_attempt.test_id,
    new_attempt.test_version,
    new_attempt.started_at,
    new_attempt.expires_at,
    new_attempt.time_limit_minutes_snapshot,
    new_attempt.passing_score_snapshot;
end;
$$;

-- Scores an attempt entirely inside PostgreSQL. Correct answers are never sent to the browser.
create or replace function public.submit_course_test(check_attempt_id uuid, check_answers jsonb)
returns table(
  attempt_id uuid,
  score integer,
  correct_answers integer,
  total_questions integer,
  passed boolean,
  timed_out boolean,
  completed_at timestamptz,
  duration_seconds integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  target_attempt public.test_attempts%rowtype;
  answer_payload jsonb := coalesce(check_answers, '[]'::jsonb);
  total_value integer;
  correct_value integer;
  score_value integer;
  timed_out_value boolean;
  completed_value timestamptz := clock_timestamp();
  duration_value integer;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if jsonb_typeof(answer_payload) <> 'array' then
    raise exception 'Answers must be an array';
  end if;

  select * into target_attempt
  from public.test_attempts
  where id = check_attempt_id and user_id = auth.uid()
  for update;

  if target_attempt.id is null then
    raise exception 'Test attempt not found';
  end if;

  if target_attempt.completed_at is not null then
    raise exception 'This test attempt has already been submitted';
  end if;

  select count(*) into total_value
  from public.test_questions q
  where q.test_id = target_attempt.test_id
    and q.version = target_attempt.test_version;

  with submitted as (
    select distinct
      (item->>'question_id')::uuid as question_id,
      (item->>'option_id')::uuid as option_id
    from jsonb_array_elements(answer_payload) item
    where item ? 'question_id' and item ? 'option_id'
  )
  select count(*) into correct_value
  from submitted s
  join public.test_questions q
    on q.id = s.question_id
   and q.test_id = target_attempt.test_id
   and q.version = target_attempt.test_version
  join public.test_question_answers a
    on a.question_id = q.id
   and a.correct_option_id = s.option_id;

  if total_value <= 0 then
    score_value := 0;
  else
    score_value := round((correct_value * 100.0) / total_value)::integer;
  end if;

  timed_out_value := completed_value > target_attempt.expires_at;
  duration_value := greatest(0, round(extract(epoch from (completed_value - target_attempt.started_at)))::integer);

  update public.test_attempts set
    answers = answer_payload,
    correct_answers = correct_value,
    total_questions = total_value,
    score = score_value,
    passed = score_value >= target_attempt.passing_score_snapshot,
    timed_out = timed_out_value,
    completed_at = completed_value,
    duration_seconds = duration_value
  where id = target_attempt.id;

  return query select
    target_attempt.id,
    score_value,
    correct_value,
    total_value,
    score_value >= target_attempt.passing_score_snapshot,
    timed_out_value,
    completed_value,
    duration_value;
end;
$$;

alter table public.course_tests enable row level security;
alter table public.test_questions enable row level security;
alter table public.test_options enable row level security;
alter table public.test_question_answers enable row level security;
alter table public.test_attempts enable row level security;

grant select on public.course_tests, public.test_questions, public.test_options, public.test_question_answers, public.test_attempts to authenticated;
revoke insert, update, delete on public.course_tests, public.test_questions, public.test_options, public.test_question_answers, public.test_attempts from authenticated;

drop policy if exists "course tests select enrolled or manager" on public.course_tests;
create policy "course tests select enrolled or manager" on public.course_tests
for select to authenticated
using (public.is_enrolled(course_id) or public.can_manage_course(course_id));

drop policy if exists "test questions active attempt or manager" on public.test_questions;
create policy "test questions active attempt or manager" on public.test_questions
for select to authenticated
using (public.can_view_test_version(test_id, version));

drop policy if exists "test options active attempt or manager" on public.test_options;
create policy "test options active attempt or manager" on public.test_options
for select to authenticated
using (exists (
  select 1
  from public.test_questions q
  where q.id = question_id
    and public.can_view_test_version(q.test_id, q.version)
));

drop policy if exists "test answers manager only" on public.test_question_answers;
create policy "test answers manager only" on public.test_question_answers
for select to authenticated
using (exists (
  select 1
  from public.test_questions q
  join public.course_tests t on t.id = q.test_id
  where q.id = question_id
    and public.can_manage_course(t.course_id)
));

drop policy if exists "test attempts own or manager" on public.test_attempts;
create policy "test attempts own or manager" on public.test_attempts
for select to authenticated
using (user_id = auth.uid() or public.can_manage_course(course_id));

grant execute on function public.course_content_completed(uuid, uuid) to authenticated;
grant execute on function public.can_view_test_version(uuid, integer) to authenticated;
grant execute on function public.save_course_test(uuid, integer, integer, jsonb) to authenticated;
grant execute on function public.start_course_test(uuid) to authenticated;
grant execute on function public.submit_course_test(uuid, jsonb) to authenticated;
