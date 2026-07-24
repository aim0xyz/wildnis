import { cloud } from './cloud.js';
import { t } from './i18n.js';

class TwoPlayerMode {
  constructor() {
    this.active = false;
    this.connected = false;
    this.room = null;
    this.channel = null;
    this.playerSendTimer = 0;
    this.worldSaveTimer = null;
    this.playerSaveTimer = null;
    this.pendingWorldState = null;
    this.pendingPlayerState = null;
    this.lastWorldRevision = 0;
    this.listeners = new Set();
    this.onPlayerState = null;
    this.onWorldState = null;
    this.onHit = null;
    this.onResource = null;
    this.onPresence = null;
    this.onWeather = null;
    this.onWorldEvent = null;
    this.onAnimals = null;
    this.onAnimalHit = null;
    this.onAnimalResult = null;
    this.onAnimalChase = null;
    this.onRevive = null;
    this.onStorage = null;
    this.onWaypoint = null;
    // Identität/Transport. Im Web bleibt das null → alle Zugriffe fallen unten
    // auf den Supabase-Login (cloud) zurück, Verhalten dort unverändert. Im
    // CrazyGames-Broadcast-Modus injiziert useCrazyIdentity() hier { id, client }
    // (eigener anon-Realtime-Client, kein E-Mail-Login, keine Persistenz).
    this.identity = null;
  }

  // --- Identität & Transport (Web-Fallback = Supabase-Login) -----------------
  // Lokale Spieler-ID: CrazyGames-Identität, sonst Supabase-Nutzer.
  localId() { return this.identity?.id || cloud.session?.user?.id || null; }
  // Realtime-Client für Channels: injizierter anon-Client, sonst Supabase.
  rt() { return this.identity?.client || cloud.client; }
  // Realtime-Auth-Token nur im Web (Supabase-JWT); im Broadcast-Modus keins.
  authToken() { return this.identity ? null : (cloud.session?.access_token ?? null); }
  // Server-Persistenz gibt es nur mit Supabase-Login; Broadcast-Modus ist ephemer.
  get persistent() { return !this.identity; }
  get broadcastOnly() { return !!this.identity; }

  // Der Host (Welt-Ersteller) ist die autoritative Quelle für Wetter & Events.
  isHost() {
    return !!(this.active && this.room && this.localId() === this.room.host_id);
  }

  snapshot(extra = {}) {
    return {
      active: this.active,
      connected: this.connected,
      room: this.room,
      userId: this.localId(),
      ...extra,
    };
  }

  subscribe(listener) {
    this.listeners.add(listener);
    listener(this.snapshot());
    return () => this.listeners.delete(listener);
  }

  emit(extra = {}) {
    const state = this.snapshot(extra);
    for (const listener of this.listeners) listener(state);
  }

  ensureReady() {
    // Web: braucht Supabase-Client + Login. Broadcast-Modus: nur den
    // injizierten Realtime-Client (kein Login).
    if (!this.rt() || (this.persistent && !cloud.session)) throw new Error(t('mp.loginRequired'));
  }

  // --- CrazyGames-Broadcast-Modus: Räume ohne Server/RPC --------------------
  // Injiziert die CrazyGames-Identität + den anon-Realtime-Client. Danach läuft
  // Koop rein über Broadcast (kein Supabase-Login, keine Persistenz).
  useCrazyIdentity(id, client) {
    this.identity = id && client ? { id, client, token: null } : null;
  }

  // Host: eröffnet eine Broadcast-Welt. roomId stammt aus dem CrazyGames-
  // Einladungslink; der Host bleibt autoritativ und speichert nur lokal.
  async createCrazyRoom(displayName, initialWorldState, roomId) {
    return this.connectBroadcast({
      id: roomId,
      room_code: this.roomCodeFrom(roomId),
      host_id: this.localId(),
      display_name: displayName,
      world_state: initialWorldState || {},
    });
  }

  // Gast: tritt einer Broadcast-Welt bei. host_id bleibt fremd (Gast ist nie
  // Host); die reale Welt kommt per world_state-Broadcast vom Host.
  async joinCrazyRoom(displayName, roomId) {
    return this.connectBroadcast({
      id: roomId,
      room_code: this.roomCodeFrom(roomId),
      host_id: '__host__',
      display_name: displayName,
      world_state: {},
    });
  }

  roomCodeFrom(roomId) {
    return String(roomId || '').replace(/[^A-Za-z0-9]/g, '').slice(0, 6).toUpperCase() || 'COOP';
  }

  async connectBroadcast(room) {
    if (!this.identity) throw new Error(t('mp.loginRequired'));
    await this.connect(room);
    return room;
  }

  async create(displayName, initialWorldState, initialPlayerState) {
    this.ensureReady();
    const { data, error } = await cloud.client.rpc('create_multiplayer_world', {
      player_name: displayName,
      initial_world_state: initialWorldState,
      initial_player_state: initialPlayerState,
    });
    if (error) throw error;
    await this.connect(data);
    return data;
  }

  async join(roomCode, displayName) {
    this.ensureReady();
    const { data, error } = await cloud.client.rpc('join_multiplayer_world', {
      player_code: roomCode.trim().toUpperCase(),
      player_name: displayName,
    });
    if (error) throw error;
    await this.connect(data);
    return data;
  }

  async resume(worldId, displayName) {
    this.ensureReady();
    const { data, error } = await cloud.client.rpc('resume_multiplayer_world', {
      world_uuid: worldId,
      player_name: displayName,
    });
    if (error) throw error;
    await this.connect(data);
    return data;
  }

  async history() {
    this.ensureReady();
    const { data, error } = await cloud.client.rpc('list_multiplayer_world_history');
    if (error) throw error;
    return Array.isArray(data) ? data : [];
  }

  async connect(room) {
    await this.stop();
    this.ensureReady();
    this.room = room;
    this.active = true;
    this.connected = false;
    this.lastWorldRevision = Number(room.world_state?.revision) || 0;
    // Realtime-Autorisierung nur im Web (Supabase-JWT). Im Broadcast-Modus läuft
    // der Channel öffentlich über den anon-Client ohne setAuth.
    const token = this.authToken();
    if (token) await this.rt().realtime.setAuth(token);
    const userId = this.localId();
    this.channel = this.rt().channel(`world:${room.id}`, {
      config: {
        broadcast: { self: false, ack: false },
        presence: { key: userId },
      },
    });
    this.channel
      .on('broadcast', { event: 'player_state' }, ({ payload }) => {
        if (payload?.userId !== userId) this.onPlayerState?.(payload);
      })
      .on('broadcast', { event: 'world_state' }, ({ payload }) => {
        const revision = Number(payload?.revision) || 0;
        if (revision <= this.lastWorldRevision) return;
        this.lastWorldRevision = revision;
        this.onWorldState?.(payload);
      })
      .on('broadcast', { event: 'player_hit' }, ({ payload }) => {
        if (payload?.targetId === userId) this.onHit?.(payload);
      })
      .on('broadcast', { event: 'resource_hit' }, ({ payload }) => {
        if (payload?.author !== userId) this.onResource?.(payload);
      })
      .on('broadcast', { event: 'weather' }, ({ payload }) => {
        if (payload?.author !== userId) this.onWeather?.(payload);
      })
      .on('broadcast', { event: 'world_event' }, ({ payload }) => {
        if (payload?.author !== userId) this.onWorldEvent?.(payload);
      })
      .on('broadcast', { event: 'animals' }, ({ payload }) => {
        if (payload?.author !== userId) this.onAnimals?.(payload.list);
      })
      .on('broadcast', { event: 'animal_hit' }, ({ payload }) => {
        if (payload?.author !== userId) this.onAnimalHit?.(payload);
      })
      .on('broadcast', { event: 'animal_result' }, ({ payload }) => {
        if (payload?.targetId === userId) this.onAnimalResult?.(payload);
      })
      .on('broadcast', { event: 'animal_chase' }, ({ payload }) => {
        if (payload?.targetId === userId) this.onAnimalChase?.(payload);
      })
      .on('broadcast', { event: 'player_revive' }, ({ payload }) => {
        if (payload?.targetId === userId) this.onRevive?.(payload);
      })
      .on('broadcast', { event: 'storage' }, ({ payload }) => {
        if (payload?.author !== userId) this.onStorage?.(payload);
      })
      // Wegpunkte sind reine Markierungen ohne Weltzustand: Sie werden nicht
      // persistiert, sondern nur an die gerade verbundenen Mitspieler gesendet.
      .on('broadcast', { event: 'waypoint' }, ({ payload }) => {
        if (payload?.author !== userId) this.onWaypoint?.(payload);
      })
      .on('presence', { event: 'sync' }, () => this.syncPresence());

    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Der Multiplayer-Raum antwortet nicht.')), 10000);
      this.channel.subscribe(async (status, error) => {
        if (status === 'SUBSCRIBED') {
          clearTimeout(timeout);
          this.connected = true;
          await this.channel.track({
            userId,
            name: room.display_name,
            onlineAt: new Date().toISOString(),
          });
          this.emit({ message: `Raum ${room.room_code} verbunden` });
          resolve();
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          clearTimeout(timeout);
          reject(error || new Error('Realtime-Verbindung fehlgeschlagen.'));
        } else if (status === 'CLOSED' && this.active) {
          this.connected = false;
          this.emit({ error: 'Verbindung zur Koop-Welt unterbrochen.' });
        }
      });
    });
  }

  syncPresence() {
    if (!this.channel) return;
    const ownId = this.localId();
    // Reconnects können mehrere Presence-Metas für denselben Nutzer liefern.
    // Pro Nutzer gewinnt der neueste Eintrag, damit Zähler und Avatare stimmen.
    const uniquePlayers = new Map();
    for (const entry of Object.values(this.channel.presenceState()).flat()) {
      if (!entry.userId || entry.userId === ownId) continue;
      const previous = uniquePlayers.get(entry.userId);
      if (!previous || String(entry.onlineAt || '') > String(previous.onlineAt || '')) uniquePlayers.set(entry.userId, entry);
    }
    const players = [...uniquePlayers.values()];
    this.onPresence?.(players);
    this.emit({ partnerOnline: players.length > 0, players });
  }

  update(dt, playerState) {
    if (!this.connected || !this.channel) return;
    this.playerSendTimer -= dt;
    if (this.playerSendTimer > 0) return;
    this.playerSendTimer = 0.1;
    this.sendPlayerState(playerState);
  }

  sendPlayerState(playerState) {
    if (!this.connected || !this.channel) return;
    this.channel.send({
      type: 'broadcast',
      event: 'player_state',
      payload: {
        ...playerState,
        userId: this.localId(),
        name: this.room.display_name,
        sentAt: Date.now(),
      },
    });
  }

  queueWorldState(worldState, delay = 450) {
    if (!this.connected || !this.channel) return;
    const payload = {
      ...structuredClone(worldState),
      revision: Date.now(),
      author: this.localId(),
    };
    this.lastWorldRevision = payload.revision;
    this.pendingWorldState = payload;
    this.channel.send({ type: 'broadcast', event: 'world_state', payload });
    clearTimeout(this.worldSaveTimer);
    this.worldSaveTimer = setTimeout(() => this.persistWorldState(), delay);
  }

  async persistWorldState() {
    const payload = this.pendingWorldState;
    this.pendingWorldState = null;
    if (!payload || !this.room || !cloud.client) return;
    const { error } = await cloud.client
      .from('multiplayer_worlds')
      .update({ world_state: payload })
      .eq('id', this.room.id);
    if (error) this.emit({ error: error.message });
  }

  queuePlayerState(playerState, delay = 450) {
    if (!this.active || !this.room || !cloud.client) return;
    this.pendingPlayerState = {
      ...structuredClone(playerState),
      savedAt: Date.now(),
    };
    clearTimeout(this.playerSaveTimer);
    this.playerSaveTimer = setTimeout(() => this.persistPlayerState(), delay);
  }

  async persistPlayerState() {
    const payload = this.pendingPlayerState;
    this.pendingPlayerState = null;
    const userId = cloud.session?.user?.id;
    if (!payload || !this.room || !cloud.client || !userId) return;
    const { error } = await cloud.client
      .from('multiplayer_world_members')
      .update({ player_state: payload, last_seen_at: new Date().toISOString() })
      .eq('world_id', this.room.id)
      .eq('user_id', userId);
    if (error) this.emit({ error: error.message });
  }

  // Wegpunkt an alle Mitspieler senden. cleared:true löscht ihn wieder.
  waypoint(point) {
    if (!this.connected || !this.channel) return;
    this.channel.send({
      type: 'broadcast',
      event: 'waypoint',
      payload: {
        author: this.localId(),
        authorName: this.room?.display_name || 'Mitspieler',
        x: point?.x ?? 0,
        z: point?.z ?? 0,
        cleared: !point,
        sentAt: Date.now(),
      },
    });
  }

  hit(targetId, damage, weapon) {
    if (!this.connected || !targetId) return;
    this.channel.send({
      type: 'broadcast',
      event: 'player_hit',
      payload: {
        targetId,
        attackerId: this.localId(),
        attackerName: this.room.display_name,
        damage,
        weapon,
        sentAt: Date.now(),
      },
    });
  }

  animalAttack(targetId, damage, cause, animalName) {
    if (!this.connected || !targetId) return;
    this.channel.send({
      type: 'broadcast',
      event: 'player_hit',
      payload: {
        targetId,
        attackerId: 'animal',
        attackerName: animalName || 'Ein Tier',
        damage,
        weapon: 'animal',
        cause,
        sentAt: Date.now(),
      },
    });
  }

  animalChase(targetId, kind, pan = 0) {
    if (!this.connected || !targetId) return;
    this.channel.send({
      type: 'broadcast',
      event: 'animal_chase',
      payload: { targetId, kind, pan, sentAt: Date.now(), author: this.localId() },
    });
  }

  revive(targetId) {
    if (!this.connected || !this.channel || !targetId) return;
    this.channel.send({
      type: 'broadcast',
      event: 'player_revive',
      payload: {
        targetId,
        rescuerId: this.localId(),
        rescuerName: this.room.display_name,
        sentAt: Date.now(),
      },
    });
  }

  resourceHit(index, toolId) {
    if (!this.connected || index < 0) return;
    this.channel.send({
      type: 'broadcast',
      event: 'resource_hit',
      payload: { index, toolId, author: this.localId() },
    });
  }

  sendWeather(weather) {
    if (!this.connected || !this.channel) return;
    this.channel.send({
      type: 'broadcast',
      event: 'weather',
      payload: { weather, author: this.localId() },
    });
  }

  sendWorldEvent(event) {
    if (!this.connected || !this.channel) return;
    this.channel.send({
      type: 'broadcast',
      event: 'world_event',
      payload: { ...event, author: this.localId() },
    });
  }

  // Host streamt den Tierbestand an den Gast.
  sendAnimals(list) {
    if (!this.connected || !this.channel) return;
    this.channel.send({
      type: 'broadcast',
      event: 'animals',
      payload: { list, author: this.localId() },
    });
  }

  // Gast meldet einen Treffer an ein (Host-)Tier.
  animalHit(id, dmg, dir) {
    if (!this.connected || !this.channel || id == null) return;
    this.channel.send({
      type: 'broadcast',
      event: 'animal_hit',
      payload: { id, dmg, dir: { x: dir?.x || 0, z: dir?.z || 0 }, author: this.localId() },
    });
  }

  // Live-Synchronisation des Inhalts einer gemeinsamen Truhe.
  sendStorage(key, storage, remove = false) {
    if (!this.connected || !this.channel || !key) return;
    this.channel.send({
      type: 'broadcast',
      event: 'storage',
      payload: { key, storage: remove ? null : storage, remove, author: this.localId() },
    });
  }

  // Host schickt das Ergebnis eines Gast-Treffers (Beute/XP/Tod) zurück.
  sendAnimalResult(targetId, result) {
    if (!this.connected || !this.channel || !targetId) return;
    this.channel.send({
      type: 'broadcast',
      event: 'animal_result',
      payload: { ...result, targetId, author: this.localId() },
    });
  }

  async stop() {
    clearTimeout(this.worldSaveTimer);
    clearTimeout(this.playerSaveTimer);
    if (this.pendingWorldState) await this.persistWorldState();
    if (this.pendingPlayerState) await this.persistPlayerState();
    const rt = this.rt();
    if (this.channel && rt) {
      try { await this.channel.untrack(); } catch { /* already disconnected */ }
      await rt.removeChannel(this.channel);
    }
    this.channel = null;
    this.room = null;
    this.active = false;
    this.connected = false;
    this.pendingWorldState = null;
    this.pendingPlayerState = null;
    this.emit();
  }
}

export const multiplayer = new TwoPlayerMode();
