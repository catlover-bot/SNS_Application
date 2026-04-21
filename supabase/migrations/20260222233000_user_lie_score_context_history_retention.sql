create table if not exists public.user_lie_score_context_coefficient_history_daily (
  user_id uuid not null references auth.users(id) on delete cascade,
  context_key text not null,
  day date not null,
  weekday_time_bucket text,
  persona_key text not null default 'global',
  attachment_mix_key text not null default 'none',
  points integer not null default 0,
  first_at timestamptz,
  last_at timestamptz,
  latest_adjustment_bias double precision not null default 0,
  avg_adjustment_bias double precision not null default 0,
  min_adjustment_bias double precision not null default 0,
  max_adjustment_bias double precision not null default 0,
  avg_confidence double precision not null default 0,
  max_confidence double precision not null default 0,
  latest_samples integer not null default 0,
  max_samples integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, context_key, day)
);

create index if not exists user_lie_score_context_history_daily_user_day_idx
  on public.user_lie_score_context_coefficient_history_daily (user_id, day desc);

create index if not exists user_lie_score_context_history_daily_bucket_idx
  on public.user_lie_score_context_coefficient_history_daily (user_id, weekday_time_bucket, persona_key, day desc);

alter table public.user_lie_score_context_coefficient_history_daily enable row level security;

drop policy if exists "user_lie_score_context_history_daily_select_own"
  on public.user_lie_score_context_coefficient_history_daily;
create policy "user_lie_score_context_history_daily_select_own"
  on public.user_lie_score_context_coefficient_history_daily
  for select
  using (auth.uid() = user_id);

create or replace function public.compress_user_lie_score_context_coefficient_history_daily(
  p_before_days integer default 7,
  p_user_id uuid default null
)
returns table (
  compressed_days integer,
  deleted_rows integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cutoff timestamptz;
  v_upserts integer := 0;
  v_deleted integer := 0;
begin
  v_cutoff := date_trunc('day', now()) - make_interval(days => greatest(1, coalesce(p_before_days, 7)));

  with source_rows as (
    select h.*
    from public.user_lie_score_context_coefficient_history h
    where h.created_at < v_cutoff
      and (p_user_id is null or h.user_id = p_user_id)
  ),
  agg as (
    select
      s.user_id,
      s.context_key,
      (s.created_at at time zone 'utc')::date as day,
      max(s.weekday_time_bucket) filter (where s.weekday_time_bucket is not null) as weekday_time_bucket,
      coalesce(nullif(max(s.persona_key), ''), 'global') as persona_key,
      coalesce(nullif(max(s.attachment_mix_key), ''), 'none') as attachment_mix_key,
      count(*)::int as points,
      min(s.created_at) as first_at,
      max(s.created_at) as last_at,
      avg(s.adjustment_bias)::double precision as avg_adjustment_bias,
      min(s.adjustment_bias)::double precision as min_adjustment_bias,
      max(s.adjustment_bias)::double precision as max_adjustment_bias,
      avg(s.confidence)::double precision as avg_confidence,
      max(s.confidence)::double precision as max_confidence,
      max(s.samples)::int as max_samples
    from source_rows s
    group by s.user_id, s.context_key, (s.created_at at time zone 'utc')::date
  ),
  latest as (
    select distinct on (s.user_id, s.context_key, (s.created_at at time zone 'utc')::date)
      s.user_id,
      s.context_key,
      (s.created_at at time zone 'utc')::date as day,
      s.adjustment_bias as latest_adjustment_bias,
      s.samples as latest_samples
    from source_rows s
    order by s.user_id, s.context_key, (s.created_at at time zone 'utc')::date, s.created_at desc, s.id desc
  ),
  upserted as (
    insert into public.user_lie_score_context_coefficient_history_daily (
      user_id,
      context_key,
      day,
      weekday_time_bucket,
      persona_key,
      attachment_mix_key,
      points,
      first_at,
      last_at,
      latest_adjustment_bias,
      avg_adjustment_bias,
      min_adjustment_bias,
      max_adjustment_bias,
      avg_confidence,
      max_confidence,
      latest_samples,
      max_samples,
      updated_at
    )
    select
      a.user_id,
      a.context_key,
      a.day,
      a.weekday_time_bucket,
      a.persona_key,
      a.attachment_mix_key,
      a.points,
      a.first_at,
      a.last_at,
      l.latest_adjustment_bias,
      a.avg_adjustment_bias,
      a.min_adjustment_bias,
      a.max_adjustment_bias,
      a.avg_confidence,
      a.max_confidence,
      coalesce(l.latest_samples, a.max_samples),
      a.max_samples,
      now()
    from agg a
    left join latest l
      on l.user_id = a.user_id
     and l.context_key = a.context_key
     and l.day = a.day
    on conflict (user_id, context_key, day)
    do update set
      weekday_time_bucket = excluded.weekday_time_bucket,
      persona_key = excluded.persona_key,
      attachment_mix_key = excluded.attachment_mix_key,
      points = excluded.points,
      first_at = excluded.first_at,
      last_at = excluded.last_at,
      latest_adjustment_bias = excluded.latest_adjustment_bias,
      avg_adjustment_bias = excluded.avg_adjustment_bias,
      min_adjustment_bias = excluded.min_adjustment_bias,
      max_adjustment_bias = excluded.max_adjustment_bias,
      avg_confidence = excluded.avg_confidence,
      max_confidence = excluded.max_confidence,
      latest_samples = excluded.latest_samples,
      max_samples = excluded.max_samples,
      updated_at = excluded.updated_at
    returning 1
  )
  select count(*)::int into v_upserts from upserted;

  delete from public.user_lie_score_context_coefficient_history h
  where h.created_at < v_cutoff
    and (p_user_id is null or h.user_id = p_user_id);
  get diagnostics v_deleted = row_count;

  return query select coalesce(v_upserts, 0), coalesce(v_deleted, 0);
end;
$$;

revoke all on function public.compress_user_lie_score_context_coefficient_history_daily(integer, uuid) from public;
grant execute on function public.compress_user_lie_score_context_coefficient_history_daily(integer, uuid) to service_role;
