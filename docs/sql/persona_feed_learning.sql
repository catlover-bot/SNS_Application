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
