-- AQUAGEO.KZ security and concurrency hardening
-- Safe to run after the existing schema. Run once in Supabase SQL Editor.

-- Case-insensitive profile email uniqueness at the database layer.
create unique index if not exists profiles_email_lower_uidx
on public.profiles (lower(email));

-- Keep untrusted student-editable text bounded. NOT VALID preserves existing rows,
-- while PostgreSQL still enforces the checks for every new/updated row.
DO $$ BEGIN
  ALTER TABLE public.profiles ADD CONSTRAINT profiles_full_name_length_chk
    CHECK (char_length(btrim(full_name)) between 2 and 120) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.profiles ADD CONSTRAINT profiles_organization_length_chk
    CHECK (organization is null or char_length(organization) <= 200) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.profiles ADD CONSTRAINT profiles_phone_length_chk
    CHECK (phone is null or char_length(phone) <= 50) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.course_tests ADD CONSTRAINT course_tests_time_limit_cap_chk
    CHECK (time_limit_minutes between 1 and 480) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.course_tests ADD CONSTRAINT course_tests_question_count_cap_chk
    CHECK (question_count between 0 and 200) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.test_questions ADD CONSTRAINT test_questions_text_length_chk
    CHECK (char_length(btrim(question_text)) between 1 and 2000) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.test_options ADD CONSTRAINT test_options_text_length_chk
    CHECK (char_length(btrim(option_text)) between 1 and 1000) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Harden all existing SECURITY DEFINER helpers against search_path substitution,
-- and expose only the functions the authenticated client actually needs.
alter function public.handle_new_auth_user() set search_path = '';
alter function public.current_user_role() set search_path = '';
alter function public.is_email_taken(text) set search_path = '';
alter function public.can_manage_course(uuid) set search_path = '';
alter function public.is_enrolled(uuid) set search_path = '';
alter function public.can_view_test_version(uuid, integer) set search_path = '';
alter function public.save_course_test(uuid, integer, integer, jsonb) set search_path = '';
alter function public.set_updated_at() set search_path = '';
alter function public.set_course_test_updated_at() set search_path = '';

revoke execute on function public.handle_new_auth_user() from public, anon, authenticated;
revoke execute on function public.set_updated_at() from public, anon, authenticated;
revoke execute on function public.set_course_test_updated_at() from public, anon, authenticated;
revoke execute on function public.current_user_role() from public, anon;
revoke execute on function public.can_manage_course(uuid) from public, anon;
revoke execute on function public.is_enrolled(uuid) from public, anon;
revoke execute on function public.can_view_test_version(uuid, integer) from public, anon;
revoke execute on function public.save_course_test(uuid, integer, integer, jsonb) from public, anon;
grant execute on function public.current_user_role() to authenticated;
grant execute on function public.can_manage_course(uuid) to authenticated;
grant execute on function public.is_enrolled(uuid) to authenticated;
grant execute on function public.can_view_test_version(uuid, integer) to authenticated;
grant execute on function public.save_course_test(uuid, integer, integer, jsonb) to authenticated;

-- Do not expose account-existence checks to anonymous/authenticated clients.
revoke execute on function public.is_email_taken(text) from public, anon, authenticated;

-- Keep enrollment writes behind one atomic database function.
create or replace function public.enroll_in_course(check_course_id uuid)
returns public.enrollments
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.enrollments%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  perform 1 from public.courses c where c.id=check_course_id for share;
  if not exists (select 1 from public.courses c where c.id = check_course_id) then
    raise exception 'Course not found';
  end if;

  if exists(select 1 from public.courses c where c.id=check_course_id and c.archived_at is not null) then raise exception 'Course is archived'; end if;
  insert into public.enrollments (user_id, course_id)
  values (auth.uid(), check_course_id)
  on conflict (user_id, course_id) do nothing;

  select * into target
  from public.enrollments e
  where e.user_id = auth.uid() and e.course_id = check_course_id;

  return target;
end;
$$;

revoke execute on function public.enroll_in_course(uuid) from public, anon;
grant execute on function public.enroll_in_course(uuid) to authenticated;
revoke insert, update, delete on public.enrollments from authenticated;
grant select on public.enrollments to authenticated;

-- Section acknowledgements are also atomic and server-timestamped.
create or replace function public.mark_section_completed(check_section_id uuid)
returns public.section_progress
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_course_id uuid;
  target public.section_progress%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select s.course_id into target_course_id
  from public.course_sections s
  where s.id = check_section_id;

  if target_course_id is null then
    raise exception 'Course section not found';
  end if;
  perform 1 from public.courses where id = target_course_id for share;
  if not public.is_enrolled(target_course_id) then
    raise exception 'You must be enrolled in the course';
  end if;

  insert into public.section_progress (user_id, section_id, is_completed, completed_at)
  values (auth.uid(), check_section_id, true, clock_timestamp())
  on conflict (user_id, section_id) do update
    set is_completed = true,
        completed_at = coalesce(public.section_progress.completed_at, excluded.completed_at)
  returning * into target;

  return target;
end;
$$;

revoke execute on function public.mark_section_completed(uuid) from public, anon;
grant execute on function public.mark_section_completed(uuid) to authenticated;
revoke insert, update, delete on public.section_progress from authenticated;
grant select on public.section_progress to authenticated;

-- A caller may check own completion; course managers may check their course.
create or replace function public.course_content_completed(check_course_id uuid, check_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when auth.uid() is null then false
    when check_user_id <> auth.uid() and not public.can_manage_course(check_course_id) then false
    else (
      select count(s.id) > 0
        and count(s.id) = count(p.section_id) filter (where p.is_completed = true)
      from public.course_sections s
      left join public.section_progress p
        on p.section_id = s.id
       and p.user_id = check_user_id
      where s.course_id = check_course_id
    )
  end;
$$;

revoke execute on function public.course_content_completed(uuid, uuid) from public, anon;
grant execute on function public.course_content_completed(uuid, uuid) to authenticated;

-- Marks a course complete only from trusted server-side facts (progress + a valid passed attempt).
create or replace function public.finalize_course_completion(check_course_id uuid)
returns public.enrollments
language plpgsql
security definer
set search_path = ''
as $$
declare
  completion_time timestamptz;
  target public.enrollments%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  perform 1 from public.courses where id=check_course_id for share;
  if not public.course_content_completed(check_course_id, auth.uid()) then
    raise exception 'Complete all course sections first';
  end if;

  select a.completed_at into completion_time
  from public.test_attempts a
  where a.user_id = auth.uid()
    and a.course_id = check_course_id
    and a.completed_at is not null
    and a.passed = true
    and a.timed_out = false
  order by a.score desc nulls last, a.completed_at desc
  limit 1;

  if completion_time is null then
    raise exception 'A passed non-expired test attempt is required';
  end if;

  update public.enrollments e
  set completed_at = coalesce(e.completed_at, completion_time)
  where e.user_id = auth.uid() and e.course_id = check_course_id
  returning * into target;

  if target.id is null then
    raise exception 'Enrollment not found';
  end if;

  return target;
end;
$$;

revoke execute on function public.finalize_course_completion(uuid) from public, anon;
grant execute on function public.finalize_course_completion(uuid) to authenticated;

-- Client-created certificate audit rows can contain forged payloads, so clients get read-only access.
revoke insert, update, delete on public.certificate_requests from authenticated;
grant select on public.certificate_requests to authenticated;

-- Clean up duplicate unfinished attempts left by older versions: keep the newest one.
with ranked_open_attempts as (
  select id,
         row_number() over (partition by user_id, course_id order by started_at desc, id desc) as rn
  from public.test_attempts
  where completed_at is null
)
update public.test_attempts a
set completed_at = clock_timestamp(),
    timed_out = true,
    passed = false,
    score = coalesce(a.score, 0),
    duration_seconds = greatest(0, round(extract(epoch from (clock_timestamp() - a.started_at)))::integer)
from ranked_open_attempts r
where a.id = r.id and r.rn > 1;

create unique index if not exists test_attempts_one_active_per_course_uidx
on public.test_attempts (user_id, course_id)
where completed_at is null;

-- One active test attempt per student/course. Simultaneous requests are serialized with an advisory lock.
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
set search_path = ''
as $$
declare
  target_test public.course_tests%rowtype;
  active_attempt public.test_attempts%rowtype;
  new_attempt public.test_attempts%rowtype;
  now_value timestamptz := clock_timestamp();
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  perform 1 from public.courses where id = check_course_id for share;
  perform pg_advisory_xact_lock(hashtext(auth.uid()::text), hashtext(check_course_id::text));
  now_value := clock_timestamp();

  if not public.is_enrolled(check_course_id) then
    raise exception 'You must be enrolled in the course before taking the test';
  end if;

  perform 1 from public.courses where id=check_course_id for share;
  if not public.course_content_completed(check_course_id, auth.uid()) then
    raise exception 'Complete all course sections before starting the test';
  end if;

  -- Close abandoned expired attempts so they cannot conflict with a new device/tab.
  update public.test_attempts a
  set completed_at = now_value,
      timed_out = true,
      passed = false,
      score = coalesce(a.score, 0),
      duration_seconds = greatest(0, round(extract(epoch from (now_value - a.started_at)))::integer)
  where a.user_id = auth.uid()
    and a.course_id = check_course_id
    and a.completed_at is null
    and a.expires_at <= now_value;

  select * into active_attempt
  from public.test_attempts a
  where a.user_id = auth.uid()
    and a.course_id = check_course_id
    and a.completed_at is null
    and a.expires_at > now_value
  order by a.started_at desc
  limit 1
  for update;

  if active_attempt.id is not null then
    return query select
      active_attempt.id,
      active_attempt.test_id,
      active_attempt.test_version,
      active_attempt.started_at,
      active_attempt.expires_at,
      active_attempt.time_limit_minutes_snapshot,
      active_attempt.passing_score_snapshot;
    return;
  end if;

  select * into target_test
  from public.course_tests t
  where t.course_id = check_course_id and t.enabled = true
  for share;

  if target_test.id is null then
    raise exception 'The course test has not been configured yet';
  end if;

  if target_test.question_count < 5 then
    raise exception 'The course test is not ready';
  end if;

  if (select count(*) from public.test_attempts quota where quota.user_id = auth.uid() and quota.course_id = check_course_id and quota.started_at > now_value - interval '24 hours') >= 10 then
    raise exception 'ATTEMPT_LIMIT';
  end if;

  insert into public.test_attempts (
    user_id, course_id, test_id, test_version,
    passing_score_snapshot, time_limit_minutes_snapshot,
    started_at, expires_at
  ) values (
    auth.uid(), check_course_id, target_test.id, target_test.version,
    target_test.passing_score, target_test.time_limit_minutes,
    now_value, now_value + make_interval(mins => target_test.time_limit_minutes)
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

revoke execute on function public.start_course_test(uuid) from public, anon;
grant execute on function public.start_course_test(uuid) to authenticated;

-- Score a test fully in PostgreSQL. Exactly one valid option is accepted per answered question.
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
set search_path = ''
as $$
declare
  target_attempt public.test_attempts%rowtype;
  answer_payload jsonb := coalesce(check_answers, '[]'::jsonb);
  total_value integer;
  submitted_value integer;
  valid_value integer;
  correct_value integer;
  score_value integer;
  passed_value boolean;
  timed_out_value boolean;
  completed_value timestamptz;
  duration_value integer;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if jsonb_typeof(answer_payload) <> 'array' then
    raise exception 'Answers must be an array';
  end if;

  select * into target_attempt
  from public.test_attempts a
  where a.id = check_attempt_id and a.user_id = auth.uid()
  for update;

  if target_attempt.id is null then
    raise exception 'Test attempt not found';
  end if;

  completed_value := clock_timestamp();
  if target_attempt.completed_at is not null then
    raise exception 'This test attempt has already been submitted';
  end if;

  select count(*) into total_value
  from public.test_questions q
  where q.test_id = target_attempt.test_id
    and q.version = target_attempt.test_version;

  if jsonb_array_length(answer_payload) > total_value then
    raise exception 'Too many answers were submitted';
  end if;

  -- Duplicate answers to the same question are rejected instead of letting a caller submit every option.
  if exists (
    select 1
    from (
      select (item->>'question_id')::uuid as question_id, count(*) as cnt
      from jsonb_array_elements(answer_payload) item
      where item ? 'question_id' and item ? 'option_id'
      group by (item->>'question_id')::uuid
      having count(*) > 1
    ) duplicates
  ) then
    raise exception 'Only one answer per question is allowed';
  end if;

  with submitted as (
    select
      (item->>'question_id')::uuid as question_id,
      (item->>'option_id')::uuid as option_id
    from jsonb_array_elements(answer_payload) item
    where item ? 'question_id' and item ? 'option_id'
  ), valid as (
    select s.question_id, s.option_id
    from submitted s
    join public.test_questions q
      on q.id = s.question_id
     and q.test_id = target_attempt.test_id
     and q.version = target_attempt.test_version
    join public.test_options o
      on o.id = s.option_id
     and o.question_id = q.id
  )
  select (select count(*) from submitted), (select count(*) from valid)
  into submitted_value, valid_value;

  if submitted_value <> jsonb_array_length(answer_payload) or valid_value <> submitted_value then
    raise exception 'Submitted answers contain invalid question or option identifiers';
  end if;

  with submitted as (
    select
      (item->>'question_id')::uuid as question_id,
      (item->>'option_id')::uuid as option_id
    from jsonb_array_elements(answer_payload) item
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

  timed_out_value := completed_value >= target_attempt.expires_at;
  passed_value := (not timed_out_value) and score_value >= target_attempt.passing_score_snapshot;
  duration_value := greatest(0, round(extract(epoch from (completed_value - target_attempt.started_at)))::integer);

  update public.test_attempts a set
    answers = answer_payload,
    correct_answers = correct_value,
    total_questions = total_value,
    score = score_value,
    passed = passed_value,
    timed_out = timed_out_value,
    completed_at = completed_value,
    duration_seconds = duration_value
  where a.id = target_attempt.id;

  return query select
    target_attempt.id,
    score_value,
    correct_value,
    total_value,
    passed_value,
    timed_out_value,
    completed_value,
    duration_value;
end;
$$;

revoke execute on function public.submit_course_test(uuid, jsonb) from public, anon;
grant execute on function public.submit_course_test(uuid, jsonb) to authenticated;

-- Restrict course files to authenticated users who own the upload or can access the linked course.
create or replace function public.can_access_course_file(check_path text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.content_blocks b
    join public.course_sections s on s.id = b.section_id
    where b.file_path = check_path
      and (public.is_enrolled(s.course_id) or public.can_manage_course(s.course_id))
  );
$$;

create or replace function public.can_manage_course_file(check_path text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.content_blocks b
    join public.course_sections s on s.id = b.section_id
    where b.file_path = check_path
      and public.can_manage_course(s.course_id)
  );
$$;

revoke execute on function public.can_access_course_file(text) from public, anon;
revoke execute on function public.can_manage_course_file(text) from public, anon;
grant execute on function public.can_access_course_file(text) to authenticated;
grant execute on function public.can_manage_course_file(text) to authenticated;

update storage.buckets
set public = false,
    file_size_limit = 26214400,
    allowed_mime_types = array['application/pdf','image/jpeg','image/png','image/webp','image/gif']
where id = 'course-files';

DROP POLICY IF EXISTS "course files public read" ON storage.objects;
DROP POLICY IF EXISTS "course files authenticated read" ON storage.objects;
CREATE POLICY "course files authenticated read" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'course-files'
  and (
    owner_id = auth.uid()::text
    or public.can_access_course_file(name)
  )
);

DROP POLICY IF EXISTS "course files manager insert" ON storage.objects;
CREATE POLICY "course files manager insert" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'course-files'
  and public.current_user_role() in ('admin', 'manager')
  and owner_id = auth.uid()::text
);

DROP POLICY IF EXISTS "course files manager update" ON storage.objects;
CREATE POLICY "course files manager update" ON storage.objects
FOR UPDATE TO authenticated
USING (
  bucket_id = 'course-files'
  and public.current_user_role() in ('admin', 'manager')
  and (owner_id = auth.uid()::text or public.can_manage_course_file(name))
)
WITH CHECK (
  bucket_id = 'course-files'
  and public.current_user_role() in ('admin', 'manager')
);

DROP POLICY IF EXISTS "course files manager delete" ON storage.objects;
CREATE POLICY "course files manager delete" ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'course-files'
  and public.current_user_role() in ('admin', 'manager')
  and (owner_id = auth.uid()::text or public.can_manage_course_file(name))
);
-- Course editing is one transaction: course + sections + blocks + test.
-- expected_updated_at provides optimistic concurrency protection against stale editor tabs/devices.
create or replace function public.save_course_with_content(
  check_course_id uuid,
  check_expected_updated_at timestamptz,
  check_payload jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  course_id_value uuid := check_course_id;
  owner_id_value uuid;
  old_updated_at timestamptz;
  payload_slug text;
  payload_title text;
  section_item jsonb;
  block_item jsonb;
  test_item jsonb;
  section_pos bigint;
  block_pos bigint;
  section_id_value uuid;
  block_id_value uuid;
  section_ids uuid[] := array[]::uuid[];
  block_ids uuid[];
  block_type_value public.content_block_type;
  file_path_value text;
  content_value text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if coalesce(public.current_user_role()::text, '') not in ('admin', 'manager') then
    raise exception 'Only admin or manager can edit courses';
  end if;

  if check_payload is null or jsonb_typeof(check_payload) <> 'object' then
    raise exception 'Course payload must be an object';
  end if;
  if pg_column_size(check_payload) > 2097152 then
    raise exception 'Course payload is too large';
  end if;

  payload_title := btrim(coalesce(check_payload->>'title', ''));
  payload_slug := btrim(lower(coalesce(check_payload->>'slug', '')));
  if char_length(payload_title) < 1 or char_length(payload_title) > 300 then
    raise exception 'Course title must contain 1-300 characters';
  end if;
  if char_length(payload_slug) < 1 or char_length(payload_slug) > 160 or payload_slug !~ '^[a-z0-9а-яё-]+$' then
    raise exception 'Course slug is invalid';
  end if;
  if jsonb_typeof(coalesce(check_payload->'sections', '[]'::jsonb)) <> 'array' then
    raise exception 'Course sections must be an array';
  end if;
  if jsonb_array_length(coalesce(check_payload->'sections', '[]'::jsonb)) > 100 then
    raise exception 'A course cannot contain more than 100 sections';
  end if;

  if course_id_value is null then
    insert into public.courses (
      slug, title, category, date_text, duration, format, location,
      image_url, short_description, description, outcomes,
      lecturer_name, lecturer_role, lecturer_bio, lecturer_photo,
      certificate, rating, created_by
    ) values (
      payload_slug,
      payload_title,
      left(btrim(coalesce(check_payload->>'category', '')), 160),
      left(btrim(coalesce(check_payload->>'date', '')), 160),
      left(btrim(coalesce(check_payload->>'duration', '')), 100),
      left(btrim(coalesce(check_payload->>'format', '')), 100),
      left(btrim(coalesce(check_payload->>'location', '')), 240),
      left(btrim(coalesce(check_payload->>'image', '')), 2000),
      left(btrim(coalesce(check_payload->>'shortDescription', '')), 1000),
      left(btrim(coalesce(check_payload->>'description', '')), 20000),
      coalesce(array(select jsonb_array_elements_text(coalesce(check_payload->'outcomes', '[]'::jsonb))), '{}'::text[]),
      left(btrim(coalesce(check_payload#>>'{lecturer,name}', '')), 200),
      left(btrim(coalesce(check_payload#>>'{lecturer,role}', '')), 200),
      left(btrim(coalesce(check_payload#>>'{lecturer,bio}', '')), 5000),
      left(btrim(coalesce(check_payload#>>'{lecturer,photo}', '')), 2000),
      coalesce((check_payload->>'certificate')::boolean, true),
      greatest(0, least(5, coalesce((check_payload->>'rating')::numeric, 5))),
      auth.uid()
    )
    returning id into course_id_value;
  else
    select c.created_by, c.updated_at
      into owner_id_value, old_updated_at
    from public.courses c
    where c.id = course_id_value
    for update;

    if owner_id_value is null then
      raise exception 'Course not found';
    end if;
    if not public.can_manage_course(course_id_value) then
      raise exception 'You do not have permission to edit this course';
    end if;
    if check_expected_updated_at is null or old_updated_at <> check_expected_updated_at then
      raise exception 'COURSE_EDIT_CONFLICT';
    end if;

    update public.courses c set
      slug = payload_slug,
      title = payload_title,
      category = left(btrim(coalesce(check_payload->>'category', '')), 160),
      date_text = left(btrim(coalesce(check_payload->>'date', '')), 160),
      duration = left(btrim(coalesce(check_payload->>'duration', '')), 100),
      format = left(btrim(coalesce(check_payload->>'format', '')), 100),
      location = left(btrim(coalesce(check_payload->>'location', '')), 240),
      image_url = left(btrim(coalesce(check_payload->>'image', '')), 2000),
      short_description = left(btrim(coalesce(check_payload->>'shortDescription', '')), 1000),
      description = left(btrim(coalesce(check_payload->>'description', '')), 20000),
      outcomes = coalesce(array(select jsonb_array_elements_text(coalesce(check_payload->'outcomes', '[]'::jsonb))), '{}'::text[]),
      lecturer_name = left(btrim(coalesce(check_payload#>>'{lecturer,name}', '')), 200),
      lecturer_role = left(btrim(coalesce(check_payload#>>'{lecturer,role}', '')), 200),
      lecturer_bio = left(btrim(coalesce(check_payload#>>'{lecturer,bio}', '')), 5000),
      lecturer_photo = left(btrim(coalesce(check_payload#>>'{lecturer,photo}', '')), 2000),
      certificate = coalesce((check_payload->>'certificate')::boolean, true),
      rating = greatest(0, least(5, coalesce((check_payload->>'rating')::numeric, 5)))
    where c.id = course_id_value;
  end if;

  for section_item, section_pos in
    select value, ordinality
    from jsonb_array_elements(coalesce(check_payload->'sections', '[]'::jsonb)) with ordinality
  loop
    if nullif(section_item->>'id', '') is not null then
      section_id_value := (section_item->>'id')::uuid;
      if section_id_value = any(section_ids) then raise exception 'Duplicate section'; end if;
      if not exists (
        select 1 from public.course_sections s
        where s.id = section_id_value and s.course_id = course_id_value
      ) then
        raise exception 'A section does not belong to this course';
      end if;
      update public.course_sections s set
        title = left(btrim(coalesce(section_item->>'title', '')), 300),
        description = left(btrim(coalesce(section_item->>'description', '')), 10000),
        position = section_pos
      where s.id = section_id_value;
    else
      insert into public.course_sections (course_id, title, description, position)
      values (
        course_id_value,
        left(btrim(coalesce(section_item->>'title', '')), 300),
        left(btrim(coalesce(section_item->>'description', '')), 10000),
        section_pos
      ) returning id into section_id_value;
    end if;

    if btrim(coalesce(section_item->>'title', '')) = '' then
      raise exception 'Section title cannot be empty';
    end if;

    section_ids := array_append(section_ids, section_id_value);
    block_ids := array[]::uuid[];

    if jsonb_typeof(coalesce(section_item->'blocks', '[]'::jsonb)) <> 'array' then
      raise exception 'Section blocks must be an array';
    end if;
    if jsonb_array_length(coalesce(section_item->'blocks', '[]'::jsonb)) > 200 then
      raise exception 'A section cannot contain more than 200 blocks';
    end if;

    for block_item, block_pos in
      select value, ordinality
      from jsonb_array_elements(coalesce(section_item->'blocks', '[]'::jsonb)) with ordinality
    loop
      block_type_value := (block_item->>'type')::public.content_block_type;
      file_path_value := nullif(btrim(coalesce(block_item->>'filePath', '')), '');
      content_value := left(coalesce(block_item->>'content', ''), 100000);

      if file_path_value is not null then
        if char_length(file_path_value) > 500 or file_path_value like '%..%' or left(file_path_value, 1) = '/' then
          raise exception 'Invalid course file path';
        end if;
        if not exists (
          select 1
          from storage.objects o
          where o.bucket_id = 'course-files'
            and o.name = file_path_value
            and (
              (o.owner_id = auth.uid()::text or split_part(o.name, '/', 1) = auth.uid()::text)
              or public.current_user_role() = 'admin'
              or exists (
                select 1
                from public.content_blocks old_b
                join public.course_sections old_s on old_s.id = old_b.section_id
                where old_b.file_path = file_path_value
                  and old_s.course_id = course_id_value
              )
            )
        ) then
          raise exception 'Course file is missing or is not owned by this editor';
        end if;
      end if;

      if block_type_value in ('pdf','image','youtube') and file_path_value is null and content_value<>'' and content_value !~ '^https?://' then raise exception 'Material URL must use HTTPS or HTTP'; end if;

      -- Signed/private Storage URLs are bearer credentials. Never persist them in content.
      if file_path_value is not null and block_type_value in ('pdf', 'image') then
        content_value := '';
      end if;

      if nullif(block_item->>'id', '') is not null then
        block_id_value := (block_item->>'id')::uuid;
        if block_id_value = any(block_ids) then raise exception 'Duplicate block'; end if;
        if not exists (
          select 1 from public.content_blocks b
          where b.id = block_id_value and b.section_id = section_id_value
        ) then
          raise exception 'A content block does not belong to this section';
        end if;
        update public.content_blocks b set
          type = block_type_value,
          title = left(btrim(coalesce(block_item->>'title', '')), 500),
          content = content_value,
          file_path = file_path_value,
          position = block_pos
        where b.id = block_id_value;
      else
        insert into public.content_blocks (section_id, type, title, content, file_path, position)
        values (
          section_id_value,
          block_type_value,
          left(btrim(coalesce(block_item->>'title', '')), 500),
          content_value,
          file_path_value,
          block_pos
        ) returning id into block_id_value;
      end if;

      block_ids := array_append(block_ids, block_id_value);
    end loop;

    delete from public.content_blocks b
    where b.section_id = section_id_value
      and not (b.id = any(block_ids));
  end loop;

  if exists (select 1 from public.course_sections s join public.section_progress p on p.section_id=s.id where s.course_id=course_id_value and not (s.id=any(section_ids))) then
    raise exception 'SECTION_HAS_PROGRESS';
  end if;

  delete from public.course_sections s
  where s.course_id = course_id_value
    and not (s.id = any(section_ids));

  test_item := check_payload->'test';
  if test_item is not null and jsonb_typeof(test_item) = 'object' then
    perform 1
    from public.save_course_test(
      course_id_value,
      coalesce((test_item->>'passingScore')::integer, 70),
      coalesce((test_item->>'timeLimitMinutes')::integer, 10),
      coalesce(test_item->'questions', '[]'::jsonb)
    );
  end if;

  return course_id_value;
end;
$$;

revoke execute on function public.save_course_with_content(uuid, timestamptz, jsonb) from public, anon;
grant execute on function public.save_course_with_content(uuid, timestamptz, jsonb) to authenticated;

-- Force course mutations through the transactional RPC above.
revoke insert, update, delete on public.courses from authenticated;
revoke insert, update, delete on public.course_sections from authenticated;
revoke insert, update, delete on public.content_blocks from authenticated;
grant select on public.courses, public.course_sections, public.content_blocks to authenticated;

-- Remove stale public/signed bearer URLs from private file blocks.
update public.content_blocks
set content = ''
where file_path is not null and type in ('pdf', 'image');

-- Refresh Supabase/PostgREST RPC metadata after creating or replacing functions.
notify pgrst, 'reload schema';
