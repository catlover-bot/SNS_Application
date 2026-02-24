-- Persona feed growth loops: mission persistence, rewrite learning, and mode A/B telemetry

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

alter table public.user_persona_buddy_mission_progress enable row level security;
alter table public.user_persona_rewrite_learning_state enable row level security;
alter table public.user_persona_feed_ab_assignments enable row level security;
alter table public.persona_feed_mode_ab_events enable row level security;

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
