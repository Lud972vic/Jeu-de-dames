/**
 * CHECKERS LEGEND 2026 — Tests stockage, paramètres, statistiques et reprise
 * Exécution : node --test tests/test-storage.js
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

/* ------------------------------------------------------------
 * Environnement navigateur simulé (minimal)
 * ------------------------------------------------------------ */

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

const style = { setProperty() {} };
const classList = { toggle() {}, add() {}, remove() {}, contains() { return false; } };
global.document = {
  documentElement: { style: style },
  body: { dataset: {}, classList: classList, style: {} }
};
global.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });

const CFG = require('../config/game-config.js');
const Rules = require('../js/game-rules.js');
const GameEngine = require('../js/game-engine.js');

global.GameConfig = CFG;
global.StorageManager = require('../js/storage-manager.js');
const SettingsManager = require('../js/settings-manager.js');
const Statistics = require('../js/statistics.js');

const StorageManager = global.StorageManager;

/* ------------------------------------------------------------
 * 1. Stockage local
 * ------------------------------------------------------------ */

test('Stockage : écriture/lecture versionnée avec préfixe', () => {
  StorageManager.set('demo', { value: 42, label: 'test' });
  const raw = global.localStorage.getItem(CFG.STORAGE.PREFIX + 'demo');
  assert.ok(raw, 'la clé préfixée doit exister');
  const parsed = JSON.parse(raw);
  assert.equal(parsed.version, CFG.STORAGE.VERSION);
  assert.deepEqual(StorageManager.get('demo', null), { value: 42, label: 'test' });
});

test('Stockage : valeur absente ou JSON corrompu => valeur de repli', () => {
  assert.equal(StorageManager.get('inconnu', 'repli'), 'repli');
  global.localStorage.setItem(CFG.STORAGE.PREFIX + 'corrompu', '{pas du json');
  assert.equal(StorageManager.get('corrompu', 'repli'), 'repli');
});

test('Stockage : suppression et détection de disponibilité', () => {
  StorageManager.set('temporaire', 1);
  assert.equal(StorageManager.get('temporaire', null), 1);
  StorageManager.remove('temporaire');
  assert.equal(StorageManager.get('temporaire', null), null);
  assert.equal(StorageManager.isAvailable(), true);
});

test('Stockage : migration d’un ancien schéma', () => {
  global.localStorage.setItem(CFG.STORAGE.PREFIX + 'ancien', JSON.stringify({
    version: 0,
    data: { theme: 'classic' }
  }));
  assert.deepEqual(StorageManager.get('ancien', null), { theme: 'classic' });
});

/* ------------------------------------------------------------
 * 2. Paramètres
 * ------------------------------------------------------------ */

test('Paramètres : valeurs par défaut, persistance et réinitialisation', () => {
  const defaults = SettingsManager.load();
  assert.equal(defaults.theme, 'neon');
  assert.equal(defaults.mode, 'dark');
  assert.equal(defaults.difficulty, 'normal');
  assert.equal(defaults.animationsEnabled, true);

  SettingsManager.set('theme', 'midnight');
  SettingsManager.set('pieceStyle', 'ruby');
  SettingsManager.set('difficulty', 'expert');
  SettingsManager.set('volume', 0.35);
  SettingsManager.set('boardFlipped', true);
  SettingsManager.set('timerMinutes', 3);
  SettingsManager.set('animationSpeed', 1.5);
  SettingsManager.set('aiThinkMs', 2000);
  SettingsManager.set('soundsEnabled', false);
  SettingsManager.set('animationsEnabled', false);
  SettingsManager.set('showLegalMoves', false);
  SettingsManager.set('mode', 'light');

  const reloaded = SettingsManager.load();
  assert.equal(reloaded.theme, 'midnight');
  assert.equal(reloaded.pieceStyle, 'ruby');
  assert.equal(reloaded.difficulty, 'expert');
  assert.equal(reloaded.volume, 0.35);
  assert.equal(reloaded.boardFlipped, true);
  assert.equal(reloaded.timerMinutes, 3);
  assert.equal(reloaded.animationSpeed, 1.5);
  assert.equal(reloaded.aiThinkMs, 2000);
  assert.equal(reloaded.soundsEnabled, false);
  assert.equal(reloaded.animationsEnabled, false);
  assert.equal(reloaded.showLegalMoves, false);
  assert.equal(reloaded.mode, 'light');
  assert.equal(SettingsManager.toggleMode(), 'dark');

  SettingsManager.reset();
  assert.equal(SettingsManager.settings.theme, 'neon');
  assert.equal(SettingsManager.settings.mode, 'dark');
  assert.equal(SettingsManager.settings.volume, 0.7);
  assert.equal(SettingsManager.settings.boardFlipped, false);
});

/* ------------------------------------------------------------
 * 3. Statistiques / XP
 * ------------------------------------------------------------ */

test('Statistiques : victoire, défaite, nul et progression XP', () => {
  global.localStorage.clear();
  Statistics.load();
  assert.equal(Statistics.data.wins, 0);

  const win = Statistics.recordGame({
    result: 'win', difficulty: 'hard', mode: 'ai', moves: 40, duration: 120, captures: 12
  });
  assert.ok(win.xp >= CFG.XP.WIN.hard);
  assert.equal(Statistics.data.wins, 1);
  assert.equal(Statistics.data.games.length, 1);
  assert.equal(Statistics.level(), Math.floor(Statistics.data.xp / CFG.XP.LEVEL_STEP) + 1);

  Statistics.recordGame({ result: 'loss', difficulty: 'normal', mode: 'ai', moves: 30, duration: 90, captures: 3 });
  Statistics.recordGame({ result: 'draw', difficulty: 'normal', mode: 'ai', moves: 60, duration: 200, captures: 5 });
  assert.equal(Statistics.data.losses, 1);
  assert.equal(Statistics.data.draws, 1);
  assert.equal(Statistics.data.games.length, 3);
});

test('Statistiques : partie 2 joueurs historisée sans XP ni bilan personnel', () => {
  const before = {
    wins: Statistics.data.wins,
    losses: Statistics.data.losses,
    draws: Statistics.data.draws,
    xp: Statistics.data.xp
  };
  const record = Statistics.recordGame({
    casual: true,
    result: 'white',
    moves: 55,
    duration: 300,
    captures: 14
  });
  assert.equal(record.xp, 0);
  assert.equal(Statistics.data.wins, before.wins);
  assert.equal(Statistics.data.losses, before.losses);
  assert.equal(Statistics.data.draws, before.draws);
  assert.equal(Statistics.data.xp, before.xp);
  assert.equal(Statistics.data.games[0].mode, 'pvp');
  assert.equal(Statistics.data.games[0].result, 'white');
});

test('Statistiques : historique plafonné à 50 parties', () => {
  for (let i = 0; i < 60; i++) {
    Statistics.recordGame({ result: 'draw', difficulty: 'easy', mode: 'ai', moves: 10, duration: 10, captures: 0 });
  }
  assert.equal(Statistics.data.games.length, 50);
});

test('Succès, puzzles et données de replay', () => {
  global.localStorage.clear();
  Statistics.load();
  assert.equal(Statistics.badgeList().length, 6);

  const record = Statistics.recordGame({
    result: 'win', difficulty: 'expert', mode: 'ai', moves: 20, duration: 60, captures: 10,
    notation: ['32-28'],
    replay: [{ from: 32, to: 28, path: [28], captures: [], isCapture: false, promotes: false }]
  });
  assert.deepEqual(record.badges.map((b) => b.id).sort(), ['captor', 'expert-slayer', 'first-win']);
  assert.ok(record.bonusXp > 0);
  assert.deepEqual(Statistics.data.games[0].notation, ['32-28']);
  assert.equal(Statistics.data.games[0].replay.length, 1);

  assert.equal(Statistics.awardPuzzle('prise-simple').xp, 15);
  assert.equal(Statistics.awardPuzzle('prise-simple').xp, 0);
  assert.equal(Statistics.data.solvedPuzzles.length, 1);
  assert.equal(Statistics.data.streak, 1);
});

/* ------------------------------------------------------------
 * 4. Sauvegarde / reprise d'une partie
 * ------------------------------------------------------------ */

test('Reprise : sérialisation, stockage et rechargement identiques', () => {
  const engine = new GameEngine();
  engine.newGame({ mode: 'ai', difficulty: 'normal', playerColor: CFG.WHITE });

  for (let i = 0; i < 8; i++) {
    const moves = engine.getLegalMoves();
    assert.ok(moves.length > 0);
    const result = engine.playMove(moves[0]);
    assert.equal(result.ok, true);
    if (engine.status.over) break;
  }

  const payload = {
    engine: engine.serialize(),
    clocks: { white: 420000, black: 390000 },
    unlimited: false,
    config: { mode: 'ai', difficulty: 'normal', playerColor: CFG.WHITE, timerMinutes: 10 },
    savedAt: Date.now()
  };
  StorageManager.set(CFG.STORAGE.KEYS.SAVE, payload);

  const stored = StorageManager.get(CFG.STORAGE.KEYS.SAVE, null);
  assert.ok(stored);
  const restored = new GameEngine();
  assert.equal(restored.loadState(stored.engine), true);

  assert.deepEqual(restored.board, engine.board);
  assert.equal(restored.currentPlayer, engine.currentPlayer);
  assert.equal(restored.history.length, engine.history.length);
  assert.equal(restored.history[0].notation, engine.history[0].notation);
  assert.equal(restored.difficulty, 'normal');
  assert.equal(restored.mode, 'ai');
  assert.equal(restored.playerColor, CFG.WHITE);
  assert.equal(restored.getLegalMoves().length, engine.getLegalMoves().length);

  // L'annulation reste possible après reprise.
  if (restored.canUndo()) {
    const before = restored.board.slice();
    restored.undo();
    assert.notDeepEqual(restored.board, before);
  }
});

test('Reprise : coup légal après rechargement et statut cohérent', () => {
  const engine = new GameEngine();
  engine.newGame({ mode: 'pvp' });
  const moves = engine.getLegalMoves();
  engine.playMove(moves[0]);

  const restored = new GameEngine();
  restored.loadState(JSON.parse(JSON.stringify(engine.serialize())));

  const legal = restored.getLegalMoves();
  assert.ok(legal.length > 0);
  const result = restored.playMove(legal[0]);
  assert.equal(result.ok, true);
  assert.equal(restored.history.length, 2);
  assert.equal(restored.currentPlayer, Rules.otherPlayer(engine.currentPlayer));
});
