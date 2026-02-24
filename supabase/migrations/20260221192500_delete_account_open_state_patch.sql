-- Keep delete_my_account() aligned with user_post_open_state cleanup.

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

  if to_regclass('public.user_post_open_state') is not null then
    delete from public.user_post_open_state where user_id = v_uid;
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
