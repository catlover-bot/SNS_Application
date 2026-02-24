-- App Store safety baseline
-- Run in Supabase SQL editor.
-- Provides:
-- 1) user_reports / user_blocks tables
-- 2) RLS policies for own report/block actions
-- 3) delete_my_account() RPC callable from app

create table if not exists public.user_blocks (
  blocker_id uuid not null references auth.users(id) on delete cascade,
  blocked_id uuid not null references auth.users(id) on delete cascade,
  reason text null,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint user_blocks_not_self check (blocker_id <> blocked_id)
);

create table if not exists public.user_reports (
  id bigserial primary key,
  reporter_id uuid not null references auth.users(id) on delete cascade,
  target_user_id uuid null references auth.users(id) on delete set null,
  post_id uuid null,
  reason text not null,
  detail text null,
  status text not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_user_blocks_blocker_created
  on public.user_blocks (blocker_id, created_at desc);

create index if not exists idx_user_reports_reporter_created
  on public.user_reports (reporter_id, created_at desc);

create index if not exists idx_user_reports_target_created
  on public.user_reports (target_user_id, created_at desc);

alter table public.user_blocks enable row level security;
alter table public.user_reports enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'user_blocks'
      and policyname = 'user_blocks_select_own'
  ) then
    create policy user_blocks_select_own
      on public.user_blocks
      for select
      to authenticated
      using (auth.uid() = blocker_id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'user_blocks'
      and policyname = 'user_blocks_insert_own'
  ) then
    create policy user_blocks_insert_own
      on public.user_blocks
      for insert
      to authenticated
      with check (auth.uid() = blocker_id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'user_blocks'
      and policyname = 'user_blocks_delete_own'
  ) then
    create policy user_blocks_delete_own
      on public.user_blocks
      for delete
      to authenticated
      using (auth.uid() = blocker_id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'user_reports'
      and policyname = 'user_reports_select_own'
  ) then
    create policy user_reports_select_own
      on public.user_reports
      for select
      to authenticated
      using (auth.uid() = reporter_id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'user_reports'
      and policyname = 'user_reports_insert_own'
  ) then
    create policy user_reports_insert_own
      on public.user_reports
      for insert
      to authenticated
      with check (auth.uid() = reporter_id);
  end if;
end $$;

create or replace function public.delete_my_account()
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if to_regclass('public.user_reports') is not null then
    delete from public.user_reports
    where reporter_id = v_uid or target_user_id = v_uid;
  end if;

  if to_regclass('public.user_blocks') is not null then
    delete from public.user_blocks
    where blocker_id = v_uid or blocked_id = v_uid;
  end if;

  if to_regclass('public.user_persona_affinity') is not null then
    delete from public.user_persona_affinity where user_id = v_uid;
  end if;

  if to_regclass('public.persona_feed_events') is not null then
    delete from public.persona_feed_events where user_id = v_uid;
  end if;

  if to_regclass('public.persona_dwell_learning_state') is not null then
    delete from public.persona_dwell_learning_state where user_id = v_uid;
  end if;

  if to_regclass('public.persona_buzz_learning_state') is not null then
    delete from public.persona_buzz_learning_state where user_id = v_uid;
  end if;

  if to_regclass('public.user_personas') is not null then
    delete from public.user_personas where user_id = v_uid;
  end if;

  if to_regclass('public.follows') is not null then
    delete from public.follows where follower = v_uid or followee = v_uid;
  end if;

  if to_regclass('public.reactions') is not null then
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'reactions' and column_name = 'user_id'
    ) then
      delete from public.reactions where user_id = v_uid;
    end if;
  end if;

  if to_regclass('public.notifications') is not null then
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'notifications' and column_name = 'actor_id'
    ) then
      delete from public.notifications where actor_id = v_uid;
    end if;
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'notifications' and column_name = 'user_id'
    ) then
      delete from public.notifications where user_id = v_uid;
    end if;
  end if;

  if to_regclass('public.posts') is not null then
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'posts' and column_name = 'parent_id'
    ) and exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'posts' and column_name = 'author'
    ) then
      delete from public.posts
      where parent_id in (
        select id from public.posts where author = v_uid
      );
    end if;

    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'posts' and column_name = 'author'
    ) then
      delete from public.posts where author = v_uid;
    end if;
  end if;

  if to_regclass('public.profiles') is not null then
    delete from public.profiles where id = v_uid;
  end if;

  delete from auth.users where id = v_uid;

  return jsonb_build_object('ok', true, 'user_id', v_uid);
end;
$$;

grant execute on function public.delete_my_account() to authenticated;
