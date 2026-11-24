/**
 * CHECKERS LEGEND 2026 — Profils de joueurs et sauvegardes nommées
 * ----------------------------------------------------------------
 * Les clés historiques (settings, stats, savegame, savegame:slotN) restent le
 * miroir du profil actif : tout le code existant continue à fonctionner tel quel.
 * Ce module ajoute un registre de profils et les sauvegardes nommées, sans
 * migration destructive des données déjà présentes.
 *
 * Aucune dépendance réseau, compatible navigateur (<script>) et Node (require).
 */
(function (global) {
  'use strict';

  const CFG = global.GameConfig;
  const Store = global.StorageManager;
  const KEYS = CFG.STORAGE.KEYS;
  const SLOT_COUNT = 3;

  const clone = (value) => value === undefined || value === null
    ? value
    : JSON.parse(JSON.stringify(value));

  const slotKey = (slot) => KEYS.SAVE + ':slot' + slot;
  const namedKey = (profileId) => KEYS.NAMED_SAVES + ':' + profileId;

  function defaultSettings(name, avatar) {
    const source = global.SettingsManager && global.SettingsManager.DEFAULTS
      ? global.SettingsManager.DEFAULTS
      : { playerName: 'Joueur', playerAvatar: 'user' };
    const settings = clone(source);
    settings.playerName = name;
    settings.playerAvatar = avatar || 'user';
    return settings;
  }

  function defaultStats() {
    return clone((global.Statistics && global.Statistics.EMPTY) || {
      wins: 0, losses: 0, draws: 0, xp: 0, bestScore: 0,
      games: [], badges: [], streak: 0, bestStreak: 0, solvedPuzzles: []
    });
  }

  function newId() {
    return 'p_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
  }

  const ProfileManager = {
    registry: null,

    /** Crée le registre au premier lancement, sans toucher aux données existantes. */
    ensure() {
      let registry = Store.get(KEYS.PROFILES, null);
      if (!registry || !Array.isArray(registry.profiles) || registry.profiles.length === 0) {
        const profile = this._build('default', 'Joueur', 'user');
        this._snapshotInto(profile);
        registry = { version: 1, activeId: profile.id, profiles: [profile] };
        Store.set(KEYS.PROFILES, registry);
      }
      if (!this._find(registry, registry.activeId)) registry.activeId = registry.profiles[0].id;
      this.registry = registry;
      this.persist();
      return registry;
    },

    _build(id, name, avatar) {
      return {
        id: id,
        name: name,
        avatar: avatar || 'user',
        settings: defaultSettings(name, avatar),
        stats: defaultStats(),
        save: null,
        slots: {}
      };
    },

    _find(registry, id) {
      return (registry.profiles || []).find((profile) => profile.id === id) || null;
    },

    active() {
      if (!this.registry) this.ensure();
      return this._find(this.registry, this.registry.activeId) || this.registry.profiles[0];
    },

    list() {
      if (!this.registry) this.ensure();
      return this.registry.profiles.map((profile) => ({
        id: profile.id,
        name: profile.name,
        avatar: profile.avatar,
        active: profile.id === this.registry.activeId,
        xp: (profile.stats && profile.stats.xp) || 0,
        wins: (profile.stats && profile.stats.wins) || 0,
        games: (profile.stats && profile.stats.games && profile.stats.games.length) || 0
      }));
    },

    persist() {
      if (!this.registry) return false;
      return Store.set(KEYS.PROFILES, this.registry);
    },

    /** Copie les clés historiques dans le profil actif. */
    snapshot() {
      const profile = this.active();
      this._snapshotInto(profile);
      return this.persist();
    },

    _snapshotInto(profile) {
      profile.settings = clone(Store.get(KEYS.SETTINGS, null)) || defaultSettings(profile.name, profile.avatar);
      profile.stats = clone(Store.get(KEYS.STATS, null)) || defaultStats();
      profile.save = clone(Store.get(KEYS.SAVE, null));
      profile.slots = {};
      for (let slot = 1; slot <= SLOT_COUNT; slot++) {
        const save = clone(Store.get(slotKey(slot), null));
        if (save) profile.slots[slot] = save;
      }
    },

    /** Réécrit les clés historiques depuis un profil (utilisé lors d'une bascule). */
    restore(profile) {
      if (!profile) return false;
      if (profile.settings) Store.set(KEYS.SETTINGS, clone(profile.settings));
      if (profile.stats) Store.set(KEYS.STATS, clone(profile.stats));
      if (profile.save) Store.set(KEYS.SAVE, clone(profile.save));
      else Store.remove(KEYS.SAVE);
      for (let slot = 1; slot <= SLOT_COUNT; slot++) {
        const save = profile.slots && profile.slots[slot];
        if (save) Store.set(slotKey(slot), clone(save));
        else Store.remove(slotKey(slot));
      }
      return true;
    },

    create(name, avatar) {
      const clean = String(name || '').trim().slice(0, 18) || 'Joueur';
      this.snapshot();
      const profile = this._build(newId(), clean, avatar || 'user');
      this.registry.profiles.push(profile);
      this.registry.activeId = profile.id;
      this.persist();
      this.restore(profile);
      return profile;
    },

    rename(id, name) {
      const profile = this._find(this.registry, id);
      if (!profile) return false;
      const clean = String(name || '').trim().slice(0, 18) || 'Joueur';
      profile.name = clean;
      if (profile.settings) profile.settings.playerName = clean;
      this.persist();
      if (id === this.registry.activeId) {
        const settings = clone(Store.get(KEYS.SETTINGS, null)) || defaultSettings(clean, profile.avatar);
        settings.playerName = clean;
        Store.set(KEYS.SETTINGS, settings);
      }
      return true;
    },

    select(id) {
      const target = this._find(this.registry, id);
      if (!target || id === this.registry.activeId) return false;
      this.snapshot();
      this.registry.activeId = id;
      this.persist();
      this.restore(target);
      return target;
    },

    remove(id) {
      if (!this.registry || this.registry.profiles.length <= 1) return false;
      const target = this._find(this.registry, id);
      if (!target) return false;
      this.snapshot();
      this.registry.profiles = this.registry.profiles.filter((profile) => profile.id !== id);
      Store.remove(namedKey(id));
      if (id === this.registry.activeId) {
        this.registry.activeId = this.registry.profiles[0].id;
        this.restore(this._find(this.registry, this.registry.activeId));
      }
      this.persist();
      return true;
    },

    /* ---------- Sauvegardes nommées (propres au profil actif) ---------- */

    listNamed() {
      const profile = this.active();
      const list = Store.get(namedKey(profile.id), []);
      return Array.isArray(list) ? list : [];
    },

    getNamed(id) {
      return this.listNamed().find((entry) => entry.id === id) || null;
    },

    saveNamed(name, payload) {
      const profile = this.active();
      const clean = String(name || '').trim().slice(0, 24) || ('Partie ' + this.listNamed().length);
      const list = this.listNamed();
      const entry = { id: newId(), name: clean, savedAt: Date.now(), payload: clone(payload) };
      list.unshift(entry);
      Store.set(namedKey(profile.id), list.slice(0, 20));
      return entry;
    },

    removeNamed(id) {
      const profile = this.active();
      const list = this.listNamed().filter((entry) => entry.id !== id);
      return Store.set(namedKey(profile.id), list);
    }
  };

  global.ProfileManager = ProfileManager;
  if (typeof module !== 'undefined' && module.exports) module.exports = ProfileManager;
})(typeof globalThis !== 'undefined' ? globalThis : this);
