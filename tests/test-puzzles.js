/**
 * CHECKERS LEGEND 2026 — Tests des puzzles tactiques
 * Exécution : node --test tests/test-puzzles.js
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const CFG = require('../config/game-config.js');
const Rules = require('../js/game-rules.js');

global.GameConfig = CFG;
global.CheckersRules = Rules;
const Puzzles = require('../js/puzzles.js');

test('Catalogue : six puzzles uniques, avec titre, niveau et indice', () => {
  assert.equal(Puzzles.list.length, 6);
  const ids = Puzzles.list.map((p) => p.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const puzzle of Puzzles.list) {
    assert.ok(puzzle.title && puzzle.level && puzzle.hint);
    assert.equal(puzzle.player, CFG.WHITE);
  }
});

test('getById : recherche exacte et retour null si absent', () => {
  assert.equal(Puzzles.getById('prise-simple').title, 'La prise oubliée');
  assert.equal(Puzzles.getById('inconnu'), null);
});

test('Puzzle du jour : déterministe et présent dans le catalogue', () => {
  const daily = Puzzles.daily();
  assert.deepEqual(daily, Puzzles.daily());
  assert.ok(Puzzles.list.some((p) => p.id === daily.id));
});

test('Validation : toutes les positions et solutions sont jouables', () => {
  const result = Puzzles.validate(Rules);
  assert.deepEqual(result.errors, []);
  assert.equal(result.ok, true);
});

test('Validation : une solution impossible est détectée', () => {
  const original = Puzzles.list[0];
  original.solution = [{ from: 34, captures: [99], to: 12 }];
  const result = Puzzles.validate(Rules);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.indexOf('prise-simple') === 0));
  original.solution = [{ from: 34, captures: [23], to: 12 }];
  assert.equal(Puzzles.validate(Rules).ok, true);
});

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

test('Dames volantes : les atterrissages sont désormais explicites', () => {
  for (const id of ['dame-volante', 'capture-arriere', 'grande-diagonale']) {
    const step = Puzzles.getById(id).solution[0];
    assert.equal(typeof step.to, 'number', id + ' doit préciser la case d’atterrissage');
  }
});
