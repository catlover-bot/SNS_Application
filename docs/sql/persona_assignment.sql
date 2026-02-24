-- Persona assignment baseline (user_personas + assign_top_persona RPC)
-- Run manually on Supabase SQL editor.

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
where
  score is null
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

alter table public.user_personas enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'user_personas'
      and policyname = 'user_personas_select_own'
  ) then
    create policy user_personas_select_own
      on public.user_personas
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
      and tablename = 'user_personas'
      and policyname = 'user_personas_modify_own'
  ) then
    create policy user_personas_modify_own
      on public.user_personas
      for all
      to authenticated
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;
end $$;

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
  v_now timestamptz := now();
  v_version bigint := extract(epoch from now())::bigint;
begin
  if p_user is null then
    raise exception 'p_user is required';
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
          power(
            0.5,
            extract(epoch from (v_now - coalesce(rp.created_at, v_now))) / (86400.0 * 14.0)
          )
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
          power(
            0.5,
            extract(epoch from (v_now - coalesce(rp.created_at, v_now))) / (86400.0 * 14.0)
          )
        )
      ) as w
    from recent_posts rp
    where not exists (
      select 1
      from public.post_scores ps
      where ps.post_id = rp.id
    )
  ),
  signals as (
    select persona_key, w from score_signal
    union all
    select persona_key, w from analysis_signal where persona_key is not null
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
    returning persona_key, score, confidence
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

grant execute on function public.assign_top_persona(uuid, integer, integer) to authenticated;
