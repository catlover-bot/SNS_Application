-- Buddy pair online-learning state for persona feed ranking

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

create index if not exists idx_persona_buddy_learning_user_base_updated
  on public.user_persona_buddy_learning_state (user_id, base_persona_key, updated_at desc);

create index if not exists idx_persona_buddy_learning_user_base_pair
  on public.user_persona_buddy_learning_state (user_id, base_persona_key, buddy_persona_key);

alter table public.user_persona_buddy_learning_state enable row level security;

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
