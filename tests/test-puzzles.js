/**
 * CHECKERS LEGEND 2026 — Tests des puzzles tactiques
 * Exécution : node --test tests/test-puzzles.js
 */
/**
 * NOTE PÉDAGOGIQUE (débutant)
 *
 * Ce fichier vérifie le catalogue de puzzles tactiques : contenu, recherche,
 * puzzle du jour, validation des solutions et navigation entre puzzles.
 *
 * Les modules du projet sont de style CommonJS : ils exportent leurs fonctions
 * avec module.exports et se chargent avec require(). Certains lisent la
 * configuration et les règles dans les variables globales, c’est pourquoi on
 * les expose avant de charger le catalogue.
 *
 * node:test fournit test() (describe() permettrait de regrouper, inutile ici)
 * et assert compare les résultats. Le titre d’un test ne doit pas changer car
 * les documents du projet le citent.
 *
 * Lancer ce seul fichier : node --test tests/test-puzzles.js
 */
'use strict';

/**
 * Import du lanceur de tests et des vérifications.
 */
const test = require('node:test');
const assert = require('node:assert/strict');

const CFG = require('../config/game-config.js');
const Rules = require('../js/game-rules.js');

/**
 * Exposition de la configuration et des règles comme variables globales,
 * avant de charger le module des puzzles qui les attend.
 */
global.GameConfig = CFG;
global.CheckersRules = Rules;
const Puzzles = require('../js/puzzles.js');

/**
 * Scénario : on inspecte la liste des puzzles.
 * Pourquoi : le catalogue doit être complet et exploitable par l’interface.
 * Assertions : six puzzles, identifiants uniques, titre, niveau et indice
 * présents, et camp du joueur toujours blanc.
 */
test('Catalogue : six puzzles uniques, avec titre, niveau et indice', () => {
  assert.equal(Puzzles.list.length, 6);
  const ids = Puzzles.list.map((p) => p.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const puzzle of Puzzles.list) {
    assert.ok(puzzle.title && puzzle.level && puzzle.hint);
    assert.equal(puzzle.player, CFG.WHITE);
  }
});

/**
 * Scénario : recherche d’un puzzle existant puis d’un identifiant inconnu.
 * Pourquoi : l’interface doit pouvoir récupérer un puzzle et gérer un échec.
 * Assertions : le bon titre est renvoyé, et « null » pour un identifiant absent.
 */
test('getById : recherche exacte et retour null si absent', () => {
  assert.equal(Puzzles.getById('prise-simple').title, 'La prise oubliée');
  assert.equal(Puzzles.getById('inconnu'), null);
});

/**
 * Scénario : on demande le puzzle du jour deux fois de suite.
 * Pourquoi : il doit être identique pour tout le monde et faire partie du catalogue.
 * Assertions : les deux appels donnent le même résultat et son identifiant existe.
 */
test('Puzzle du jour : déterministe et présent dans le catalogue', () => {
  const daily = Puzzles.daily();
  assert.deepEqual(daily, Puzzles.daily());
  assert.ok(Puzzles.list.some((p) => p.id === daily.id));
});

/**
 * Scénario : on valide l’ensemble du catalogue.
 * Pourquoi : une erreur dans un puzzle le rendrait injouable.
 * Assertions : aucune erreur n’est signalée et la validation réussit.
 */
test('Validation : toutes les positions et solutions sont jouables', () => {
  const result = Puzzles.validate(Rules);
  assert.deepEqual(result.errors, []);
  assert.equal(result.ok, true);
});

/**
 * Scénario : on remplace provisoirement une solution par un coup impossible,
 * puis on la remet en place.
 * Pourquoi : le validateur doit détecter une mauvaise solution.
 * Assertions : la validation échoue en citant le puzzle, puis redevient correcte.
 */
test('Validation : une solution impossible est détectée', () => {
  const original = Puzzles.list[0];
  original.solution = [{ from: 34, captures: [99], to: 12 }];
  const result = Puzzles.validate(Rules);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.indexOf('prise-simple') === 0));
  original.solution = [{ from: 34, captures: [23], to: 12 }];
  assert.equal(Puzzles.validate(Rules).ok, true);
});

/**
 * Scénario : on rejoue chaque solution sur le plateau de départ du puzzle.
 * Pourquoi : une solution doit être légalement jouable et retirer les pièces annoncées.
 * Assertions : chaque coup existe parmi les coups légaux, les pièces cibles sont
 * présentes avant, et elles sont vides après le coup.
 */
test('Solutions : chaque coup est légal et retire les pièces annoncées', () => {
  for (const puzzle of Puzzles.list) {
    let board = Rules.boardFromPieces(puzzle.spec);
    for (const step of puzzle.solution) {
      const move = Rules.getLegalMoves(board, puzzle.player).find((m) =>
        m.from === step.from && m.to === step.to &&
        m.captures.slice().sort().join(',') === step.captures.slice().sort().join(','));
      assert.ok(move, 'coup introuvable pour ' + puzzle.id);
      for (const captured of step.captures) assert.notEqual(board[captured], CFG.EMPTY);
      board = Rules.applyMove(board, move);
      for (const captured of step.captures) assert.equal(board[captured], CFG.EMPTY);
    }
  }
});

/**
 * Scénario : on parcourt tout le catalogue avec la fonction « suivant ».
 * Pourquoi : le bouton doit faire le tour et revenir au premier puzzle.
 * Assertions : chaque puzzle est visité une fois et le dernier ramène au premier.
 */
test('Puzzle suivant : parcours cyclique de tout le catalogue', () => {
  const visited = [];
  let current = Puzzles.list[0];
  for (let i = 0; i < Puzzles.list.length; i++) {
    current = Puzzles.next(current.id);
    visited.push(current.id);
  }
  assert.equal(new Set(visited).size, Puzzles.list.length);
  assert.equal(Puzzles.next(Puzzles.list[Puzzles.list.length - 1].id).id, Puzzles.list[0].id);
});

/**
 * Scénario : on vérifie que trois puzzles précisent la case d’atterrissage.
 * Pourquoi : pour une dame, indiquer seulement la pièce prise ne suffit pas.
 * Assertions : la première étape contient bien un numéro de case.
 */
test('Dames volantes : les atterrissages sont désormais explicites', () => {
  for (const id of ['dame-volante', 'capture-arriere', 'grande-diagonale']) {
    const step = Puzzles.getById(id).solution[0];
    assert.equal(typeof step.to, 'number', id + ' doit préciser la case d’atterrissage');
  }
});
