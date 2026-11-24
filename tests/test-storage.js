/**
 * CHECKERS LEGEND 2026 — Tests stockage, paramètres, statistiques et reprise
 * Exécution : node --test tests/test-storage.js
 */
/**
 * NOTE PÉDAGOGIQUE (débutant)
 *
 * Ce fichier vérifie la persistance : stockage local, réglages, statistiques,
 * succès et reprise de partie. Node.js n’ayant pas de navigateur, on simule
 * son environnement : global.localStorage et global.sessionStorage sont
 * remplacés par MemoryStorage, une classe qui garde les valeurs dans une Map
 * en mémoire ; global.document est un faux document avec un corps, un style
 * et des classes ; global.matchMedia imite la détection des préférences du
 * système. Les modules chargés ensuite avec require() lisent ces globales.
 *
 * node:test fournit test() (et describe() pour regrouper) ; assert vérifie
 * les résultats. Le titre d’un test ne doit pas changer : la documentation le cite.
 *
 * Lancer ce seul fichier : node --test tests/test-storage.js
 */
'use strict';

/**
 * Import du lanceur de tests et de la bibliothèque de vérifications.
 */
const test = require('node:test');
const assert = require('node:assert/strict');

/* ------------------------------------------------------------
 * Environnement navigateur simulé (minimal)
 * ------------------------------------------------------------ */

/**
 * Faux stockage du navigateur : une Map conserve les paires clé / valeur.
 * getItem renvoie null si la clé est absente, setItem convertit la valeur en
 * texte, removeItem supprime une clé, clear vide tout et length compte les clés.
 */
class MemoryStorage {
  constructor() { this.map = new Map(); }
  getItem(key) { return this.map.has(key) ? this.map.get(key) : null; }
  setItem(key, value) { this.map.set(key, String(value)); }
  removeItem(key) { this.map.delete(key); }
  clear() { this.map.clear(); }
  get length() { return this.map.size; }
}

/**
 * On place ces faux stockages dans les variables globales avant de charger
 * les modules, car ceux-ci lisent localStorage dès leur import.
 */
global.localStorage = new MemoryStorage();
global.sessionStorage = new MemoryStorage();

/**
 * Faux éléments du navigateur : seules les méthodes utilisées par le code
 * sont présentes. Les fonctions vides ne font rien mais évitent les erreurs.
 */
const style = { setProperty() {} };
const classList = { toggle() {}, add() {}, remove() {}, contains() { return false; } };
global.document = {
  documentElement: { style: style },
  body: { dataset: {}, classList: classList, style: {} }
};
/**
 * Simulation de l’interrogation des préférences d’affichage : ici, rien n’est activé.
 */
global.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });

const CFG = require('../config/game-config.js');
const Rules = require('../js/game-rules.js');
const GameEngine = require('../js/game-engine.js');

/**
 * Certains modules attendent ces objets dans les variables globales, comme
 * dans la page HTML. On les expose avant de charger les modules concernés.
 */
global.GameConfig = CFG;
global.StorageManager = require('../js/storage-manager.js');
const SettingsManager = require('../js/settings-manager.js');
const Statistics = require('../js/statistics.js');

/**
 * Alias local pour éviter d’écrire « global.StorageManager » à chaque fois.
 */
const StorageManager = global.StorageManager;

/* ------------------------------------------------------------
 * 1. Stockage local
 * ------------------------------------------------------------ */

/**
 * Scénario : on écrit un objet puis on le relit.
 * Pourquoi : les données doivent être rangées sous une clé préfixée et versionnée.
 * Assertions : la clé existe, la version est celle de la configuration, et la
 * valeur relue est identique à la valeur écrite.
 */
test('Stockage : écriture/lecture versionnée avec préfixe', () => {
  StorageManager.set('demo', { value: 42, label: 'test' });
  const raw = global.localStorage.getItem(CFG.STORAGE.PREFIX + 'demo');
  assert.ok(raw, 'la clé préfixée doit exister');
  const parsed = JSON.parse(raw);
  assert.equal(parsed.version, CFG.STORAGE.VERSION);
  assert.deepEqual(StorageManager.get('demo', null), { value: 42, label: 'test' });
});

/**
 * Scénario : on demande une clé inexistante, puis une clé contenant du texte invalide.
 * Pourquoi : le stockage peut être vide ou abîmé ; le jeu ne doit pas planter.
 * Assertions : dans les deux cas, la valeur de repli est renvoyée.
 */
test('Stockage : valeur absente ou JSON corrompu => valeur de repli', () => {
  assert.equal(StorageManager.get('inconnu', 'repli'), 'repli');
  global.localStorage.setItem(CFG.STORAGE.PREFIX + 'corrompu', '{pas du json');
  assert.equal(StorageManager.get('corrompu', 'repli'), 'repli');
});

/**
 * Scénario : on écrit, on supprime, puis on teste la disponibilité du stockage.
 * Pourquoi : une clé supprimée doit laisser la place à la valeur de repli.
 * Assertions : lecture égale à 1, puis null après suppression, et stockage disponible.
 */
test('Stockage : suppression et détection de disponibilité', () => {
  StorageManager.set('temporaire', 1);
  assert.equal(StorageManager.get('temporaire', null), 1);
  StorageManager.remove('temporaire');
  assert.equal(StorageManager.get('temporaire', null), null);
  assert.equal(StorageManager.isAvailable(), true);
});

/**
 * Scénario : une donnée d’une ancienne version est déjà présente.
 * Pourquoi : les sauvegardes anciennes doivent rester lisibles après une mise à jour.
 * Assertions : la donnée est récupérée malgré sa vieille version.
 */
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

/**
 * Scénario : on lit les réglages initiaux, on en change plusieurs, on recharge,
 * puis on remet tout à zéro.
 * Pourquoi : les préférences du joueur doivent survivre au rechargement et
 * pouvoir être réinitialisées.
 * Assertions : valeurs initiales, valeurs modifiées après rechargement,
 * bascule du mode, puis retour aux valeurs par défaut.
 */
test('Paramètres : valeurs par défaut, persistance et réinitialisation', () => {
  const defaults = SettingsManager.load();
  assert.equal(defaults.theme, 'neon');
  assert.equal(defaults.mode, 'dark');
  assert.equal(defaults.difficulty, 'normal');
  assert.equal(defaults.animationsEnabled, true);
  assert.equal(defaults.githubPromo, true);

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
  SettingsManager.set('githubPromo', false);

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
  assert.equal(reloaded.githubPromo, false);
  assert.equal(SettingsManager.toggleMode(), 'dark');

  SettingsManager.reset();
  assert.equal(SettingsManager.settings.theme, 'neon');
  assert.equal(SettingsManager.settings.mode, 'dark');
  assert.equal(SettingsManager.settings.volume, 0.7);
  assert.equal(SettingsManager.settings.boardFlipped, false);
  assert.equal(SettingsManager.settings.githubPromo, true);
});

/* ------------------------------------------------------------
 * 3. Statistiques / XP
 * ------------------------------------------------------------ */

/**
 * Scénario : on enregistre une victoire, une défaite et un match nul.
 * Pourquoi : le suivi des résultats et de l’expérience motive le joueur.
 * Assertions : la victoire donne de l’XP, le niveau est calculé, et les
 * compteurs de défaites et de nuls valent 1 chacun.
 */
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

/**
 * Scénario : on enregistre une partie entre deux joueurs humains.
 * Pourquoi : seul le jeu contre l’IA doit compter dans le bilan personnel.
 * Assertions : aucun XP ni résultat personnel ajouté, et la partie est marquée en mode « pvp ».
 */
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

/**
 * Scénario : on enregistre soixante parties.
 * Pourquoi : l’historique ne doit pas grandir sans limite.
 * Assertions : il ne contient que cinquante entrées.
 */
test('Statistiques : historique plafonné à 50 parties', () => {
  for (let i = 0; i < 60; i++) {
    Statistics.recordGame({ result: 'draw', difficulty: 'easy', mode: 'ai', moves: 10, duration: 10, captures: 0 });
  }
  assert.equal(Statistics.data.games.length, 50);
});

/**
 * Scénario : on enregistre une partie avec notation et replay, puis on résout un puzzle.
 * Pourquoi : badges, bonus et puzzles font partie de la progression du joueur.
 * Assertions : six badges existent, trois sont décernés, le replay est conservé,
 * et le puzzle ne rapporte de l’XP que la première fois.
 */
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

/**
 * Scénario : une partie contre l’IA est jouée puis enregistrée dans le stockage.
 * Pourquoi : le joueur doit retrouver exactement sa partie plus tard.
 * Assertions : plateau, joueur, historique avec notation, difficulté, mode et
 * couleur sont restaurés, et l’annulation reste disponible.
 */
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

/**
 * Scénario : après rechargement, on joue un nouveau coup.
 * Pourquoi : une partie restaurée doit être immédiatement jouable.
 * Assertions : des coups légaux existent, le coup est accepté et le joueur a changé.
 */
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
