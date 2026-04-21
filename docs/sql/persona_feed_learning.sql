-- Persona feed online-learning tables
-- Run manually on Supabase SQL editor if you want event logging + adaptive weights.

create table if not exists public.user_persona_affinity (
  user_id uuid not null references auth.users(id) on delete cascade,
  persona_key text not null,
  weight double precision not null default 1.0,
  updated_at timestamptz not null default now(),
  primary key (user_id, persona_key)
);

create table if not exists public.persona_feed_events (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  post_id uuid not null,
  persona_key text null,
  event text not null,
  reason text null,
  dwell_ms integer null,
  created_at timestamptz not null default now()
);

create table if not exists public.persona_dwell_learning_state (
  user_id uuid not null references auth.users(id) on delete cascade,
  persona_key text not null default '__all__',
  event_type text not null default '__all__',
  dwell_bucket text not null,
  samples integer not null default 0,
  positive_score double precision not null default 0,
  negative_score double precision not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, persona_key, event_type, dwell_bucket)
);

create table if not exists public.persona_buzz_learning_state (
  user_id uuid not null references auth.users(id) on delete cascade,
  persona_key text not null default '__all__',
  samples integer not null default 0,
  predicted_avg double precision not null default 0.5,
  actual_avg double precision not null default 0.2,
  multiplier double precision not null default 1.0,
  updated_at timestamptz not null default now(),
  primary key (user_id, persona_key)
);

create table if not exists public.user_persona_buddy_learning_state (
  user_id uuid not null references auth.users(id) on delete cascade,
  base_persona_key text not null,
  buddy_persona_key text not null,
  samples integer not null default 0,
  positive_score double precision not null default 0,
  negative_score double precision not null default 0,
  bonus_scale double precision not null default 0.42,
  updated_at timestamptz not null default now(),
  primary key (user_id, base_persona_key, buddy_persona_key)
);

create table if not exists public.user_persona_feed_preferences (
  user_id uuid not null references auth.users(id) on delete cascade,
  buddy_learning_mode text not null default 'adaptive',
  updated_at timestamptz not null default now(),
  primary key (user_id),
  constraint user_persona_feed_preferences_buddy_learning_mode_check
    check (buddy_learning_mode in ('adaptive', 'stable'))
);

create table if not exists public.user_persona_buddy_learning_history (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  base_persona_key text not null,
  buddy_persona_key text not null,
  samples integer not null default 0,
  bonus_scale double precision not null default 0.42,
  confidence double precision not null default 0,
  learning_mode text not null default 'adaptive',
  event_type text null,
  created_at timestamptz not null default now(),
  constraint user_persona_buddy_learning_history_learning_mode_check
    check (learning_mode in ('adaptive', 'stable'))
);

create table if not exists public.user_persona_buddy_mission_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  mission_date date not null,
  base_persona_key text not null default '__all__',
  buddy_persona_key text not null,
  mission_kind text not null default 'open',
  progress_count integer not null default 0,
  target_count integer not null default 1,
  unlocked_at timestamptz null,
  last_event_at timestamptz null,
  updated_at timestamptz not null default now(),
  primary key (user_id, mission_date, base_persona_key, buddy_persona_key, mission_kind)
);

create table if not exists public.user_persona_rewrite_learning_state (
  user_id uuid not null references auth.users(id) on delete cascade,
  base_persona_key text not null,
  buddy_persona_key text not null,
  rewrite_style text not null,
  samples integer not null default 0,
  predicted_avg double precision not null default 0.5,
  actual_avg double precision not null default 0.2,
  multiplier double precision not null default 1.0,
  confidence double precision not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, base_persona_key, buddy_persona_key, rewrite_style)
);

create table if not exists public.user_persona_feed_ab_assignments (
  user_id uuid not null references auth.users(id) on delete cascade,
  experiment_key text not null,
  variant_key text not null,
  assigned_mode text not null,
  assigned_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, experiment_key),
  constraint user_persona_feed_ab_assignments_variant_check
    check (variant_key in ('A', 'B')),
  constraint user_persona_feed_ab_assignments_mode_check
    check (assigned_mode in ('adaptive', 'stable'))
);

create table if not exists public.persona_feed_mode_ab_events (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  experiment_key text not null,
  variant_key text not null,
  event_type text not null,
  mode text not null,
  strategy text null,
  post_id uuid null,
  created_at timestamptz not null default now(),
  constraint persona_feed_mode_ab_events_variant_check
    check (variant_key in ('A', 'B')),
  constraint persona_feed_mode_ab_events_mode_check
    check (mode in ('adaptive', 'stable'))
);

create table if not exists public.user_persona_buddy_mission_xp_state (
  user_id uuid not null references auth.users(id) on delete cascade,
  base_persona_key text not null default '__all__',
  buddy_persona_key text not null,
  xp_total integer not null default 0,
  completed_missions integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, base_persona_key, buddy_persona_key)
);

create table if not exists public.user_persona_rewrite_context_learning_state (
  user_id uuid not null references auth.users(id) on delete cascade,
  base_persona_key text not null,
  buddy_persona_key text not null,
  rewrite_style text not null,
  time_bucket text not null,
  weekday_bucket text not null,
  samples integer not null default 0,
  predicted_avg double precision not null default 0.5,
  actual_avg double precision not null default 0.2,
  multiplier double precision not null default 1.0,
  confidence double precision not null default 0,
  updated_at timestamptz not null default now(),
  primary key (
    user_id,
    base_persona_key,
    buddy_persona_key,
    rewrite_style,
    time_bucket,
    weekday_bucket
  )
);

create index if not exists idx_persona_feed_events_user_created
  on public.persona_feed_events (user_id, created_at desc);

create index if not exists idx_persona_feed_events_persona
  on public.persona_feed_events (persona_key, created_at desc);

drop index if exists public.idx_persona_dwell_learning_user_updated;
create index idx_persona_dwell_learning_user_updated
  on public.persona_dwell_learning_state (user_id, persona_key, event_type, updated_at desc);

drop index if exists public.idx_persona_dwell_learning_bucket;
create index idx_persona_dwell_learning_bucket
  on public.persona_dwell_learning_state (user_id, persona_key, event_type, dwell_bucket);

drop index if exists public.idx_persona_buzz_learning_updated;
create index idx_persona_buzz_learning_updated
  on public.persona_buzz_learning_state (user_id, persona_key, updated_at desc);

create index if not exists idx_persona_buddy_learning_user_base_updated
  on public.user_persona_buddy_learning_state (user_id, base_persona_key, updated_at desc);

create index if not exists idx_persona_buddy_learning_user_base_pair
  on public.user_persona_buddy_learning_state (user_id, base_persona_key, buddy_persona_key);

create index if not exists idx_persona_feed_preferences_user_updated
  on public.user_persona_feed_preferences (user_id, updated_at desc);

create index if not exists idx_persona_buddy_learning_history_user_base_pair_created
  on public.user_persona_buddy_learning_history (
    user_id,
    base_persona_key,
    buddy_persona_key,
    created_at desc
  );

create index if not exists idx_persona_buddy_learning_history_user_created
  on public.user_persona_buddy_learning_history (user_id, created_at desc);

create index if not exists idx_persona_buddy_mission_progress_user_date
  on public.user_persona_buddy_mission_progress (user_id, mission_date desc, updated_at desc);

create index if not exists idx_persona_rewrite_learning_user_pair
  on public.user_persona_rewrite_learning_state (user_id, base_persona_key, buddy_persona_key, updated_at desc);

create index if not exists idx_persona_feed_ab_assignments_user
  on public.user_persona_feed_ab_assignments (user_id, experiment_key, updated_at desc);

create index if not exists idx_persona_feed_mode_ab_events_user_created
  on public.persona_feed_mode_ab_events (user_id, created_at desc);

create index if not exists idx_persona_feed_mode_ab_events_experiment
  on public.persona_feed_mode_ab_events (experiment_key, variant_key, event_type, created_at desc);

create index if not exists idx_persona_buddy_mission_xp_user_pair
  on public.user_persona_buddy_mission_xp_state (user_id, base_persona_key, buddy_persona_key, updated_at desc);

create index if not exists idx_persona_rewrite_context_user_pair
  on public.user_persona_rewrite_context_learning_state (
    user_id,
    base_persona_key,
    buddy_persona_key,
    time_bucket,
    weekday_bucket,
    updated_at desc
  );

do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'persona_dwell_learning_state'
  ) then
    alter table public.persona_dwell_learning_state
      add column if not exists persona_key text;

    update public.persona_dwell_learning_state
      set persona_key = '__all__'
      where persona_key is null or btrim(persona_key) = '';

    alter table public.persona_dwell_learning_state
      add column if not exists event_type text;

    update public.persona_dwell_learning_state
      set event_type = '__all__'
      where event_type is null or btrim(event_type) = '';

    alter table public.persona_dwell_learning_state
      alter column persona_key set default '__all__';

    alter table public.persona_dwell_learning_state
      alter column persona_key set not null;

    alter table public.persona_dwell_learning_state
      alter column event_type set default '__all__';

    alter table public.persona_dwell_learning_state
      alter column event_type set not null;

    alter table public.persona_dwell_learning_state
      drop constraint if exists persona_dwell_learning_state_pkey;

    alter table public.persona_dwell_learning_state
      add constraint persona_dwell_learning_state_pkey
      primary key (user_id, persona_key, event_type, dwell_bucket);
  end if;
end $$;

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

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'user_lie_score_context_coefficient_history_daily'
      and policyname = 'user_lie_score_context_history_daily_select_own'
  ) then
    create policy user_lie_score_context_history_daily_select_own
      on public.user_lie_score_context_coefficient_history_daily
      for select
      to authenticated
      using (auth.uid() = user_id);
  end if;
end $$;

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
as $fn$
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
      user_id, context_key, day, weekday_time_bucket, persona_key, attachment_mix_key,
      points, first_at, last_at, latest_adjustment_bias, avg_adjustment_bias, min_adjustment_bias,
      max_adjustment_bias, avg_confidence, max_confidence, latest_samples, max_samples, updated_at
    )
    select
      a.user_id, a.context_key, a.day, a.weekday_time_bucket, a.persona_key, a.attachment_mix_key,
      a.points, a.first_at, a.last_at, l.latest_adjustment_bias, a.avg_adjustment_bias, a.min_adjustment_bias,
      a.max_adjustment_bias, a.avg_confidence, a.max_confidence, coalesce(l.latest_samples, a.max_samples),
      a.max_samples, now()
    from agg a
    left join latest l
      on l.user_id = a.user_id and l.context_key = a.context_key and l.day = a.day
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
$fn$;

create table if not exists public.user_lie_score_context_coefficient_history (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  context_key text not null,
  weekday_time_bucket text,
  persona_key text not null default 'global',
  attachment_mix_key text not null default 'none',
  adjustment_bias double precision not null default 0,
  confidence double precision not null default 0,
  samples integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists user_lie_score_context_coefficient_history_user_context_created_idx
  on public.user_lie_score_context_coefficient_history (user_id, context_key, created_at desc);

create index if not exists user_lie_score_context_coefficient_history_bucket_idx
  on public.user_lie_score_context_coefficient_history (user_id, weekday_time_bucket, persona_key, created_at desc);

alter table public.user_lie_score_context_coefficient_history enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'user_lie_score_context_coefficient_history'
      and policyname = 'user_lie_score_context_coefficient_history_select_own'
  ) then
    create policy user_lie_score_context_coefficient_history_select_own
      on public.user_lie_score_context_coefficient_history
      for select
      to authenticated
      using (auth.uid() = user_id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'user_lie_score_context_coefficient_history'
      and policyname = 'user_lie_score_context_coefficient_history_insert_own'
  ) then
    create policy user_lie_score_context_coefficient_history_insert_own
      on public.user_lie_score_context_coefficient_history
      for insert
      to authenticated
      with check (auth.uid() = user_id);
  end if;
end $$;

create table if not exists public.user_lie_score_context_coefficients (
  user_id uuid not null references auth.users(id) on delete cascade,
  context_key text not null,
  weekday_time_bucket text not null,
  persona_key text not null default 'global',
  attachment_mix_key text not null default 'none',
  adjustment_bias double precision not null default 0,
  confidence double precision not null default 0,
  samples integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, context_key)
);

create index if not exists user_lie_score_context_coefficients_user_updated_idx
  on public.user_lie_score_context_coefficients (user_id, updated_at desc);

create index if not exists user_lie_score_context_coefficients_bucket_idx
  on public.user_lie_score_context_coefficients (user_id, weekday_time_bucket, persona_key);

alter table public.user_lie_score_context_coefficients enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'user_lie_score_context_coefficients'
      and policyname = 'user_lie_score_context_coefficients_select_own'
  ) then
    create policy user_lie_score_context_coefficients_select_own
      on public.user_lie_score_context_coefficients
      for select
      to authenticated
      using (auth.uid() = user_id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'user_lie_score_context_coefficients'
      and policyname = 'user_lie_score_context_coefficients_insert_own'
  ) then
    create policy user_lie_score_context_coefficients_insert_own
      on public.user_lie_score_context_coefficients
      for insert
      to authenticated
      with check (auth.uid() = user_id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'user_lie_score_context_coefficients'
      and policyname = 'user_lie_score_context_coefficients_update_own'
  ) then
    create policy user_lie_score_context_coefficients_update_own
      on public.user_lie_score_context_coefficients
      for update
      to authenticated
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;
end $$;

-- timeline signal weights history (for trend visualization)
create table if not exists public.user_timeline_signal_weights_history (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  followed_author_boost double precision not null,
  saved_post_boost double precision not null,
  opened_penalty double precision not null,
  interested_persona_boost double precision not null,
  interested_author_boost double precision not null,
  base_score_weight double precision not null,
  predicted_buzz_weight double precision not null,
  recency_weight double precision not null,
  opened_count integer not null default 0,
  saved_count integer not null default 0,
  followed_count integer not null default 0,
  samples integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists user_timeline_signal_weights_history_user_created_idx
  on public.user_timeline_signal_weights_history (user_id, created_at desc);

alter table public.user_timeline_signal_weights_history enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'user_timeline_signal_weights_history'
      and policyname = 'user_timeline_signal_weights_history_select_own'
  ) then
    create policy user_timeline_signal_weights_history_select_own
      on public.user_timeline_signal_weights_history
      for select
      to authenticated
      using (auth.uid() = user_id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'user_timeline_signal_weights_history'
      and policyname = 'user_timeline_signal_weights_history_insert_own'
  ) then
    create policy user_timeline_signal_weights_history_insert_own
      on public.user_timeline_signal_weights_history
      for insert
      to authenticated
      with check (auth.uid() = user_id);
  end if;
end $$;

alter table public.user_persona_affinity enable row level security;
alter table public.persona_feed_events enable row level security;
alter table public.persona_dwell_learning_state enable row level security;
alter table public.persona_buzz_learning_state enable row level security;
alter table public.user_persona_buddy_learning_state enable row level security;
alter table public.user_persona_feed_preferences enable row level security;
alter table public.user_persona_buddy_learning_history enable row level security;
alter table public.user_persona_buddy_mission_progress enable row level security;
alter table public.user_persona_rewrite_learning_state enable row level security;
alter table public.user_persona_feed_ab_assignments enable row level security;
alter table public.persona_feed_mode_ab_events enable row level security;
alter table public.user_persona_buddy_mission_xp_state enable row level security;
alter table public.user_persona_rewrite_context_learning_state enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'user_persona_affinity'
      and policyname = 'user_persona_affinity_select_own'
  ) then
    create policy user_persona_affinity_select_own
      on public.user_persona_affinity
      for select
      to authenticated
      using (auth.uid() = user_id);
  end if;
end $$;

create table if not exists public.user_timeline_signal_weights (
  user_id uuid primary key references auth.users(id) on delete cascade,
  followed_author_boost double precision not null default 0.28,
  saved_post_boost double precision not null default 0.34,
  opened_penalty double precision not null default 0.16,
  interested_persona_boost double precision not null default 0.17,
  interested_author_boost double precision not null default 0.20,
  base_score_weight double precision not null default 0.38,
  predicted_buzz_weight double precision not null default 0.26,
  recency_weight double precision not null default 0.14,
  opened_count integer not null default 0,
  saved_count integer not null default 0,
  followed_count integer not null default 0,
  samples integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists user_timeline_signal_weights_updated_idx
  on public.user_timeline_signal_weights (updated_at desc);

alter table public.user_timeline_signal_weights enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'user_timeline_signal_weights'
      and policyname = 'user_timeline_signal_weights_select_own'
  ) then
    create policy user_timeline_signal_weights_select_own
      on public.user_timeline_signal_weights
      for select
      to authenticated
      using (auth.uid() = user_id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'user_timeline_signal_weights'
      and policyname = 'user_timeline_signal_weights_upsert_own'
  ) then
    create policy user_timeline_signal_weights_upsert_own
      on public.user_timeline_signal_weights
      for all
      to authenticated
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'user_persona_buddy_mission_xp_state'
      and policyname = 'user_persona_buddy_mission_xp_state_select_own'
  ) then
    create policy user_persona_buddy_mission_xp_state_select_own
      on public.user_persona_buddy_mission_xp_state
      for select
      to authenticated
      using (auth.uid() = user_id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'user_persona_buddy_mission_xp_state'
      and policyname = 'user_persona_buddy_mission_xp_state_upsert_own'
  ) then
    create policy user_persona_buddy_mission_xp_state_upsert_own
      on public.user_persona_buddy_mission_xp_state
      for all
      to authenticated
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'user_persona_rewrite_context_learning_state'
      and policyname = 'user_persona_rewrite_context_learning_state_select_own'
  ) then
    create policy user_persona_rewrite_context_learning_state_select_own
      on public.user_persona_rewrite_context_learning_state
      for select
      to authenticated
      using (auth.uid() = user_id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'user_persona_rewrite_context_learning_state'
      and policyname = 'user_persona_rewrite_context_learning_state_upsert_own'
  ) then
    create policy user_persona_rewrite_context_learning_state_upsert_own
      on public.user_persona_rewrite_context_learning_state
      for all
      to authenticated
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'user_persona_buddy_mission_progress'
      and policyname = 'user_persona_buddy_mission_progress_select_own'
  ) then
    create policy user_persona_buddy_mission_progress_select_own
      on public.user_persona_buddy_mission_progress
      for select
      to authenticated
      using (auth.uid() = user_id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'user_persona_buddy_mission_progress'
      and policyname = 'user_persona_buddy_mission_progress_upsert_own'
  ) then
    create policy user_persona_buddy_mission_progress_upsert_own
      on public.user_persona_buddy_mission_progress
      for all
      to authenticated
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'user_persona_rewrite_learning_state'
      and policyname = 'user_persona_rewrite_learning_state_select_own'
  ) then
    create policy user_persona_rewrite_learning_state_select_own
      on public.user_persona_rewrite_learning_state
      for select
      to authenticated
      using (auth.uid() = user_id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'user_persona_rewrite_learning_state'
      and policyname = 'user_persona_rewrite_learning_state_upsert_own'
  ) then
    create policy user_persona_rewrite_learning_state_upsert_own
      on public.user_persona_rewrite_learning_state
      for all
      to authenticated
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'user_persona_feed_ab_assignments'
      and policyname = 'user_persona_feed_ab_assignments_select_own'
  ) then
    create policy user_persona_feed_ab_assignments_select_own
      on public.user_persona_feed_ab_assignments
      for select
      to authenticated
      using (auth.uid() = user_id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'user_persona_feed_ab_assignments'
      and policyname = 'user_persona_feed_ab_assignments_upsert_own'
  ) then
    create policy user_persona_feed_ab_assignments_upsert_own
      on public.user_persona_feed_ab_assignments
      for all
      to authenticated
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'persona_feed_mode_ab_events'
      and policyname = 'persona_feed_mode_ab_events_select_own'
  ) then
    create policy persona_feed_mode_ab_events_select_own
      on public.persona_feed_mode_ab_events
      for select
      to authenticated
      using (auth.uid() = user_id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'persona_feed_mode_ab_events'
      and policyname = 'persona_feed_mode_ab_events_insert_own'
  ) then
    create policy persona_feed_mode_ab_events_insert_own
      on public.persona_feed_mode_ab_events
      for insert
      to authenticated
      with check (auth.uid() = user_id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'user_persona_feed_preferences'
      and policyname = 'user_persona_feed_preferences_select_own'
  ) then
    create policy user_persona_feed_preferences_select_own
      on public.user_persona_feed_preferences
      for select
      to authenticated
      using (auth.uid() = user_id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'user_persona_feed_preferences'
      and policyname = 'user_persona_feed_preferences_upsert_own'
  ) then
    create policy user_persona_feed_preferences_upsert_own
      on public.user_persona_feed_preferences
      for all
      to authenticated
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'user_persona_buddy_learning_history'
      and policyname = 'user_persona_buddy_learning_history_select_own'
  ) then
    create policy user_persona_buddy_learning_history_select_own
      on public.user_persona_buddy_learning_history
      for select
      to authenticated
      using (auth.uid() = user_id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'user_persona_buddy_learning_history'
      and policyname = 'user_persona_buddy_learning_history_insert_own'
  ) then
    create policy user_persona_buddy_learning_history_insert_own
      on public.user_persona_buddy_learning_history
      for insert
      to authenticated
      with check (auth.uid() = user_id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'user_persona_buddy_learning_state'
      and policyname = 'user_persona_buddy_learning_state_select_own'
  ) then
    create policy user_persona_buddy_learning_state_select_own
      on public.user_persona_buddy_learning_state
      for select
      to authenticated
      using (auth.uid() = user_id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'user_persona_buddy_learning_state'
      and policyname = 'user_persona_buddy_learning_state_upsert_own'
  ) then
    create policy user_persona_buddy_learning_state_upsert_own
      on public.user_persona_buddy_learning_state
      for all
      to authenticated
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'persona_buzz_learning_state'
      and policyname = 'persona_buzz_learning_state_select_own'
  ) then
    create policy persona_buzz_learning_state_select_own
      on public.persona_buzz_learning_state
      for select
      to authenticated
      using (auth.uid() = user_id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'persona_buzz_learning_state'
      and policyname = 'persona_buzz_learning_state_upsert_own'
  ) then
    create policy persona_buzz_learning_state_upsert_own
      on public.persona_buzz_learning_state
      for all
      to authenticated
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'user_persona_affinity'
      and policyname = 'user_persona_affinity_upsert_own'
  ) then
    create policy user_persona_affinity_upsert_own
      on public.user_persona_affinity
      for all
      to authenticated
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'persona_dwell_learning_state'
      and policyname = 'persona_dwell_learning_state_select_own'
  ) then
    create policy persona_dwell_learning_state_select_own
      on public.persona_dwell_learning_state
      for select
      to authenticated
      using (auth.uid() = user_id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'persona_dwell_learning_state'
      and policyname = 'persona_dwell_learning_state_upsert_own'
  ) then
    create policy persona_dwell_learning_state_upsert_own
      on public.persona_dwell_learning_state
      for all
      to authenticated
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'persona_feed_events'
      and policyname = 'persona_feed_events_select_own'
  ) then
    create policy persona_feed_events_select_own
      on public.persona_feed_events
      for select
      to authenticated
      using (auth.uid() = user_id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'persona_feed_events'
      and policyname = 'persona_feed_events_insert_own'
  ) then
    create policy persona_feed_events_insert_own
      on public.persona_feed_events
      for insert
      to authenticated
      with check (auth.uid() = user_id);
  end if;
end $$;
