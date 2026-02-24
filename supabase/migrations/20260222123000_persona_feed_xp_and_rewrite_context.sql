-- Persona feed mission XP/level and rewrite context learning (time bucket / weekday)

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

alter table public.user_persona_buddy_mission_xp_state enable row level security;
alter table public.user_persona_rewrite_context_learning_state enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
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
    select 1 from pg_policies
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
    select 1 from pg_policies
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
    select 1 from pg_policies
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
