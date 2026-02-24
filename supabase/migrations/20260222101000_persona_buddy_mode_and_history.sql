-- Persona feed buddy learning mode + history (for UX controls and growth loops)

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

alter table public.user_persona_feed_preferences enable row level security;
alter table public.user_persona_buddy_learning_history enable row level security;

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
