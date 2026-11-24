/**
 * CHECKERS LEGEND 2026 — Tests des profils et des sauvegardes nommées
 * Exécution : node --test tests/test-profiles.js
 */
/**
 * NOTE PÉDAGOGIQUE (débutant)
 *
 * Ce fichier teste les profils : plusieurs joueurs peuvent avoir des réglages,
 * des statistiques et des sauvegardes séparés. Comme il n’y a pas de navigateur
 * dans Node, on simule localStorage et sessionStorage avec MemoryStorage, une
 * classe qui stocke tout dans une Map en mémoire, ainsi qu’un faux document et
 * un faux matchMedia. Les modules sont chargés avec require() après avoir
 * exposé GameConfig, StorageManager, SettingsManager et Statistics comme
 * variables globales, exactement comme le fait la page HTML.
 *
 * node:test fournit test() (describe() sert à regrouper) et assert vérifie les
 * résultats. Les titres de tests sont cités dans la documentation : ils ne
 * doivent pas changer.
 *
 * Lancer ce seul fichier : node --test tests/test-profiles.js
 */
'use strict';

/**
 * Import du lanceur de tests et des fonctions de vérification.
 */
const test = require('node:test');
const assert = require('node:assert/strict');

/**
 * Faux stockage du navigateur : les clés et les valeurs sont gardées dans une
 * Map, uniquement pendant la durée du test.
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
 * Installation des faux stockages dans les globales avant le chargement des modules.
 */
global.localStorage = new MemoryStorage();
global.sessionStorage = new MemoryStorage();

/**
 * Fausse liste de classes CSS du document : les méthodes ne font rien et
 * « contains » répond toujours faux.
 */
const classList = { toggle() {}, add() {}, remove() {}, contains() { return false; } };
global.document = {
  documentElement: { style: { setProperty() {} } },
  body: { dataset: {}, classList: classList, style: {} }
};
global.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });

/**
 * On charge la configuration, puis on l’expose globalement avec les autres
 * modules attendus par le gestionnaire de profils.
 */
const CFG = require('../config/game-config.js');
global.GameConfig = CFG;
global.StorageManager = require('../js/storage-manager.js');
global.SettingsManager = require('../js/settings-manager.js');
global.Statistics = require('../js/statistics.js');
const Profiles = require('../js/profile-manager.js');

/**
 * Raccourci vers les noms de clés utilisés dans le stockage.
 */
const KEYS = CFG.STORAGE.KEYS;
/**
 * Fabrique la clé de stockage d’un emplacement de sauvegarde nommé.
 */
const slotKey = (slot) => KEYS.SAVE + ':slot' + slot;

/**
 * Fabrique une sauvegarde de l’ancien format : un plateau vide de 100 cases
 * et autant d’entrées d’historique que demandé. Sert à tester la migration.
 */
function legacyGame(moves) {
  return {
    engine: { board: new Array(100).fill(0), history: new Array(moves).fill({ notation: 'x' }) },
    clocks: { white: 1000, black: 1000 },
    unlimited: false,
    config: { mode: 'ai', difficulty: 'normal', timerMinutes: 10 },
    savedAt: Date.now()
  };
}

/**
 * Scénario : des données anciennes existent avant la création du premier profil.
 * Pourquoi : l’arrivée des profils ne doit pas effacer les données d’un joueur déjà là.
 * Assertions : un seul profil est créé, il récupère le nom, les statistiques,
 * la sauvegarde et l’emplacement, et les anciennes clés restent présentes.
 */
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

/**
 * Scénario : on modifie le profil actif, on crée un second profil, puis on revient.
 * Pourquoi : chaque joueur doit retrouver ses propres données sans mélange.
 * Assertions : le nouveau profil démarre vide et les données du premier sont
 * restaurées lors du retour.
 */
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

/**
 * Scénario : on crée une sauvegarde nommée, on change de profil, puis on revient.
 * Pourquoi : ces sauvegardes appartiennent à un seul profil.
 * Assertions : visibles pour leur profil, invisibles pour l’autre, puis supprimables.
 */
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

/**
 * Scénario : on renomme un profil, on le supprime, puis on essaie de supprimer le dernier.
 * Pourquoi : le nom du joueur est recopié dans les réglages, et un profil doit
 * toujours rester disponible.
 * Assertions : renommage effectué, retour au premier profil après suppression,
 * et refus de supprimer le dernier.
 */
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
