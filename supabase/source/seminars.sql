-- Seminar options and versioned question types. Applied in the same transaction as the core schema.
alter table public.courses add column if not exists academic_hours integer check (academic_hours between 1 and 10000);
alter table public.test_questions add column if not exists question_type text not null default 'single_choice'
  check (question_type in ('single_choice','multiple_choice','true_false','short_answer'));
alter table public.test_question_answers alter column correct_option_id drop not null;
alter table public.test_question_answers add column if not exists correct_option_ids uuid[];
alter table public.test_question_answers add column if not exists accepted_answers text[];
alter table public.certificates add column if not exists academic_hours_snapshot integer;
alter table public.certificates add column if not exists city_snapshot text;
alter table public.certificates add column if not exists template_version integer not null default 2;

-- Never infer hours for existing courses/certificates from free-form duration text.
update public.courses c set certificate = exists(select 1 from public.course_tests t where t.course_id=c.id and t.enabled)
where c.certificate is distinct from exists(select 1 from public.course_tests t where t.course_id=c.id and t.enabled);

create or replace function public.normalize_test_answer(value text) returns text
language sql immutable set search_path='' as $$
  select lower(btrim(regexp_replace(value, '[[:space:]]+', ' ', 'g')));
$$;
revoke all on function public.normalize_test_answer(text) from public,anon,authenticated;

create or replace function public.save_course_test(check_course_id uuid, check_passing_score integer,
  check_time_limit_minutes integer, check_questions jsonb)
returns table(test_id uuid,test_version integer)
language plpgsql security definer set search_path='' as $$
declare
  tid uuid; ver integer; item jsonb; opt jsonb; pos bigint; opos bigint;
  qid uuid; oid uuid; kind text; indices integer[]; correct_ids uuid[];
  accepted text[]; options jsonb; total integer;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  perform 1 from public.courses where id=check_course_id for update;
  if not public.can_manage_course(check_course_id) then raise exception 'You do not have permission to edit this course test'; end if;
  if check_passing_score is null or check_passing_score not in (60,70,80,90,100) then raise exception 'Invalid passing score'; end if;
  if check_time_limit_minutes is null or check_time_limit_minutes not between 1 and 480 then raise exception 'Invalid time limit'; end if;
  if check_questions is null or jsonb_typeof(check_questions)<>'array' or pg_column_size(check_questions)>1048576 then raise exception 'Invalid questions'; end if;
  total:=jsonb_array_length(check_questions);
  if total not between 1 and 200 then raise exception 'A test must contain 1-200 questions'; end if;
  insert into public.course_tests(course_id,enabled,passing_score,time_limit_minutes,question_count,version)
  values(check_course_id,true,check_passing_score,check_time_limit_minutes,total,1)
  on conflict(course_id) do update set enabled=true,passing_score=excluded.passing_score,
    time_limit_minutes=excluded.time_limit_minutes,question_count=excluded.question_count,version=public.course_tests.version+1
  returning id,version into tid,ver;
  for item,pos in select value,ordinality from jsonb_array_elements(check_questions) with ordinality loop
    kind:=coalesce(item->>'type','single_choice');
    if jsonb_typeof(item)<>'object' or jsonb_typeof(item->'text') is distinct from 'string'
      or char_length(btrim(item->>'text')) not between 1 and 2000
      or kind not in ('single_choice','multiple_choice','true_false','short_answer') then raise exception 'Invalid question'; end if;
    correct_ids:='{}'; accepted:=null;
    insert into public.test_questions(test_id,version,question_text,position,question_type)
    values(tid,ver,btrim(item->>'text'),pos,kind) returning id into qid;
    if kind='short_answer' then
      if jsonb_typeof(item->'acceptedAnswers') is distinct from 'array' then raise exception 'Accepted answers must be an array'; end if;
      if jsonb_array_length(item->'acceptedAnswers') not between 1 and 20 or exists(
        select 1 from jsonb_array_elements(item->'acceptedAnswers') a
        where jsonb_typeof(a)<>'string' or char_length(public.normalize_test_answer(a#>>'{}')) not between 1 and 500
      ) then raise exception 'Invalid accepted answers'; end if;
      select array_agg(distinct public.normalize_test_answer(a)) into accepted from jsonb_array_elements_text(item->'acceptedAnswers') a;
    else
      options:=item->'options';
      if jsonb_typeof(options) is distinct from 'array' then raise exception 'Options must be an array'; end if;
      if jsonb_array_length(options) not between 2 and 6 or (kind='true_false' and jsonb_array_length(options)<>2) then raise exception 'Invalid option count'; end if;
      if kind='multiple_choice' then
        if jsonb_typeof(item->'correctOptionIndices') is distinct from 'array' then raise exception 'Correct indices must be an array'; end if;
        if exists(select 1 from jsonb_array_elements(item->'correctOptionIndices') a where jsonb_typeof(a)<>'number' or (a#>>'{}') !~ '^[0-9]+$') then raise exception 'Invalid correct indices'; end if;
        select array_agg(a::integer) into indices from jsonb_array_elements_text(item->'correctOptionIndices') a;
      else
        if jsonb_typeof(item->'correctOptionIndex') is distinct from 'number' or (item->>'correctOptionIndex') !~ '^[0-9]+$' then raise exception 'Invalid correct index'; end if;
        indices:=array[(item->>'correctOptionIndex')::integer];
      end if;
      if coalesce(cardinality(indices),0)<1 or cardinality(indices)<>(select count(distinct i) from unnest(indices) i)
        or exists(select 1 from unnest(indices) i where i<0 or i>=jsonb_array_length(options)) then raise exception 'Invalid correct indices'; end if;
      for opt,opos in select value,ordinality from jsonb_array_elements(options) with ordinality loop
        if jsonb_typeof(opt)<>'string' or char_length(btrim(opt#>>'{}')) not between 1 and 1000 then raise exception 'Invalid option text'; end if;
        insert into public.test_options(question_id,option_text,position) values(qid,btrim(opt#>>'{}'),opos) returning id into oid;
        if (opos-1)=any(indices) then correct_ids:=array_append(correct_ids,oid); end if;
      end loop;
    end if;
    insert into public.test_question_answers(question_id,correct_option_id,correct_option_ids,accepted_answers)
    values(qid,case when kind in ('single_choice','true_false') then correct_ids[1] else null end,correct_ids,accepted);
  end loop;
  return query select tid,ver;
end;
$$;
-- Only the transactional course editor may call this helper.
revoke all on function public.save_course_test(uuid,integer,integer,jsonb) from public,anon,authenticated;

create or replace function public.submit_course_test(check_attempt_id uuid,check_answers jsonb)
returns table(attempt_id uuid,score integer,correct_answers integer,total_questions integer,passed boolean,
  timed_out boolean,completed_at timestamptz,duration_seconds integer)
language plpgsql security definer set search_path='' as $$
declare
  attempt public.test_attempts%rowtype; question public.test_questions%rowtype; key public.test_question_answers%rowtype;
  payload jsonb:=coalesce(check_answers,'[]'); item jsonb; ids uuid[]; expected uuid[];
  total integer; correct integer:=0; result integer; expired boolean; finished timestamptz; duration integer;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if jsonb_typeof(payload)<>'array' or pg_column_size(payload)>262144 then raise exception 'Invalid answers'; end if;
  select * into attempt from public.test_attempts a where a.id=check_attempt_id and a.user_id=auth.uid() for update;
  if attempt.id is null then raise exception 'Test attempt not found'; end if;
  if attempt.completed_at is not null then raise exception 'This test attempt has already been submitted'; end if;
  finished:=clock_timestamp();
  select count(*) into total from public.test_questions q where q.test_id=attempt.test_id and q.version=attempt.test_version;
  if jsonb_array_length(payload)>total then raise exception 'Too many answers were submitted'; end if;
  if exists(select 1 from jsonb_array_elements(payload) a group by a->>'question_id' having count(*)>1) then raise exception 'Only one answer per question is allowed'; end if;
  for item in select value from jsonb_array_elements(payload) loop
    if jsonb_typeof(item)<>'object' then raise exception 'Submitted answers contain invalid question or option identifiers'; end if;
    select * into question from public.test_questions q where q.id=(item->>'question_id')::uuid and q.test_id=attempt.test_id and q.version=attempt.test_version;
    if question.id is null then raise exception 'Submitted answers contain invalid question or option identifiers'; end if;
    select * into key from public.test_question_answers a where a.question_id=question.id;
    if question.question_type='short_answer' then
      if jsonb_typeof(item->'text') is distinct from 'string' or char_length(item->>'text')>500 or item ?| array['option_id','option_ids'] then raise exception 'Invalid text answer'; end if;
      if public.normalize_test_answer(item->>'text')=any(key.accepted_answers) then correct:=correct+1; end if;
    else
      if item ? 'text' then raise exception 'Invalid choice answer'; end if;
      if question.question_type='multiple_choice' then
        if jsonb_typeof(item->'option_ids') is distinct from 'array' or item ? 'option_id' then raise exception 'Invalid option set'; end if;
        if jsonb_array_length(item->'option_ids') not between 1 and 6 then raise exception 'Invalid option set'; end if;
        select array_agg(a::uuid) into ids from jsonb_array_elements_text(item->'option_ids') a;
      else
        if jsonb_typeof(item->'option_id') is distinct from 'string' or item ? 'option_ids' then raise exception 'Submitted answers contain invalid question or option identifiers'; end if;
        ids:=array[(item->>'option_id')::uuid];
      end if;
      if cardinality(ids)<>(select count(distinct i) from unnest(ids) i) or exists(
        select 1 from unnest(ids) i where not exists(select 1 from public.test_options o where o.id=i and o.question_id=question.id)
      ) then raise exception 'Submitted answers contain invalid question or option identifiers'; end if;
      expected:=coalesce(nullif(key.correct_option_ids,'{}'::uuid[]),array[key.correct_option_id]);
      if ids @> expected and ids <@ expected then correct:=correct+1; end if;
    end if;
  end loop;
  result:=case when total>0 then round(correct*100.0/total)::integer else 0 end;
  expired:=finished>=attempt.expires_at;
  duration:=greatest(0,round(extract(epoch from(finished-attempt.started_at)))::integer);
  update public.test_attempts set answers=payload,correct_answers=correct,total_questions=total,score=result,
    passed=(not expired and result>=attempt.passing_score_snapshot),timed_out=expired,completed_at=finished,duration_seconds=duration where id=attempt.id;
  return query select attempt.id,result,correct,total,(not expired and result>=attempt.passing_score_snapshot),expired,finished,duration;
end;
$$;
revoke all on function public.submit_course_test(uuid,jsonb) from public,anon;
grant execute on function public.submit_course_test(uuid,jsonb) to authenticated;

create or replace function public.app_readiness() returns text language sql security definer set search_path='' as $$ select 'aquageo-3'; $$;
revoke all on function public.app_readiness() from public,anon,authenticated;
grant execute on function public.app_readiness() to service_role;
