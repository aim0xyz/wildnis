import { execFileSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';

const url = process.env.VITE_SUPABASE_URL;
const publishableKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
if (!url || !publishableKey) throw new Error('Supabase-Testvariablen fehlen.');

const projectRef = new URL(url).hostname.split('.')[0];
const apiKeys = JSON.parse(execFileSync('supabase', [
  'projects', 'api-keys', '--project-ref', projectRef, '--output', 'json',
], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }));
const serviceEntry = apiKeys.find((entry) => /service.role|secret/i.test(entry.name || entry.type || ''));
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  || serviceEntry?.api_key || serviceEntry?.key || serviceEntry?.value;
if (!serviceKey) throw new Error('Service-Role-Key für isolierte Testkonten nicht gefunden.');

const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
const clients = Array.from({ length: 5 }, () => createClient(url, publishableKey, { auth: { persistSession: false } }));
const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const password = `Koop-Test-${suffix}!`;
const users = [];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function rpc(client, name, args) {
  const { data, error } = await client.rpc(name, args);
  if (error) throw error;
  return data;
}

try {
  for (let i = 0; i < clients.length; i++) {
    const email = `koop-history-${i}-${suffix}@example.test`;
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (error) throw error;
    users.push(data.user.id);
    const signedIn = await clients[i].auth.signInWithPassword({ email, password });
    if (signedIn.error) throw signedIn.error;
  }

  const host = await rpc(clients[0], 'create_multiplayer_world', {
    player_name: 'Laura',
    initial_world_state: { day: 1, t: 0.3, buildings: [], resources: [] },
    initial_player_state: { inv: { beeren: 2 }, hp: 100 },
  });
  assert(host.world_state.day === 1, 'Neue Koop-Welt startet nicht an Tag 1.');
  assert(host.player_state.inv.beeren === 2, 'Host-Startinventar fehlt.');

  const hostBeforeJoin = await rpc(clients[0], 'list_multiplayer_world_history');
  assert(hostBeforeJoin.length === 1 && hostBeforeJoin[0].member_count === 1, 'Host-History ist fehlerhaft.');

  const guest = await rpc(clients[1], 'join_multiplayer_world', {
    player_code: host.room_code,
    player_name: 'Bruder',
  });
  assert(guest.is_new_member === true, 'Erster Beitritt wurde nicht als neuer Spieler erkannt.');

  const guestSession = (await clients[1].auth.getSession()).data.session;
  const guestSave = await clients[1].from('multiplayer_world_members').update({
    player_state: { inv: { holz: 7 }, hp: 83, savedAt: Date.now() },
  }).eq('world_id', host.id).eq('user_id', guestSession.user.id);
  if (guestSave.error) throw guestSave.error;

  const worldSave = await clients[0].from('multiplayer_worlds').update({
    world_state: { day: 3, t: 0.55, buildings: [{ type: 'campfire' }], resources: [] },
  }).eq('id', host.id);
  if (worldSave.error) throw worldSave.error;

  const [hostHistory, guestHistory] = await Promise.all([
    rpc(clients[0], 'list_multiplayer_world_history'),
    rpc(clients[1], 'list_multiplayer_world_history'),
  ]);
  assert(hostHistory[0].partner_name === 'Bruder', 'Partnername fehlt in der Host-History.');
  assert(guestHistory[0].partner_name === 'Laura', 'Partnername fehlt in der Gast-History.');
  assert(hostHistory[0].day === 3 && hostHistory[0].building_count === 1, 'Weltfortschritt fehlt in der History.');

  const resumed = await rpc(clients[1], 'resume_multiplayer_world', {
    world_uuid: host.id,
    player_name: 'Bruder',
  });
  assert(resumed.player_state.inv.holz === 7 && resumed.player_state.hp === 83, 'Persönlicher Koop-Save wurde nicht fortgesetzt.');
  assert(resumed.world_state.day === 3, 'Gemeinsamer Welt-Save wurde nicht fortgesetzt.');

  for (let i = 2; i <= 3; i++) {
    const extraGuest = await rpc(clients[i], 'join_multiplayer_world', {
      player_code: host.room_code,
      player_name: i === 2 ? 'Dritter' : 'Vierter',
    });
    assert(extraGuest.is_new_member === true, `Spieler ${i + 1} konnte der Koop-Welt nicht beitreten.`);
  }

  const fullRoom = await clients[4].rpc('join_multiplayer_world', {
    player_code: host.room_code,
    player_name: 'Fünfter',
  });
  assert(fullRoom.error && /room is full/i.test(fullRoom.error.message), 'Fünfter Spieler konnte einen vollen Raum betreten.');

  console.log('Koop-History-Test erfolgreich: vier Spieler, getrennte Spielersaves, Partner-History, Raumlimit und Fortsetzen geprüft.');
} finally {
  await Promise.all(users.map((id) => admin.auth.admin.deleteUser(id)));
}

process.exit(0);
