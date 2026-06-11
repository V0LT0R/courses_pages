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
