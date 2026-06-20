-- Authenticated soulmate recommendations for fresh Web projects.
-- The function exposes only candidate user ids, persona keys, and compatibility metadata;
-- profile fields continue to be loaded through the existing RLS-protected Web route.

create or replace function public.recommend_soulmates(
  p_user_id uuid,
  p_limit integer,
  p_offset integer
)
returns table (
  target_user_id uuid,
  target_persona_key text,
  romance_score double precision,
  relation_label text
)
language sql
stable
security definer
set search_path = public
as $$
  with viewer as (
    select up.persona_key, up.score
    from public.user_personas up
    where up.user_id = p_user_id
      and auth.uid() = p_user_id
    order by up.score desc, up.version desc, up.persona_key
    limit 1
  ),
  candidates as (
    select distinct on (up.user_id)
      up.user_id,
      up.persona_key,
      up.score
    from public.user_personas up
    where up.user_id <> p_user_id
    order by up.user_id, up.score desc, up.version desc, up.persona_key
  ),
  scored as (
    select
      c.user_id as target_user_id,
      c.persona_key as target_persona_key,
      least(
        1.0,
        greatest(
          0.0,
          coalesce(pc.score, case when c.persona_key = v.persona_key then 0.78 else 0.56 end) +
          least(0.08, greatest(0.0, coalesce(c.score, 0.0)) * 0.08)
        )
      )::double precision as romance_score,
      coalesce(
        pc.relation_label,
        case
          when c.persona_key = v.persona_key then '似た温度感で話せるペア'
          else '違いを楽しめるペア'
        end
      )::text as relation_label
    from candidates c
    cross join viewer v
    left join lateral (
      select compat.score, compat.relation_label
      from public.persona_compat compat
      where compat.kind = 'romance'
        and (
          (compat.source_key = v.persona_key and compat.target_key = c.persona_key)
          or
          (compat.target_key = v.persona_key and compat.source_key = c.persona_key)
        )
      order by compat.score desc
      limit 1
    ) pc on true
  )
  select
    s.target_user_id,
    s.target_persona_key,
    s.romance_score,
    s.relation_label
  from scored s
  order by s.romance_score desc, s.target_user_id
  limit greatest(1, least(100, coalesce(p_limit, 20)))
  offset greatest(0, coalesce(p_offset, 0));
$$;

revoke all on function public.recommend_soulmates(uuid, integer, integer) from public;
revoke all on function public.recommend_soulmates(uuid, integer, integer) from anon;
grant execute on function public.recommend_soulmates(uuid, integer, integer) to authenticated;
