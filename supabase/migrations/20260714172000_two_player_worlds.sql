create table if not exists public.multiplayer_worlds (
  id uuid primary key default gen_random_uuid(),
  room_code text not null unique check (room_code ~ '^[A-Z0-9]{6}$'),
  host_id uuid not null references auth.users(id) on delete cascade,
  world_name text not null default 'Expedition',
  world_state jsonb not null default '{}'::jsonb,
  max_players smallint not null default 2 check (max_players = 2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.multiplayer_world_members (
  world_id uuid not null references public.multiplayer_worlds(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 24),
  joined_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  primary key (world_id, user_id)
);

create index if not exists multiplayer_world_members_user_idx
  on public.multiplayer_world_members(user_id);

alter table public.multiplayer_worlds enable row level security;
alter table public.multiplayer_world_members enable row level security;

create or replace function public.is_multiplayer_world_member(check_world_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.multiplayer_world_members
    where world_id = check_world_id and user_id = (select auth.uid())
  );
$$;

revoke all on function public.is_multiplayer_world_member(uuid) from public;
grant execute on function public.is_multiplayer_world_member(uuid) to authenticated;

drop policy if exists "Members can read their world" on public.multiplayer_worlds;
create policy "Members can read their world"
on public.multiplayer_worlds for select to authenticated
using ((select public.is_multiplayer_world_member(id)));

drop policy if exists "Members can update shared world state" on public.multiplayer_worlds;
create policy "Members can update shared world state"
on public.multiplayer_worlds for update to authenticated
using ((select public.is_multiplayer_world_member(id)))
with check ((select public.is_multiplayer_world_member(id)));

drop policy if exists "Members can read room roster" on public.multiplayer_world_members;
create policy "Members can read room roster"
on public.multiplayer_world_members for select to authenticated
using ((select public.is_multiplayer_world_member(world_id)));

drop policy if exists "Members can update own roster row" on public.multiplayer_world_members;
create policy "Members can update own roster row"
on public.multiplayer_world_members for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

grant select, update on public.multiplayer_worlds to authenticated;
grant select, update on public.multiplayer_world_members to authenticated;

create or replace function public.create_multiplayer_world(
  player_name text,
  initial_world_state jsonb default '{}'::jsonb
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
  insert into public.multiplayer_world_members(world_id, user_id, display_name)
  values (new_world.id, (select auth.uid()), clean_name);
  return jsonb_build_object(
    'id', new_world.id, 'room_code', new_world.room_code,
    'host_id', new_world.host_id, 'world_state', new_world.world_state,
    'display_name', clean_name
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
  clean_name text := left(trim(player_name), 24);
  member_count integer;
begin
  if (select auth.uid()) is null then raise exception 'authentication required'; end if;
  if clean_name = '' then clean_name := 'Survivor'; end if;
  select * into selected_world from public.multiplayer_worlds
  where room_code = upper(trim(player_code)) for update;
  if selected_world.id is null then raise exception 'room not found'; end if;
  if not exists (
    select 1 from public.multiplayer_world_members
    where world_id = selected_world.id and user_id = (select auth.uid())
  ) then
    select count(*) into member_count from public.multiplayer_world_members
    where world_id = selected_world.id;
    if member_count >= selected_world.max_players then raise exception 'room is full'; end if;
    insert into public.multiplayer_world_members(world_id, user_id, display_name)
    values (selected_world.id, (select auth.uid()), clean_name);
  else
    update public.multiplayer_world_members set display_name = clean_name, last_seen_at = now()
    where world_id = selected_world.id and user_id = (select auth.uid());
  end if;
  return jsonb_build_object(
    'id', selected_world.id, 'room_code', selected_world.room_code,
    'host_id', selected_world.host_id, 'world_state', selected_world.world_state,
    'display_name', clean_name
  );
end;
$$;

revoke all on function public.create_multiplayer_world(text, jsonb) from public;
revoke all on function public.join_multiplayer_world(text, text) from public;
grant execute on function public.create_multiplayer_world(text, jsonb) to authenticated;
grant execute on function public.join_multiplayer_world(text, text) to authenticated;

drop trigger if exists set_multiplayer_world_updated_at on public.multiplayer_worlds;
create trigger set_multiplayer_world_updated_at
before update on public.multiplayer_worlds
for each row execute function public.set_game_save_updated_at();
