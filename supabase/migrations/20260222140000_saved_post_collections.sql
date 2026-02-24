-- Saved posts / collections (bookmark) for stronger revisit loops

create table if not exists public.user_saved_post_collections (
  user_id uuid not null references auth.users(id) on delete cascade,
  post_id uuid not null references public.posts(id) on delete cascade,
  collection_key text not null default 'saved',
  collection_label text not null default '保存',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, post_id)
);

create index if not exists idx_user_saved_post_collections_user_collection
  on public.user_saved_post_collections (user_id, collection_key, updated_at desc);

create index if not exists idx_user_saved_post_collections_user_updated
  on public.user_saved_post_collections (user_id, updated_at desc);

alter table public.user_saved_post_collections enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'user_saved_post_collections'
      and policyname = 'user_saved_post_collections_select_own'
  ) then
    create policy user_saved_post_collections_select_own
      on public.user_saved_post_collections
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
      and tablename = 'user_saved_post_collections'
      and policyname = 'user_saved_post_collections_upsert_own'
  ) then
    create policy user_saved_post_collections_upsert_own
      on public.user_saved_post_collections
      for all
      to authenticated
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;
end $$;

