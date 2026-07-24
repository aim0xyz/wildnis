create table if not exists public.game_saves (
  user_id uuid primary key references auth.users(id) on delete cascade,
  save_data jsonb not null default '{}'::jsonb,
  save_version integer not null default 1,
  updated_at timestamptz not null default now()
);

alter table public.game_saves enable row level security;

drop policy if exists "Players manage their own save" on public.game_saves;
create policy "Players manage their own save"
on public.game_saves
for all
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create or replace function public.set_game_save_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_game_save_updated_at on public.game_saves;
create trigger set_game_save_updated_at
before update on public.game_saves
for each row execute function public.set_game_save_updated_at();

grant select,insert,update,delete on table public.game_saves to authenticated;
