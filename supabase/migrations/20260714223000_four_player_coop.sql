-- Bestehende und neue Koop-Welten erlauben insgesamt vier Mitglieder.
-- join_multiplayer_world sperrt die Weltzeile bereits per FOR UPDATE und
-- prüft member_count gegen max_players, daher bleibt auch paralleles Joinen
-- zuverlässig auf vier Plätze begrenzt.
alter table public.multiplayer_worlds
  drop constraint if exists multiplayer_worlds_max_players_check;

alter table public.multiplayer_worlds
  alter column max_players set default 4;

update public.multiplayer_worlds
set max_players = 4
where max_players < 4;

alter table public.multiplayer_worlds
  add constraint multiplayer_worlds_max_players_check
  check (max_players between 2 and 4);
