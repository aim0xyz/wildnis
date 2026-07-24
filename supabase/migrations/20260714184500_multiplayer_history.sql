alter table public.multiplayer_world_members
  add column if not exists player_state jsonb not null default '{}'::jsonb;

drop function if exists public.create_multiplayer_world(text, jsonb);

create or replace function public.create_multiplayer_world(
  player_name text,
  initial_world_state jsonb default '{}'::jsonb,
  initial_player_state jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_world public.multiplayer_worlds;
  clean_name text := left(trim(player_name), 24);
  candidate text;
begin
  if (select auth.uid()) is null then raise exception 'authentication required'; end if;
  if clean_name = '' then clean_name := 'Survivor'; end if;
  loop
    candidate := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
    exit when not exists (select 1 from public.multiplayer_worlds where room_code = candidate);
  end loop;
  insert into public.multiplayer_worlds(room_code, host_id, world_state)
  values (candidate, (select auth.uid()), coalesce(initial_world_state, '{}'::jsonb))
  returning * into new_world;
  insert into public.multiplayer_world_members(world_id, user_id, display_name, player_state)
  values (new_world.id, (select auth.uid()), clean_name, coalesce(initial_player_state, '{}'::jsonb));
  return jsonb_build_object(
    'id', new_world.id, 'room_code', new_world.room_code,
    'host_id', new_world.host_id, 'world_name', new_world.world_name,
    'world_state', new_world.world_state, 'player_state', coalesce(initial_player_state, '{}'::jsonb),
    'display_name', clean_name, 'is_new_member', true
  );
end;
$$;

create or replace function public.join_multiplayer_world(player_code text, player_name text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_world public.multiplayer_worlds;
  selected_member public.multiplayer_world_members;
  clean_name text := left(trim(player_name), 24);
  member_count integer;
  is_new boolean := false;
begin
  if (select auth.uid()) is null then raise exception 'authentication required'; end if;
  if clean_name = '' then clean_name := 'Survivor'; end if;
  select * into selected_world from public.multiplayer_worlds
  where room_code = upper(trim(player_code)) for update;
  if selected_world.id is null then raise exception 'room not found'; end if;
  select * into selected_member from public.multiplayer_world_members
  where world_id = selected_world.id and user_id = (select auth.uid());
  if selected_member.user_id is null then
    select count(*) into member_count from public.multiplayer_world_members
    where world_id = selected_world.id;
    if member_count >= selected_world.max_players then raise exception 'room is full'; end if;
    insert into public.multiplayer_world_members(world_id, user_id, display_name)
    values (selected_world.id, (select auth.uid()), clean_name)
    returning * into selected_member;
    is_new := true;
  else
    update public.multiplayer_world_members set display_name = clean_name, last_seen_at = now()
    where world_id = selected_world.id and user_id = (select auth.uid())
    returning * into selected_member;
  end if;
  return jsonb_build_object(
    'id', selected_world.id, 'room_code', selected_world.room_code,
    'host_id', selected_world.host_id, 'world_name', selected_world.world_name,
    'world_state', selected_world.world_state, 'player_state', selected_member.player_state,
    'display_name', clean_name, 'is_new_member', is_new
  );
end;
$$;

create or replace function public.resume_multiplayer_world(world_uuid uuid, player_name text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_world public.multiplayer_worlds;
  selected_member public.multiplayer_world_members;
  clean_name text := left(trim(player_name), 24);
begin
  if (select auth.uid()) is null then raise exception 'authentication required'; end if;
  if clean_name = '' then clean_name := 'Survivor'; end if;
  select * into selected_world from public.multiplayer_worlds where id = world_uuid;
  if selected_world.id is null then raise exception 'room not found'; end if;
  update public.multiplayer_world_members set display_name = clean_name, last_seen_at = now()
  where world_id = selected_world.id and user_id = (select auth.uid())
  returning * into selected_member;
  if selected_member.user_id is null then raise exception 'not a room member'; end if;
  return jsonb_build_object(
    'id', selected_world.id, 'room_code', selected_world.room_code,
    'host_id', selected_world.host_id, 'world_name', selected_world.world_name,
    'world_state', selected_world.world_state, 'player_state', selected_member.player_state,
    'display_name', clean_name, 'is_new_member', false
  );
end;
$$;

create or replace function public.list_multiplayer_world_history()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', w.id,
      'room_code', w.room_code,
      'world_name', w.world_name,
      'host_id', w.host_id,
      'created_at', w.created_at,
      'updated_at', w.updated_at,
      'day', coalesce((w.world_state ->> 'day')::integer, 1),
      'building_count', case
        when jsonb_typeof(w.world_state -> 'buildings') = 'array'
          then jsonb_array_length(w.world_state -> 'buildings')
        else 0
      end,
      'member_count', (select count(*) from public.multiplayer_world_members all_members where all_members.world_id = w.id),
      'partner_name', (select partner.display_name from public.multiplayer_world_members partner
        where partner.world_id = w.id and partner.user_id <> (select auth.uid()) limit 1)
    ) order by w.updated_at desc
  ), '[]'::jsonb)
  from public.multiplayer_worlds w
  join public.multiplayer_world_members own_member
    on own_member.world_id = w.id and own_member.user_id = (select auth.uid());
$$;

revoke all on function public.create_multiplayer_world(text, jsonb, jsonb) from public;
revoke all on function public.join_multiplayer_world(text, text) from public;
revoke all on function public.resume_multiplayer_world(uuid, text) from public;
revoke all on function public.list_multiplayer_world_history() from public;
grant execute on function public.create_multiplayer_world(text, jsonb, jsonb) to authenticated;
grant execute on function public.join_multiplayer_world(text, text) to authenticated;
grant execute on function public.resume_multiplayer_world(uuid, text) to authenticated;
grant execute on function public.list_multiplayer_world_history() to authenticated;
