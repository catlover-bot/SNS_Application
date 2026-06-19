-- Core Web SNS schema.
-- This migration intentionally sorts before saved/bookmark and post-growth migrations
-- that reference public.posts.

create extension if not exists pgcrypto with schema extensions;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  handle text null,
  display_name text null,
  bio text null,
  avatar_url text null,
  is_premium boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles
  add column if not exists handle text,
  add column if not exists display_name text,
  add column if not exists bio text,
  add column if not exists avatar_url text,
  add column if not exists is_premium boolean not null default false,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create unique index if not exists idx_profiles_handle_lower
  on public.profiles (lower(handle))
  where handle is not null and btrim(handle) <> '';

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  author uuid not null references auth.users(id) on delete cascade,
  parent_id uuid null references public.posts(id) on delete cascade,
  text text null,
  body text null,
  score double precision not null default 0,
  media_urls text[] not null default '{}'::text[],
  analysis jsonb not null default '{}'::jsonb,
  arche_key text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.posts
  add column if not exists author uuid references auth.users(id) on delete cascade,
  add column if not exists parent_id uuid references public.posts(id) on delete cascade,
  add column if not exists text text,
  add column if not exists body text,
  add column if not exists score double precision not null default 0,
  add column if not exists media_urls text[] not null default '{}'::text[],
  add column if not exists analysis jsonb not null default '{}'::jsonb,
  add column if not exists arche_key text,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create index if not exists idx_posts_created_at
  on public.posts (created_at desc);
create index if not exists idx_posts_author_created
  on public.posts (author, created_at desc);
create index if not exists idx_posts_parent_created
  on public.posts (parent_id, created_at asc);
create index if not exists idx_posts_arche_key_created
  on public.posts (arche_key, created_at desc);

drop trigger if exists set_posts_updated_at on public.posts;
create trigger set_posts_updated_at
  before update on public.posts
  for each row execute function public.set_updated_at();

create table if not exists public.reactions (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null,
  created_at timestamptz not null default now(),
  constraint reactions_kind_check check (kind in ('like', 'boost', 'save')),
  constraint reactions_unique_user_kind unique (post_id, user_id, kind)
);

create index if not exists idx_reactions_post_kind
  on public.reactions (post_id, kind, created_at desc);
create index if not exists idx_reactions_user_kind
  on public.reactions (user_id, kind, created_at desc);

create table if not exists public.follows (
  follower uuid not null references auth.users(id) on delete cascade,
  followee uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower, followee),
  constraint follows_not_self check (follower <> followee)
);

create index if not exists idx_follows_followee_created
  on public.follows (followee, created_at desc);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  actor_id uuid null references auth.users(id) on delete set null,
  post_id uuid null references public.posts(id) on delete cascade,
  kind text not null default 'notification',
  title text null,
  body text null,
  data jsonb not null default '{}'::jsonb,
  read_at timestamptz null,
  created_at timestamptz not null default now()
);

create index if not exists idx_notifications_user_created
  on public.notifications (user_id, created_at desc);
create index if not exists idx_notifications_user_read_created
  on public.notifications (user_id, read_at, created_at desc);
create index if not exists idx_notifications_actor_created
  on public.notifications (actor_id, created_at desc);

create table if not exists public.truth_votes (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  voter uuid not null references auth.users(id) on delete cascade,
  value smallint not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint truth_votes_value_check check (value in (-1, 1)),
  constraint truth_votes_unique_vote unique (post_id, voter)
);

create index if not exists idx_truth_votes_post_value
  on public.truth_votes (post_id, value);

drop trigger if exists set_truth_votes_updated_at on public.truth_votes;
create trigger set_truth_votes_updated_at
  before update on public.truth_votes
  for each row execute function public.set_updated_at();

create table if not exists public.post_labels (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  label text not null,
  created_at timestamptz not null default now(),
  constraint post_labels_label_check check (label in ('funny', 'insight', 'toxic', 'question', 'sarcasm')),
  constraint post_labels_unique_label unique (post_id, user_id, label)
);

create index if not exists idx_post_labels_post_label
  on public.post_labels (post_id, label);
create index if not exists idx_post_labels_user_created
  on public.post_labels (user_id, created_at desc);

create table if not exists public.post_scores (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  persona_key text not null,
  final_score double precision not null default 0,
  source text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint post_scores_unique_persona unique (post_id, persona_key)
);

create index if not exists idx_post_scores_persona_score
  on public.post_scores (persona_key, final_score desc);
create index if not exists idx_post_scores_post
  on public.post_scores (post_id);

drop trigger if exists set_post_scores_updated_at on public.post_scores;
create trigger set_post_scores_updated_at
  before update on public.post_scores
  for each row execute function public.set_updated_at();

create table if not exists public.ai_post_scores (
  post_id uuid primary key references public.posts(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  truth double precision not null default 50,
  exaggeration double precision not null default 50,
  brag double precision not null default 0,
  joke double precision not null default 0,
  verdict text null,
  reason text null,
  tags text[] not null default '{}'::text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_ai_post_scores_created_by
  on public.ai_post_scores (created_by, updated_at desc);

drop trigger if exists set_ai_post_scores_updated_at on public.ai_post_scores;
create trigger set_ai_post_scores_updated_at
  before update on public.ai_post_scores
  for each row execute function public.set_updated_at();

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists set_conversations_updated_at on public.conversations;
create trigger set_conversations_updated_at
  before update on public.conversations
  for each row execute function public.set_updated_at();

create table if not exists public.conversation_members (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

create index if not exists idx_conversation_members_user
  on public.conversation_members (user_id, created_at desc);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  author uuid null references auth.users(id) on delete set null,
  text text null,
  created_at timestamptz not null default now()
);

create index if not exists idx_messages_conversation_created
  on public.messages (conversation_id, created_at asc);
create index if not exists idx_messages_author_created
  on public.messages (author, created_at desc);

create or replace function public.is_conversation_member(p_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.conversation_members cm
    where cm.conversation_id = p_conversation_id
      and cm.user_id = auth.uid()
  );
$$;

create table if not exists public.persona_defs (
  key text primary key,
  title text not null default '',
  theme text null,
  vibe_tags text[] not null default '{}'::text[],
  talk_style text null,
  blurb text null,
  icon text null,
  relation_style text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists set_persona_defs_updated_at on public.persona_defs;
create trigger set_persona_defs_updated_at
  before update on public.persona_defs
  for each row execute function public.set_updated_at();

create table if not exists public.persona_archetype_defs (
  key text primary key,
  title text not null default '',
  blurb text null,
  image_url text null,
  theme text null,
  category text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_persona_archetype_defs_category_title
  on public.persona_archetype_defs (category, title);

drop trigger if exists set_persona_archetype_defs_updated_at on public.persona_archetype_defs;
create trigger set_persona_archetype_defs_updated_at
  before update on public.persona_archetype_defs
  for each row execute function public.set_updated_at();

create table if not exists public.persona_compat (
  source_key text not null,
  target_key text not null,
  kind text not null default 'friendship',
  score double precision not null default 0,
  relation_label text null,
  mode text not null default 'general',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (source_key, target_key, kind),
  constraint persona_compat_kind_check check (kind in ('friendship', 'romance'))
);

create index if not exists idx_persona_compat_source_kind_score
  on public.persona_compat (source_key, kind, score desc);
create index if not exists idx_persona_compat_target_kind_score
  on public.persona_compat (target_key, kind, score desc);

drop trigger if exists set_persona_compat_updated_at on public.persona_compat;
create trigger set_persona_compat_updated_at
  before update on public.persona_compat
  for each row execute function public.set_updated_at();

create table if not exists public.prompts_of_day (
  date date primary key,
  title text not null,
  body text null,
  created_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists set_prompts_of_day_updated_at on public.prompts_of_day;
create trigger set_prompts_of_day_updated_at
  before update on public.prompts_of_day
  for each row execute function public.set_updated_at();

create table if not exists public.user_personas (
  user_id uuid not null references auth.users(id) on delete cascade,
  persona_key text not null,
  score double precision not null default 0,
  confidence double precision not null default 0,
  updated_at timestamptz not null default now(),
  version bigint not null default extract(epoch from now())::bigint,
  primary key (user_id, persona_key)
);

alter table public.user_personas
  add column if not exists score double precision,
  add column if not exists confidence double precision,
  add column if not exists updated_at timestamptz,
  add column if not exists version bigint;

update public.user_personas
set
  score = coalesce(score, 0),
  confidence = coalesce(confidence, 0),
  updated_at = coalesce(updated_at, now()),
  version = coalesce(version, extract(epoch from now())::bigint)
where score is null
  or confidence is null
  or updated_at is null
  or version is null;

alter table public.user_personas
  alter column score set default 0,
  alter column score set not null,
  alter column confidence set default 0,
  alter column confidence set not null,
  alter column updated_at set default now(),
  alter column updated_at set not null,
  alter column version set default extract(epoch from now())::bigint,
  alter column version set not null;

create index if not exists idx_user_personas_user_score
  on public.user_personas (user_id, score desc, updated_at desc);

alter table public.profiles enable row level security;
alter table public.posts enable row level security;
alter table public.reactions enable row level security;
alter table public.follows enable row level security;
alter table public.notifications enable row level security;
alter table public.truth_votes enable row level security;
alter table public.post_labels enable row level security;
alter table public.post_scores enable row level security;
alter table public.ai_post_scores enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;
alter table public.persona_defs enable row level security;
alter table public.persona_archetype_defs enable row level security;
alter table public.persona_compat enable row level security;
alter table public.prompts_of_day enable row level security;
alter table public.user_personas enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'profiles' and policyname = 'profiles_select_public') then
    create policy profiles_select_public on public.profiles for select to anon, authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'profiles' and policyname = 'profiles_insert_own') then
    create policy profiles_insert_own on public.profiles for insert to authenticated with check (auth.uid() = id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'profiles' and policyname = 'profiles_update_own') then
    create policy profiles_update_own on public.profiles for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'profiles' and policyname = 'profiles_delete_own') then
    create policy profiles_delete_own on public.profiles for delete to authenticated using (auth.uid() = id);
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'posts' and policyname = 'posts_select_public') then
    create policy posts_select_public on public.posts for select to anon, authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'posts' and policyname = 'posts_insert_own') then
    create policy posts_insert_own on public.posts for insert to authenticated with check (auth.uid() = author);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'posts' and policyname = 'posts_update_own') then
    create policy posts_update_own on public.posts for update to authenticated using (auth.uid() = author) with check (auth.uid() = author);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'posts' and policyname = 'posts_delete_own') then
    create policy posts_delete_own on public.posts for delete to authenticated using (auth.uid() = author);
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'reactions' and policyname = 'reactions_select_public') then
    create policy reactions_select_public on public.reactions for select to anon, authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'reactions' and policyname = 'reactions_insert_own') then
    create policy reactions_insert_own on public.reactions for insert to authenticated with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'reactions' and policyname = 'reactions_delete_own') then
    create policy reactions_delete_own on public.reactions for delete to authenticated using (auth.uid() = user_id);
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'follows' and policyname = 'follows_select_public') then
    create policy follows_select_public on public.follows for select to anon, authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'follows' and policyname = 'follows_insert_own') then
    create policy follows_insert_own on public.follows for insert to authenticated with check (auth.uid() = follower);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'follows' and policyname = 'follows_delete_own') then
    create policy follows_delete_own on public.follows for delete to authenticated using (auth.uid() = follower);
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'notifications' and policyname = 'notifications_select_own') then
    create policy notifications_select_own on public.notifications for select to authenticated using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'notifications' and policyname = 'notifications_update_own') then
    create policy notifications_update_own on public.notifications for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'notifications' and policyname = 'notifications_insert_related') then
    create policy notifications_insert_related on public.notifications for insert to authenticated with check (auth.uid() = user_id or auth.uid() = actor_id);
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'truth_votes' and policyname = 'truth_votes_select_public') then
    create policy truth_votes_select_public on public.truth_votes for select to anon, authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'truth_votes' and policyname = 'truth_votes_insert_own') then
    create policy truth_votes_insert_own on public.truth_votes for insert to authenticated with check (auth.uid() = voter);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'truth_votes' and policyname = 'truth_votes_update_own') then
    create policy truth_votes_update_own on public.truth_votes for update to authenticated using (auth.uid() = voter) with check (auth.uid() = voter);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'truth_votes' and policyname = 'truth_votes_delete_own') then
    create policy truth_votes_delete_own on public.truth_votes for delete to authenticated using (auth.uid() = voter);
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'post_labels' and policyname = 'post_labels_select_public') then
    create policy post_labels_select_public on public.post_labels for select to anon, authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'post_labels' and policyname = 'post_labels_insert_own') then
    create policy post_labels_insert_own on public.post_labels for insert to authenticated with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'post_labels' and policyname = 'post_labels_delete_own') then
    create policy post_labels_delete_own on public.post_labels for delete to authenticated using (auth.uid() = user_id);
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'post_scores' and policyname = 'post_scores_select_public') then
    create policy post_scores_select_public on public.post_scores for select to anon, authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'ai_post_scores' and policyname = 'ai_post_scores_select_public') then
    create policy ai_post_scores_select_public on public.ai_post_scores for select to anon, authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'ai_post_scores' and policyname = 'ai_post_scores_insert_own') then
    create policy ai_post_scores_insert_own on public.ai_post_scores for insert to authenticated with check (auth.uid() = created_by);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'ai_post_scores' and policyname = 'ai_post_scores_update_own') then
    create policy ai_post_scores_update_own on public.ai_post_scores for update to authenticated using (auth.uid() = created_by) with check (auth.uid() = created_by);
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'conversations' and policyname = 'conversations_select_member') then
    create policy conversations_select_member on public.conversations for select to authenticated using (public.is_conversation_member(id));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'conversations' and policyname = 'conversations_insert_authenticated') then
    create policy conversations_insert_authenticated on public.conversations for insert to authenticated with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'conversation_members' and policyname = 'conversation_members_select_own') then
    create policy conversation_members_select_own on public.conversation_members for select to authenticated using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'conversation_members' and policyname = 'conversation_members_insert_own') then
    create policy conversation_members_insert_own on public.conversation_members for insert to authenticated with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'messages' and policyname = 'messages_select_member') then
    create policy messages_select_member on public.messages for select to authenticated using (public.is_conversation_member(conversation_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'messages' and policyname = 'messages_insert_member') then
    create policy messages_insert_member on public.messages for insert to authenticated with check (
      auth.uid() = author and public.is_conversation_member(conversation_id)
    );
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'persona_defs' and policyname = 'persona_defs_select_public') then
    create policy persona_defs_select_public on public.persona_defs for select to anon, authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'persona_archetype_defs' and policyname = 'persona_archetype_defs_select_public') then
    create policy persona_archetype_defs_select_public on public.persona_archetype_defs for select to anon, authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'persona_compat' and policyname = 'persona_compat_select_public') then
    create policy persona_compat_select_public on public.persona_compat for select to anon, authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'prompts_of_day' and policyname = 'prompts_of_day_select_public') then
    create policy prompts_of_day_select_public on public.prompts_of_day for select to anon, authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'prompts_of_day' and policyname = 'prompts_of_day_insert_authenticated') then
    create policy prompts_of_day_insert_authenticated on public.prompts_of_day for insert to authenticated with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'prompts_of_day' and policyname = 'prompts_of_day_update_authenticated') then
    create policy prompts_of_day_update_authenticated on public.prompts_of_day for update to authenticated using (true) with check (true);
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'user_personas' and policyname = 'user_personas_select_own') then
    create policy user_personas_select_own on public.user_personas for select to authenticated using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'user_personas' and policyname = 'user_personas_modify_own') then
    create policy user_personas_modify_own on public.user_personas for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
end $$;

create or replace view public.v_posts_enriched
with (security_invoker = true)
as
select
  p.id,
  p.created_at,
  p.updated_at,
  p.author,
  p.parent_id,
  p.text,
  p.body,
  p.score,
  p.media_urls,
  p.analysis,
  p.arche_key,
  pr.handle as author_handle,
  pr.display_name as author_display,
  pr.avatar_url as author_avatar,
  coalesce(rc.reply_count, 0)::integer as reply_count,
  coalesce(lc.like_count, 0)::integer as like_count,
  coalesce(bc.boost_count, 0)::integer as boost_count,
  coalesce(sc.save_count, 0)::integer as save_count
from public.posts p
left join public.profiles pr on pr.id = p.author
left join (
  select parent_id, count(*) as reply_count
  from public.posts
  where parent_id is not null
  group by parent_id
) rc on rc.parent_id = p.id
left join (
  select post_id, count(*) as like_count
  from public.reactions
  where kind = 'like'
  group by post_id
) lc on lc.post_id = p.id
left join (
  select post_id, count(*) as boost_count
  from public.reactions
  where kind = 'boost'
  group by post_id
) bc on bc.post_id = p.id
left join (
  select post_id, count(*) as save_count
  from public.reactions
  where kind = 'save'
  group by post_id
) sc on sc.post_id = p.id;

create or replace view public.feed_latest
with (security_invoker = true)
as
select *
from public.v_posts_enriched
where parent_id is null
order by created_at desc;

create or replace view public.feed_following
with (security_invoker = true)
as
select v.*
from public.v_posts_enriched v
join public.follows f on f.followee = v.author
where f.follower = auth.uid()
  and v.parent_id is null
order by v.created_at desc;

create or replace view public.v_user_persona
with (security_invoker = true)
as
select
  up.user_id,
  up.persona_key,
  coalesce(pd.title, pa.title, up.persona_key) as title,
  coalesce(pd.icon, pa.image_url) as icon,
  up.score,
  up.confidence,
  up.updated_at,
  up.version
from public.user_personas up
left join public.persona_defs pd on pd.key = up.persona_key
left join public.persona_archetype_defs pa on pa.key = up.persona_key;

create or replace view public.v_profile_ai_summary
with (security_invoker = true)
as
select
  p.author as user_id,
  count(a.post_id)::integer as analyzed_posts,
  avg(a.truth) as truth_avg,
  avg(a.exaggeration) as exaggeration_avg,
  avg(a.brag) as brag_avg,
  avg(a.joke) as joke_avg
from public.posts p
join public.ai_post_scores a on a.post_id = p.id
group by p.author;

create or replace view public.persona_compat_norm
with (security_invoker = true)
as
select
  source_key as a,
  target_key as b,
  score as weight,
  kind,
  mode
from public.persona_compat
union all
select
  target_key as a,
  source_key as b,
  score as weight,
  kind,
  mode
from public.persona_compat
where source_key <> target_key;

create or replace function public.create_reply(parent uuid, body text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_parent uuid := $1;
  v_parent_author uuid;
  v_body text := nullif(btrim(coalesce($2, '')), '');
  v_reply_id uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  if v_parent is null or v_body is null then
    raise exception 'invalid_reply';
  end if;

  select p.author into v_parent_author
  from public.posts p
  where p.id = v_parent;

  if v_parent_author is null then
    raise exception 'parent_post_not_found';
  end if;

  insert into public.posts (author, parent_id, text, body, score, analysis)
  values (v_uid, v_parent, v_body, v_body, 0, '{}'::jsonb)
  returning id into v_reply_id;

  if v_parent_author <> v_uid then
    insert into public.notifications (user_id, actor_id, post_id, kind, title, body)
    values (
      v_parent_author,
      v_uid,
      v_parent,
      'reply',
      '返信が届きました',
      left(v_body, 160)
    );
  end if;

  return v_reply_id;
end;
$$;

create or replace function public.toggle_follow(target uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_target uuid := $1;
  v_exists boolean;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  if v_target is null or v_target = v_uid then
    raise exception 'invalid_target';
  end if;
  if not exists (select 1 from auth.users u where u.id = v_target) then
    raise exception 'target_not_found';
  end if;

  select exists (
    select 1 from public.follows f
    where f.follower = v_uid and f.followee = v_target
  ) into v_exists;

  if v_exists then
    delete from public.follows f
    where f.follower = v_uid and f.followee = v_target;
    return false;
  end if;

  insert into public.follows (follower, followee)
  values (v_uid, v_target)
  on conflict do nothing;

  insert into public.notifications (user_id, actor_id, kind, title, body)
  values (v_target, v_uid, 'follow', 'フォローされました', '新しいフォロワーが増えました。')
  on conflict do nothing;

  return true;
end;
$$;

create or replace function public.upsert_truth_vote(post_id uuid, value integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_post_id uuid := $1;
  v_value integer := coalesce($2, 0);
  v_true integer := 0;
  v_false integer := 0;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  if v_post_id is null then
    raise exception 'post_id_required';
  end if;
  if v_value not in (-1, 0, 1) then
    raise exception 'invalid_vote_value';
  end if;
  if not exists (select 1 from public.posts p where p.id = v_post_id) then
    raise exception 'post_not_found';
  end if;

  if v_value = 0 then
    delete from public.truth_votes tv
    where tv.post_id = v_post_id
      and tv.voter = v_uid;
  else
    insert into public.truth_votes (post_id, voter, value)
    values (v_post_id, v_uid, v_value)
    on conflict (post_id, voter)
    do update set value = excluded.value, updated_at = now();
  end if;

  select count(*)::integer into v_true
  from public.truth_votes tv
  where tv.post_id = v_post_id and tv.value = 1;

  select count(*)::integer into v_false
  from public.truth_votes tv
  where tv.post_id = v_post_id and tv.value = -1;

  return jsonb_build_object('true', v_true, 'false', v_false, 'my_vote', v_value);
end;
$$;

create or replace function public.assign_top_persona(
  p_user uuid,
  p_limit integer default 12,
  p_post_limit integer default 600
)
returns table (
  persona_key text,
  score double precision,
  confidence double precision,
  count integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_now timestamptz := now();
  v_version bigint := extract(epoch from now())::bigint;
begin
  if v_uid is null or p_user is null or v_uid <> p_user then
    raise exception 'not_authorized';
  end if;

  delete from public.user_personas where user_id = p_user;

  return query
  with recent_posts as (
    select p.id, p.created_at, p.analysis
    from public.posts p
    where p.author = p_user
    order by p.created_at desc
    limit greatest(50, least(2000, coalesce(p_post_limit, 600)))
  ),
  score_signal as (
    select
      rp.id as post_id,
      s.persona_key,
      (0.75 + s.score01 * 0.65) *
      greatest(
        0.35,
        least(
          1.0,
          power(0.5, extract(epoch from (v_now - coalesce(rp.created_at, v_now))) / (86400.0 * 14.0))
        )
      ) as w
    from recent_posts rp
    join lateral (
      select
        ps.persona_key,
        case
          when ps.final_score is null then 0.0
          when ps.final_score <= 1 then greatest(0.0, least(1.0, ps.final_score))
          when ps.final_score <= 100 then greatest(0.0, least(1.0, ps.final_score / 100.0))
          else 1.0
        end as score01
      from public.post_scores ps
      where ps.post_id = rp.id
        and ps.persona_key is not null
        and btrim(ps.persona_key) <> ''
      order by ps.final_score desc nulls last
      limit 1
    ) s on true
  ),
  analysis_signal as (
    select
      rp.id as post_id,
      nullif(
        btrim(
          coalesce(
            rp.analysis::jsonb -> 'persona' ->> 'selected',
            rp.analysis::jsonb -> 'persona' -> 'candidates' -> 0 ->> 'key'
          )
        ),
        ''
      ) as persona_key,
      0.95 *
      greatest(
        0.35,
        least(
          1.0,
          power(0.5, extract(epoch from (v_now - coalesce(rp.created_at, v_now))) / (86400.0 * 14.0))
        )
      ) as w
    from recent_posts rp
    where not exists (
      select 1 from public.post_scores ps where ps.post_id = rp.id
    )
  ),
  signals as (
    select ss.persona_key, ss.w from score_signal ss
    union all
    select ans.persona_key, ans.w from analysis_signal ans where ans.persona_key is not null
  ),
  agg as (
    select
      s.persona_key,
      sum(s.w) as total,
      count(*) as cnt
    from signals s
    where s.persona_key is not null and btrim(s.persona_key) <> ''
    group by s.persona_key
  ),
  normalized as (
    select
      a.persona_key,
      least(1.0, greatest(0.0, a.total / nullif(max(a.total) over (), 0))) as score,
      least(
        1.0,
        greatest(
          0.08,
          least(1.0, greatest(0.0, (a.total / nullif(sum(a.total) over (), 0)) * 3.2)) * 0.6 +
          least(1.0, greatest(0.0, ln(a.cnt + 1) / ln(11.0))) * 0.4
        )
      ) as confidence,
      a.cnt
    from agg a
  ),
  inserted as (
    insert into public.user_personas (
      user_id,
      persona_key,
      score,
      confidence,
      updated_at,
      version
    )
    select
      p_user,
      n.persona_key,
      n.score,
      n.confidence,
      v_now,
      v_version
    from normalized n
    order by n.score desc, n.confidence desc
    limit greatest(1, least(24, coalesce(p_limit, 12)))
    returning
      user_personas.persona_key,
      user_personas.score,
      user_personas.confidence
  )
  select
    i.persona_key,
    i.score,
    i.confidence,
    coalesce(n.cnt, 0)::integer as count
  from inserted i
  left join normalized n on n.persona_key = i.persona_key
  order by i.score desc, i.confidence desc;
end;
$$;

grant usage on schema public to anon, authenticated;

grant select on public.profiles to anon, authenticated;
grant select on public.posts to anon, authenticated;
grant select on public.reactions to anon, authenticated;
grant select on public.follows to anon, authenticated;
grant select on public.truth_votes to anon, authenticated;
grant select on public.post_labels to anon, authenticated;
grant select on public.post_scores to anon, authenticated;
grant select on public.ai_post_scores to anon, authenticated;
grant select on public.persona_defs to anon, authenticated;
grant select on public.persona_archetype_defs to anon, authenticated;
grant select on public.persona_compat to anon, authenticated;
grant select on public.prompts_of_day to anon, authenticated;
grant select on public.v_posts_enriched to anon, authenticated;
grant select on public.feed_latest to anon, authenticated;
grant select on public.feed_following to authenticated;
grant select on public.v_user_persona to authenticated;
grant select on public.v_profile_ai_summary to anon, authenticated;
grant select on public.persona_compat_norm to anon, authenticated;

grant insert, update, delete on public.profiles to authenticated;
grant insert, update, delete on public.posts to authenticated;
grant insert, delete on public.reactions to authenticated;
grant insert, delete on public.follows to authenticated;
grant insert, update, delete on public.truth_votes to authenticated;
grant insert, delete on public.post_labels to authenticated;
grant insert, update on public.ai_post_scores to authenticated;
grant select, insert, update on public.notifications to authenticated;
grant select, insert on public.conversations to authenticated;
grant select, insert on public.conversation_members to authenticated;
grant select, insert on public.messages to authenticated;
grant select, insert, update on public.prompts_of_day to authenticated;
grant select, insert, update, delete on public.user_personas to authenticated;

grant execute on function public.create_reply(uuid, text) to authenticated;
grant execute on function public.toggle_follow(uuid) to authenticated;
grant execute on function public.upsert_truth_vote(uuid, integer) to authenticated;
grant execute on function public.assign_top_persona(uuid, integer, integer) to authenticated;
grant execute on function public.is_conversation_member(uuid) to authenticated;
