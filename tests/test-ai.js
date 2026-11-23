/**
 * CHECKERS LEGEND 2026 — Tests automatisés de l'IA
 * Exécution : node --test tests/
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const CFG = require('../config/game-config.js');
const Rules = require('../js/game-rules.js');
const AI = require('../js/ai-engine.js');

const W = CFG.WHITE_MAN, WK = CFG.WHITE_KING, B = CFG.BLACK_MAN, BK = CFG.BLACK_KING;
const sq = (r, c) => r * 10 + c;

/* ============================================================
 * 1. Légalité et robustesse
 * ============================================================ */

test('IA : coup légal dans la position initiale (toutes difficultés)', () => {
  for (const difficulty of ['easy', 'normal', 'hard', 'expert']) {
    const board = Rules.createInitialBoard();
    const result = AI.search(board, CFG.WHITE, { difficulty, timeMs: 400 });
    assert.ok(result.move, `un coup doit être proposé (${difficulty})`);
    const legal = Rules.getLegalMoves(board, CFG.WHITE);
    assert.ok(legal.some(m => m.from === result.move.from && m.to === result.move.to),
      `coup légal attendu (${difficulty})`);
  }
});

test('IA : trouve une capture immédiate', () => {
  const board = Rules.boardFromPieces({
    [W]: [sq(5, 4), sq(8, 1)],
    [B]: [sq(4, 3)]
  });
  const result = AI.search(board, CFG.WHITE, { difficulty: 'normal', timeMs: 800 });
  assert.ok(result.move.isCapture);
  assert.equal(result.move.to, sq(3, 2));
  assert.deepEqual(result.move.captures, [sq(4, 3)]);
});

test('IA : choisit la prise majoritaire', () => {
  const board = Rules.boardFromPieces({
    [W]: [sq(5, 4), sq(5, 6)],
    [B]: [sq(4, 3), sq(2, 1), sq(6, 5)]
  });
  const result = AI.search(board, CFG.WHITE, { difficulty: 'normal', timeMs: 800 });
  assert.equal(result.move.captures.length, 2);
});

test('IA : évite de perdre une pièce inutilement', () => {
  // Blanc peut jouer 54->43 (case attaquée par la dame noire en 98) ou 54->45 (sûre).
  const board = Rules.boardFromPieces({
    [W]: [sq(5, 4)],
    [BK]: [sq(9, 8)]
  });
  const result = AI.search(board, CFG.WHITE, { difficulty: 'hard', timeMs: 2500 });
  assert.equal(result.move.to, sq(4, 5), 'le coup sûr 54->45 doit être choisi');
});

test('IA : mat en un coup (dernière pièce adverse capturable)', () => {
  const board = Rules.boardFromPieces({
    [WK]: [sq(5, 4)],
    [B]: [sq(2, 1)]
  });
  const result = AI.search(board, CFG.WHITE, { difficulty: 'normal', timeMs: 800 });
  assert.ok(result.move.isCapture);
  assert.equal(result.move.to, sq(1, 0));
  const after = Rules.applyMove(board, result.move);
  assert.equal(Rules.countPieces(after, CFG.BLACK).total, 0);
});

/* ============================================================
 * 2. Performance et limite de temps
 * ============================================================ */

test('IA : respecte la limite de temps', () => {
  const board = Rules.createInitialBoard();
  const started = Date.now();
  const result = AI.search(board, CFG.WHITE, { difficulty: 'expert', timeMs: 500 });
  const elapsed = Date.now() - started;
  assert.ok(elapsed < 2500, `recherche trop longue : ${elapsed} ms`);
  assert.ok(result.nodes > 0);
  assert.ok(result.depth >= 1);
});

test('IA : la profondeur atteinte augmente avec le temps alloué', () => {
  const board = Rules.createInitialBoard();
  const quick = AI.search(board, CFG.WHITE, { difficulty: 'expert', timeMs: 150 });
  const slow = AI.search(board, CFG.WHITE, { difficulty: 'expert', timeMs: 900 });
  assert.ok(slow.depth >= quick.depth);
  assert.ok(slow.nodes >= quick.nodes);
});

/* ============================================================
 * 3. Évaluation et hash
 * ============================================================ */

test('Évaluation : symétrique hors bonus de tempo', () => {
  const board = Rules.createInitialBoard();
  const whiteScore = AI.evaluate(board, CFG.WHITE);
  const blackScore = AI.evaluate(board, CFG.BLACK);
  // Chaque camp reçoit le bonus de tempo de son point de vue.
  assert.equal(whiteScore - CFG.EVAL.TEMPO + 0, -(blackScore - CFG.EVAL.TEMPO) + 0);
});

test('Zobrist : hash cohérent et sensible au joueur', () => {
  const board = Rules.createInitialBoard();
  const h1 = AI.computeHash(board, CFG.WHITE);
  const h2 = AI.computeHash(board, CFG.WHITE);
  const h3 = AI.computeHash(board, CFG.BLACK);
  assert.equal(h1, h2);
  assert.notEqual(h1, h3);

  const move = Rules.getLegalMoves(board, CFG.WHITE)[0];
  const applied = AI.applyMoveWithHash(board, move, h1);
  const expected = AI.computeHash(applied.board, CFG.BLACK);
  assert.equal(applied.hash, expected, 'le hash incrémental doit correspondre au hash complet');
});

/* ============================================================
 * 4. Parties complètes IA vs IA (légalité de tous les coups)
 * ============================================================ */

test('IA vs IA : 20 demi-coups, tous légaux, aucune erreur', () => {
  let board = Rules.createInitialBoard();
  let player = CFG.WHITE;
  let plies = 0;
  let gameOver = false;

  for (let i = 0; i < 20; i++) {
    const legal = Rules.getLegalMoves(board, player);
    if (legal.length === 0) { gameOver = true; break; }
    const result = AI.search(board, player, { difficulty: 'easy', timeMs: 120 });
    assert.ok(result.move, 'un coup doit être proposé');
    assert.ok(legal.some(m =>
      m.from === result.move.from && m.to === result.move.to &&
      m.captures.length === result.move.captures.length
    ), `coup légal attendu au demi-coup ${i}`);

    board = Rules.applyMove(board, result.move);
    player = Rules.otherPlayer(player);
    plies++;
  }

  assert.equal(plies, gameOver ? plies : 20);
  assert.ok(Rules.countPieces(board, CFG.WHITE).total > 0 || Rules.countPieces(board, CFG.BLACK).total > 0);
});

/* ============================================================
 * 5. Position vide de coups
 * ============================================================ */

test('IA : aucun coup disponible => move null', () => {
  const board = Rules.boardFromPieces({
    [B]: [sq(1, 0)],
    [W]: [sq(2, 1), sq(3, 2)]
  });
  const result = AI.search(board, CFG.BLACK, { difficulty: 'easy', timeMs: 200 });
  assert.equal(result.move, null);
});
