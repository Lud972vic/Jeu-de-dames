/**
 * CHECKERS LEGEND 2026 — Tests automatisés du moteur de règles
 * Exécution : node --test tests/
 * Aucune dépendance externe (node:test + node:assert natifs).
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const CFG = require('../config/game-config.js');
const Rules = require('../js/game-rules.js');
const GameEngine = require('../js/game-engine.js');

const W = CFG.WHITE_MAN, WK = CFG.WHITE_KING, B = CFG.BLACK_MAN, BK = CFG.BLACK_KING;
const sq = (r, c) => r * 10 + c;

function movesFrom(moves, from) {
  return moves.filter(m => m.from === from);
}

/* ============================================================
 * 1. Plateau initial
 * ============================================================ */

test('Plateau initial : 20 pions par joueur, Blancs au trait', () => {
  const board = Rules.createInitialBoard();
  assert.equal(Rules.countPieces(board, CFG.WHITE).total, 20);
  assert.equal(Rules.countPieces(board, CFG.BLACK).total, 20);
  assert.equal(Rules.countPieces(board, CFG.WHITE).men, 20);
  assert.equal(Rules.countPieces(board, CFG.BLACK).men, 20);
  // 9 déplacements possibles au premier coup (pions de la rangée 6)
  const moves = Rules.getLegalMoves(board, CFG.WHITE);
  assert.equal(moves.length, 9);
});

test('Cases jouables : uniquement les cases sombres', () => {
  const board = Rules.createInitialBoard();
  for (let r = 0; r < 10; r++) {
    for (let c = 0; c < 10; c++) {
      const idx = sq(r, c);
      if ((r + c) % 2 === 0) assert.equal(board[idx], CFG.EMPTY, `case claire ${r},${c} doit être vide`);
    }
  }
});

/* ============================================================
 * 2. Déplacements simples
 * ============================================================ */

test('Pion blanc : déplacement diagonal avant uniquement', () => {
  const board = Rules.boardFromPieces({ [W]: [sq(8, 4)] });
  const moves = Rules.getLegalMoves(board, CFG.WHITE);
  const from = movesFrom(moves, sq(8, 4));
  assert.equal(from.length, 2);
  assert.deepEqual(from.map(m => m.to).sort(), [sq(7, 3), sq(7, 5)].sort());
  assert.ok(from.every(m => !m.isCapture));
});

test('Pion noir : déplacement diagonal avant (vers le bas)', () => {
  const board = Rules.boardFromPieces({ [B]: [sq(1, 4)] });
  const moves = Rules.getLegalMoves(board, CFG.BLACK);
  const from = movesFrom(moves, sq(1, 4));
  assert.deepEqual(from.map(m => m.to).sort(), [sq(2, 3), sq(2, 5)].sort());
});

test('Dame : déplacement à distance sur toute la diagonale', () => {
  const board = Rules.boardFromPieces({ [WK]: [sq(9, 4)] });
  const moves = Rules.getLegalMoves(board, CFG.WHITE);
  assert.equal(moves.length, 9); // 4 vers le haut-gauche + 5 vers le haut-droit
});

test('Dame : bloquée par une pièce amie', () => {
  const board = Rules.boardFromPieces({ [WK]: [sq(9, 4)], [W]: [sq(7, 2)] });
  const moves = Rules.getLegalMoves(board, CFG.WHITE);
  // La diagonale haut-gauche est coupée après (8,3) : 1 seul coup de ce côté
  const from = movesFrom(moves, sq(9, 4));
  assert.ok(from.some(m => m.to === sq(8, 3)));
  assert.ok(!from.some(m => m.to === sq(7, 2)));
  assert.ok(!from.some(m => m.to === sq(6, 1)));
});

/* ============================================================
 * 3. Captures
 * ============================================================ */

test('Capture obligatoire : aucun déplacement simple si une prise existe', () => {
  const board = Rules.boardFromPieces({
    [W]: [sq(5, 4), sq(8, 1)],
    [B]: [sq(4, 3)]
  });
  const moves = Rules.getLegalMoves(board, CFG.WHITE);
  assert.equal(moves.length, 1);
  assert.equal(moves[0].from, sq(5, 4));
  assert.equal(moves[0].to, sq(3, 2));
  assert.deepEqual(moves[0].captures, [sq(4, 3)]);
});

test('Option non réglementaire : prise non obligatoire ajoute les déplacements simples', () => {
  const board = Rules.boardFromPieces({
    [W]: [sq(5, 4), sq(8, 1)],
    [B]: [sq(4, 3)]
  });
  const moves = Rules.getLegalMoves(board, CFG.WHITE, { capturesOptional: true });
  const captures = moves.filter(m => m.isCapture);
  const simple = moves.filter(m => !m.isCapture);
  assert.equal(captures.length, 1);
  assert.deepEqual(captures[0].captures, [sq(4, 3)]);
  assert.ok(simple.length >= 2);
  assert.ok(simple.some(m => m.from === sq(8, 1)));
  // La prise majoritaire reste appliquée parmi les captures.
  assert.ok(moves.every(m => !m.isCapture || m.captures.length === 1));
});

test('Option non réglementaire : capturer conserve le tour (tour bonus)', () => {
  const engine = new GameEngine();
  engine.newGame({ mode: 'pvp', chainCaptures: true });
  engine.board = Rules.boardFromPieces({
    [W]: [sq(5, 4)],
    [B]: [sq(4, 3), sq(9, 0)]
  });
  engine.currentPlayer = CFG.WHITE;
  const move = engine.getLegalMoves().find(m => m.isCapture);
  assert.ok(move);
  assert.equal(engine.playMove(move).ok, true);
  assert.equal(engine.currentPlayer, CFG.WHITE);

  const restored = new GameEngine();
  assert.equal(restored.loadState(engine.serialize()), true);
  assert.equal(restored.ruleOptions.chainCaptures, true);
  assert.equal(restored.ruleOptions.capturesOptional, false);
});

test('Pion : capture vers l’arrière autorisée (règle internationale)', () => {
  const board = Rules.boardFromPieces({
    [W]: [sq(5, 4)],
    [B]: [sq(6, 5)]
  });
  const moves = Rules.getLegalMoves(board, CFG.WHITE);
  assert.equal(moves.length, 1);
  assert.equal(moves[0].to, sq(7, 6));
  assert.deepEqual(moves[0].captures, [sq(6, 5)]);
});

test('Pion : prise multiple enchaînée jusqu’à épuisement', () => {
  const board = Rules.boardFromPieces({
    [W]: [sq(5, 4)],
    [B]: [sq(4, 3), sq(2, 1)]
  });
  const moves = Rules.getLegalMoves(board, CFG.WHITE);
  assert.equal(moves.length, 1);
  assert.deepEqual(moves[0].captures, [sq(4, 3), sq(2, 1)]);
  assert.deepEqual(moves[0].path, [sq(3, 2), sq(1, 0)]);
  assert.equal(moves[0].to, sq(1, 0));
});

test('Prise majoritaire : seule la séquence maximale est légale', () => {
  const board = Rules.boardFromPieces({
    [W]: [sq(5, 4), sq(5, 6)],
    [B]: [sq(4, 3), sq(2, 1), sq(6, 5)]
  });
  const moves = Rules.getLegalMoves(board, CFG.WHITE);
  assert.equal(moves.length, 1);
  assert.equal(moves[0].from, sq(5, 4));
  assert.equal(moves[0].captures.length, 2);
  assert.deepEqual(moves[0].captures, [sq(4, 3), sq(2, 1)]);
});

test('Prise majoritaire : égalité => toutes les séquences maximales autorisées', () => {
  const board = Rules.boardFromPieces({
    [W]: [sq(5, 4), sq(5, 6)],
    [B]: [sq(4, 3), sq(4, 7)]
  });
  const moves = Rules.getLegalMoves(board, CFG.WHITE);
  assert.equal(moves.length, 2);
  assert.ok(moves.every(m => m.captures.length === 1));
});

test('Dame : capture à distance', () => {
  const board = Rules.boardFromPieces({
    [WK]: [sq(5, 4)],
    [B]: [sq(2, 1)]
  });
  const moves = Rules.getLegalMoves(board, CFG.WHITE);
  assert.equal(moves.length, 1);
  assert.equal(moves[0].to, sq(1, 0));
  assert.deepEqual(moves[0].captures, [sq(2, 1)]);
});

test('Dame : capture multiple avec choix de la case d’atterrissage', () => {
  const board = Rules.boardFromPieces({
    [WK]: [sq(9, 4)],
    [B]: [sq(7, 2), sq(4, 3)]
  });
  const moves = Rules.getLegalMoves(board, CFG.WHITE);
  assert.ok(moves.length > 1);
  assert.ok(moves.every(m => m.captures.length === 2));
  assert.ok(moves.every(m => m.captures[0] === sq(7, 2) && m.captures[1] === sq(4, 3)));
});

test('Dame : enchaînement forcé de captures sur la grande diagonale', () => {
  // La dame capture 72, 54, 36 puis 18 ; elle doit atterrir sur la seule case
  // libre au-delà de chaque pièce (les suivantes sont occupées).
  const board = Rules.boardFromPieces({
    [WK]: [sq(9, 0)],
    [B]: [sq(7, 2), sq(5, 4), sq(3, 6), sq(1, 8)]
  });
  const moves = Rules.getLegalMoves(board, CFG.WHITE);
  assert.equal(moves.length, 1);
  assert.deepEqual(moves[0].captures, [sq(7, 2), sq(5, 4), sq(3, 6), sq(1, 8)]);
  assert.deepEqual(moves[0].path, [sq(6, 3), sq(4, 5), sq(2, 7), sq(0, 9)]);
  assert.equal(moves[0].to, sq(0, 9));
});

/* ============================================================
 * 4. Promotion
 * ============================================================ */

test('Promotion : un pion terminant sur la dernière rangée devient dame', () => {
  const board = Rules.boardFromPieces({
    [W]: [sq(2, 1)],
    [B]: [sq(1, 2)]
  });
  const moves = Rules.getLegalMoves(board, CFG.WHITE);
  assert.equal(moves.length, 1);
  assert.equal(moves[0].promotes, true);
  const after = Rules.applyMove(board, moves[0]);
  assert.equal(after[sq(0, 3)], CFG.WHITE_KING);
});

test('Promotion interdite en cours de prise multiple', () => {
  const board = Rules.boardFromPieces({
    [W]: [sq(2, 1)],
    [B]: [sq(1, 2), sq(1, 4)]
  });
  const moves = Rules.getLegalMoves(board, CFG.WHITE);
  assert.equal(moves.length, 1);
  assert.deepEqual(moves[0].captures, [sq(1, 2), sq(1, 4)]);
  assert.equal(moves[0].to, sq(2, 5));
  assert.equal(moves[0].promotes, false);
  const after = Rules.applyMove(board, moves[0]);
  assert.equal(after[sq(2, 5)], CFG.WHITE_MAN, 'le pion reste un pion (pas de promotion en cours de séquence)');
});

/* ============================================================
 * 5. Victoire / match nul
 * ============================================================ */

test('Victoire : adversaire sans pièces', () => {
  const board = Rules.boardFromPieces({ [WK]: [sq(5, 4)] });
  const status = Rules.getGameStatus(board, CFG.BLACK, {});
  assert.equal(status.over, true);
  assert.equal(status.result, CFG.WHITE);
  assert.equal(status.reason, 'no-pieces');
});

test('Victoire : adversaire bloqué (aucun coup légal)', () => {
  const board = Rules.boardFromPieces({
    [B]: [sq(1, 0)],
    [W]: [sq(2, 1), sq(3, 2)] // le pion blanc bloque l’avance ET la case d’atterrissage
  });
  const status = Rules.getGameStatus(board, CFG.BLACK, {});
  assert.equal(status.over, true);
  assert.equal(status.result, CFG.WHITE);
  assert.equal(status.reason, 'no-moves');
});

test('Match nul : triple répétition de position', () => {
  const engine = new GameEngine();
  engine.newGame({ mode: 'pvp' });
  engine.board = Rules.boardFromPieces({
    [WK]: [sq(9, 0)],
    [BK]: [sq(9, 8)]
  });
  engine.currentPlayer = CFG.WHITE;
  engine.positionCounts = new Map();
  engine.pliesSinceProgress = 0;
  engine.status = { over: false };
  engine._registerPosition();

  const cycle = [
    { from: sq(9, 0), to: sq(8, 1) },
    { from: sq(9, 8), to: sq(8, 9) },
    { from: sq(8, 1), to: sq(9, 0) },
    { from: sq(8, 9), to: sq(9, 8) }
  ];

  for (let cycleIdx = 0; cycleIdx < 2; cycleIdx++) {
    for (const mv of cycle) {
      const legal = engine.getLegalMoves().find(m => m.from === mv.from && m.to === mv.to);
      assert.ok(legal, `coup légal attendu ${mv.from}->${mv.to}`);
      const res = engine.playMove(legal);
      assert.equal(res.ok, true);
    }
  }
  assert.equal(engine.status.over, true);
  assert.equal(engine.status.result, 'draw');
  assert.equal(engine.status.reason, 'repetition');
});

test('Match nul : limitation des coups sans progression', () => {
  const config = JSON.parse(JSON.stringify(CFG));
  config.DRAW.MAX_PLIES_WITHOUT_PROGRESS = 6;
  const engine = new GameEngine(config);
  engine.newGame({ mode: 'pvp' });
  engine.board = Rules.boardFromPieces({
    [WK]: [sq(9, 0)],
    [BK]: [sq(9, 8)]
  });
  engine.currentPlayer = CFG.WHITE;
  engine.positionCounts = new Map();
  engine.pliesSinceProgress = 0;
  engine.status = { over: false };
  engine._registerPosition();

  const cycle = [
    { from: sq(9, 0), to: sq(8, 1) },
    { from: sq(9, 8), to: sq(8, 9) },
    { from: sq(8, 1), to: sq(9, 0) },
    { from: sq(8, 9), to: sq(9, 8) }
  ];
  let plies = 0;
  outer:
  for (let cycleIdx = 0; cycleIdx < 3; cycleIdx++) {
    for (const mv of cycle) {
      if (engine.status.over) break outer;
      const legal = engine.getLegalMoves().find(m => m.from === mv.from && m.to === mv.to);
      assert.ok(legal);
      engine.playMove(legal);
      plies++;
    }
  }
  assert.ok(plies >= 6);
  assert.equal(engine.status.over, true);
  assert.equal(engine.status.result, 'draw');
  assert.equal(engine.status.reason, 'no-progress');
});

/* ============================================================
 * 6. Moteur de partie : alternance, coups illégaux, undo, sérialisation
 * ============================================================ */

test('Alternance automatique des joueurs', () => {
  const engine = new GameEngine();
  engine.newGame({ mode: 'pvp' });
  assert.equal(engine.currentPlayer, CFG.WHITE);
  const move = engine.getLegalMoves()[0];
  engine.playMove(move);
  assert.equal(engine.currentPlayer, CFG.BLACK);
});

test('Coup illégal rejeté par le moteur', () => {
  const engine = new GameEngine();
  engine.newGame({ mode: 'pvp' });
  const res = engine.playMove({ from: 99, to: 0, path: [0], captures: [], isCapture: false, promotes: false });
  assert.equal(res.ok, false);
  assert.equal(engine.history.length, 0);
  assert.equal(engine.currentPlayer, CFG.WHITE);
});

test('Annulation (undo) : restaure plateau, joueur et compteurs', () => {
  const engine = new GameEngine();
  engine.newGame({ mode: 'pvp' });
  const initial = engine.board.slice();
  const move = engine.getLegalMoves()[0];
  engine.playMove(move);
  assert.equal(engine.history.length, 1);
  const undone = engine.undo();
  assert.ok(undone);
  assert.deepEqual(engine.board, initial);
  assert.equal(engine.currentPlayer, CFG.WHITE);
  assert.equal(engine.history.length, 0);
  assert.equal(engine.canUndo(), false);
});

test('Sérialisation / rechargement : état identique', () => {
  const engine = new GameEngine();
  engine.newGame({ mode: 'ai', difficulty: 'hard', playerColor: CFG.BLACK });
  for (let i = 0; i < 4; i++) {
    const move = engine.getLegalMoves()[0];
    engine.playMove(move);
  }
  const snapshot = engine.serialize();
  const restored = new GameEngine();
  assert.equal(restored.loadState(snapshot), true);
  assert.deepEqual(restored.board, engine.board);
  assert.equal(restored.currentPlayer, engine.currentPlayer);
  assert.equal(restored.history.length, engine.history.length);
  assert.equal(restored.mode, 'ai');
  assert.equal(restored.difficulty, 'hard');
  assert.equal(restored.playerColor, CFG.BLACK);
});

test('Parties complètes : trois simulations aléatoires se terminent proprement', () => {
  const reasons = new Set(['no-pieces', 'no-moves', 'repetition', 'no-progress']);
  for (let seed = 1; seed <= 3; seed++) {
    let state = seed >>> 0;
    const random = () => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return state / 4294967296;
    };

    const engine = new GameEngine();
    engine.newGame({ mode: 'pvp' });
    let plies = 0;

    while (!engine.status.over && plies < 1000) {
      const moves = engine.getLegalMoves();
      assert.ok(moves.length > 0, 'aucun coup légal alors que la partie continue');
      const move = moves[Math.floor(random() * moves.length)];
      const result = engine.playMove(move);
      assert.equal(result.ok, true, 'coup légal refusé au demi-coup ' + plies);
      plies++;
    }

    assert.equal(engine.status.over, true, 'la partie aléatoire ' + seed + ' ne s’est pas terminée');
    assert.ok(reasons.has(engine.status.reason),
      'raison de fin inattendue : ' + engine.status.reason);
    assert.equal(engine.history.length, plies);
    assert.ok(plies > 0);
    assert.ok(Rules.countPieces(engine.board, CFG.WHITE).total >= 0);
    assert.ok(Rules.countPieces(engine.board, CFG.BLACK).total >= 0);
  }
});

test('Notation des coups : déplacement et prise', () => {
  const board = Rules.boardFromPieces({
    [W]: [sq(5, 4)],
    [B]: [sq(4, 3), sq(2, 1)]
  });
  const move = Rules.getLegalMoves(board, CFG.WHITE)[0];
  // 54 -> 32 -> 10 => cases 28 x 19 x 6 en numérotation internationale
  const notation = Rules.moveNotation(move);
  assert.match(notation, /^\d+x\d+x\d+$/);
  const simple = Rules.moveNotation({ from: sq(5, 4), to: sq(4, 3), path: [sq(4, 3)], captures: [], isCapture: false });
  assert.match(simple, /^\d+-\d+$/);
});
