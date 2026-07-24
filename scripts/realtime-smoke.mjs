import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const url = process.env.VITE_SUPABASE_URL;
const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
if (!url || !key) throw new Error('Supabase-Testvariablen fehlen.');

const first = createClient(url, key, { auth: { persistSession: false } });
const second = createClient(url, key, { auth: { persistSession: false } });
if (process.env.TOKEN_A && process.env.TOKEN_B) {
  await first.realtime.setAuth(process.env.TOKEN_A);
  await second.realtime.setAuth(process.env.TOKEN_B);
}
const topic = `smoke:${randomUUID()}`;
let received = false;
let presenceCount = 0;
const a = first.channel(topic, { config: { presence: { key: 'a' } } });
const b = second.channel(topic, { config: { presence: { key: 'b' } } });

b.on('broadcast', { event: 'ping' }, ({ payload }) => { received = payload?.ok === true; });
b.on('presence', { event: 'sync' }, () => {
  presenceCount = Object.values(b.presenceState()).flat().length;
});

function subscribe(channel) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Realtime subscribe timeout')), 10000);
    channel.subscribe((status, error) => {
      if (status === 'SUBSCRIBED') { clearTimeout(timeout); resolve(); }
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') { clearTimeout(timeout); reject(error || new Error(status)); }
    });
  });
}

await Promise.all([subscribe(a), subscribe(b)]);
await a.track({ userId: 'a' });
await b.track({ userId: 'b' });
await a.send({ type: 'broadcast', event: 'ping', payload: { ok: true } });
await new Promise((resolve) => setTimeout(resolve, 2500));
const presenceKeys = Object.keys(b.presenceState());
await Promise.all([first.removeChannel(a), second.removeChannel(b)]);

if (!received || presenceCount !== 2) {
  throw new Error(`Realtime-Test fehlgeschlagen: broadcast=${received}, presence=${presenceCount}, keys=${presenceKeys.join(',')}`);
}
console.log(`Realtime-Test erfolgreich: Broadcast empfangen, Presence=${presenceCount}`);
process.exit(0);
