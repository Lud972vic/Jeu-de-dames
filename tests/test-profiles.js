/**
 * CHECKERS LEGEND 2026 — Tests des profils et des sauvegardes nommées
 * Exécution : node --test tests/test-profiles.js
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

class MemoryStorage {
  constructor() { this.map = new Map(); }
  getItem(key) { return this.map.has(key) ? this.map.get(key) : null; }
  setItem(key, value) { this.map.set(key, String(value)); }
  removeItem(key) { this.map.delete(key); }
  clear() { this.map.clear(); }
  get length() { return this.map.size; }
}

global.localStorage = new MemoryStorage();
global.sessionStorage = new MemoryStorage();

const classList = { toggle() {}, add() {}, remove() {}, contains() { return false; } };
global.document = {
  documentElement: { style: { setProperty() {} } },
  body: { dataset: {}, classList: classList, style: {} }
};
global.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });

const CFG = require('../config/game-config.js');
global.GameConfig = CFG;
global.StorageManager = require('../js/storage-manager.js');
global.SettingsManager = require('../js/settings-manager.js');
global.Statistics = require('../js/statistics.js');
const Profiles = require('../js/profile-manager.js');

const KEYS = CFG.STORAGE.KEYS;
const slotKey = (slot) => KEYS.SAVE + ':slot' + slot;

function legacyGame(moves) {
  return {
    engine: { board: new Array(100).fill(0), history: new Array(moves).fill({ notation: 'x' }) },
    clocks: { white: 1000, black: 1000 },
    unlimited: false,
    config: { mode: 'ai', difficulty: 'normal', timerMinutes: 10 },
    savedAt: Date.now()
  };
}

test('Premier lancement : le profil par défaut récupère les données existantes', () => {
  global.localStorage.clear();
  global.StorageManager.set(KEYS.SETTINGS, { playerName: 'Léa', theme: 'midnight' });
  global.StorageManager.set(KEYS.STATS, { wins: 4, xp: 350, games: [], badges: [], solvedPuzzles: [] });
  global.StorageManager.set(KEYS.SAVE, legacyGame(6));
  global.StorageManager.set(slotKey(1), legacyGame(3));

  const registry = Profiles.ensure();
  assert.equal(registry.profiles.length, 1);
  const active = Profiles.active();
  assert.equal(active.settings.playerName, 'Léa');
  assert.equal(active.stats.wins, 4);
  assert.ok(active.save);
  assert.ok(active.slots[1]);
  // Les clés historiques ne sont pas supprimées.
  assert.ok(global.StorageManager.get(KEYS.SAVE, null));
  assert.ok(global.StorageManager.get(KEYS.SETTINGS, null));
});

test('Bascule entre profils : isolation des réglages, statistiques et sauvegardes', () => {
  global.localStorage.clear();
  Profiles.registry = null;
  Profiles.ensure();
  const first = Profiles.active().id;
  global.SettingsManager.load();
  global.SettingsManager.set('playerName', 'Alice');
  global.Statistics.load();
  global.Statistics.data.wins = 7;
  global.Statistics.save();
  global.StorageManager.set(KEYS.SAVE, legacyGame(9));
  Profiles.snapshot();

  const second = Profiles.create('Bob', 'user');
  assert.equal(second.name, 'Bob');
  assert.equal(second.id, Profiles.active().id);
  assert.equal(global.StorageManager.get(KEYS.SETTINGS, null).playerName, 'Bob');
  assert.equal(global.StorageManager.get(KEYS.STATS, null).wins, 0);
  assert.equal(global.StorageManager.get(KEYS.SAVE, null), null);

  global.StorageManager.set(KEYS.SAVE, legacyGame(2));
  Profiles.snapshot();
  assert.equal(Profiles.list().length, 2);
  assert.equal(Profiles.select(first).id, first);
  assert.equal(global.StorageManager.get(KEYS.SETTINGS, null).playerName, 'Alice');
  assert.equal(global.StorageManager.get(KEYS.STATS, null).wins, 7);
  const restored = global.StorageManager.get(KEYS.SAVE, null);
  assert.equal(restored.engine.history.length, 9);
});

test('Sauvegardes nommées : création, lecture et suppression propres au profil', () => {
  global.localStorage.clear();
  Profiles.registry = null;
  Profiles.ensure();
  const entry = Profiles.saveNamed('Avant la finale', legacyGame(11));
  assert.equal(entry.name, 'Avant la finale');
  assert.equal(Profiles.listNamed().length, 1);
  assert.equal(Profiles.getNamed(entry.id).payload.engine.history.length, 11);

  const first = Profiles.active().id;
  Profiles.create('Camille', 'user');
  assert.equal(Profiles.listNamed().length, 0);
  assert.equal(Profiles.getNamed(entry.id), null);

  Profiles.select(first);
  assert.equal(Profiles.listNamed().length, 1);
  Profiles.removeNamed(entry.id);
  assert.equal(Profiles.listNamed().length, 0);
});

test('Renommage, suppression et garde du dernier profil', () => {
  global.localStorage.clear();
  Profiles.registry = null;
  Profiles.ensure();
  const first = Profiles.active().id;
  const second = Profiles.create('Nouveau', 'user');
  assert.equal(Profiles.rename(second.id, '  Renommé  '), true);
  assert.equal(Profiles.active().name, 'Renommé');
  assert.equal(Profiles.active().settings.playerName, 'Renommé');

  assert.equal(Profiles.remove(second.id), true);
  assert.equal(Profiles.active().id, first);
  assert.equal(Profiles.list().length, 1);
  assert.equal(Profiles.remove(first), false);
  assert.equal(Profiles.list().length, 1);
});
