-- Participant ratings: identities remain private; only aggregates are public.
create table if not exists public.course_ratings (
  course_id uuid not null references public.courses(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (course_id, user_id)
);
alter table public.course_ratings enable row level security;
revoke all on public.course_ratings from public, anon, authenticated;
grant select on public.course_ratings to authenticated;
drop policy if exists rating_owner_read on public.course_ratings;
create policy rating_owner_read on public.course_ratings for select to authenticated
  using (user_id = auth.uid());

create or replace function public.rate_course(check_course_id uuid, check_rating integer)
returns public.course_ratings
language plpgsql security definer set search_path = '' as $$
declare target public.course_ratings%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if check_rating is null or check_rating not between 1 and 5 then
    raise exception 'RATING_INVALID';
  end if;
  -- Share the course-edit lock and derive completion from trusted progress/test data.
  perform 1 from public.courses where id = check_course_id and archived_at is null for share;
  if not found then raise exception 'Course not found'; end if;
  perform public.finalize_course_completion(check_course_id);
  insert into public.course_ratings(course_id, user_id, rating)
    values (check_course_id, auth.uid(), check_rating)
  on conflict (course_id, user_id) do update
    set rating = excluded.rating, updated_at = clock_timestamp()
  returning * into target;
  return target;
end;
$$;
revoke all on function public.rate_course(uuid, integer) from public, anon;
grant execute on function public.rate_course(uuid, integer) to authenticated;

create or replace function public.get_course_rating_summaries(check_course_ids uuid[])
returns table(course_id uuid, rating numeric, rating_count bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  if coalesce(cardinality(check_course_ids), 0) > 1000 then
    raise exception 'Too many courses';
  end if;
  return query
    select c.id, coalesce(round(avg(r.rating), 1), 5::numeric), count(r.user_id)
    from public.courses c left join public.course_ratings r on r.course_id = c.id
    where c.id = any(check_course_ids)
    group by c.id;
end;
$$;
revoke all on function public.get_course_rating_summaries(uuid[]) from public;
grant execute on function public.get_course_rating_summaries(uuid[]) to anon, authenticated;
