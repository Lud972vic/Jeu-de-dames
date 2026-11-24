/**
 * CHECKERS LEGEND 2026 — Tests automatisés de l'IA
 * Exécution : node --test tests/
 */
/**
 * NOTE PÉDAGOGIQUE (débutant)
 *
 * Ce fichier vérifie l’intelligence artificielle : légalité des coups,
 * qualité des prises, respect du temps imparti, évaluation, signature des
 * positions et parties IA contre IA.
 *
 * node:test est le lanceur de tests intégré à Node.js. Chaque test() décrit
 * un scénario et son titre doit rester inchangé car les documents le citent.
 * describe est un outil du même module pour regrouper des tests ; ici les
 * tests sont écrits directement. assert (node:assert/strict) compare les
 * résultats : une vérification fausse fait échouer le test.
 *
 * Lancer ce seul fichier : node --test tests/test-ai.js
 *
 * Concepts JS : require() charge les modules CommonJS, les boucles parcourent
 * les difficultés ou les coups, et Date.now() mesure le temps de recherche.
 */
'use strict';

/**
 * Import du lanceur de tests, des vérifications et des modules du jeu à tester.
 */
const test = require('node:test');
const assert = require('node:assert/strict');

const CFG = require('../config/game-config.js');
const Rules = require('../js/game-rules.js');
const AI = require('../js/ai-engine.js');

/**
 * Raccourcis pour les quatre types de pièces utilisés dans les plateaux de test.
 */
const W = CFG.WHITE_MAN, WK = CFG.WHITE_KING, B = CFG.BLACK_MAN, BK = CFG.BLACK_KING;
/**
 * Convertit une position (ligne, colonne) en numéro de case sur un plateau
 * plat de 100 cases.
 */
const sq = (r, c) => r * 10 + c;

/* ============================================================
 * 1. Légalité et robustesse
 * ============================================================ */

/**
 * Scénario : on demande un coup à l’IA pour chaque niveau de difficulté.
 * Pourquoi : sans coup proposé, la partie contre l’IA serait bloquée.
 * Assertions : un coup est renvoyé pour chaque difficulté et il appartient
 * à la liste des coups légaux.
 */
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

/**
 * Scénario : une prise simple est disponible.
 * Pourquoi : l’IA doit savoir prendre lorsqu’une prise existe.
 * Assertions : le coup est une capture vers (3,2) qui retire le pion en (4,3).
 */
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

/**
 * Scénario : deux prises de longueurs différentes sont possibles.
 * Pourquoi : l’IA doit respecter la règle de la capture maximale.
 * Assertions : le coup choisi capture exactement deux pièces.
 */
test('IA : choisit la prise majoritaire', () => {
  const board = Rules.boardFromPieces({
    [W]: [sq(5, 4), sq(5, 6)],
    [B]: [sq(4, 3), sq(2, 1), sq(6, 5)]
  });
  const result = AI.search(board, CFG.WHITE, { difficulty: 'normal', timeMs: 800 });
  assert.equal(result.move.captures.length, 2);
});

/**
 * Scénario : deux déplacements, dont un expose un pion à une dame adverse.
 * Pourquoi : l’IA doit anticiper et éviter un coup qui perd une pièce.
 * Assertions : elle choisit la destination sûre (4,5).
 */
test('IA : évite de perdre une pièce inutilement', () => {
  // Blanc peut jouer 54->43 (case attaquée par la dame noire en 98) ou 54->45 (sûre).
  const board = Rules.boardFromPieces({
    [W]: [sq(5, 4)],
    [BK]: [sq(9, 8)]
  });
  const result = AI.search(board, CFG.WHITE, { difficulty: 'hard', timeMs: 2500 });
  assert.equal(result.move.to, sq(4, 5), 'le coup sûr 54->45 doit être choisi');
});

/**
 * Scénario : une dame blanche peut capturer le dernier pion noir.
 * Pourquoi : l’IA doit conclure lorsqu’elle peut gagner tout de suite.
 * Assertions : le coup est une prise vers (1,0) et plus aucun pion noir ne reste.
 */
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

/**
 * Scénario : recherche la plus difficile avec 500 millisecondes imparties.
 * Pourquoi : l’IA doit s’arrêter à temps pour ne pas figer le jeu.
 * Assertions : la recherche dure moins de 2,5 secondes, explore des nœuds
 * et atteint au moins une profondeur de 1.
 */
test('IA : respecte la limite de temps', () => {
  const board = Rules.createInitialBoard();
  const started = Date.now();
  const result = AI.search(board, CFG.WHITE, { difficulty: 'expert', timeMs: 500 });
  const elapsed = Date.now() - started;
  assert.ok(elapsed < 2500, `recherche trop longue : ${elapsed} ms`);
  assert.ok(result.nodes > 0);
  assert.ok(result.depth >= 1);
});

/**
 * Scénario : on compare une recherche de 150 ms et une de 900 ms.
 * Pourquoi : plus de temps doit permettre d’explorer plus loin.
 * Assertions : la recherche lente a une profondeur et un nombre de nœuds
 * au moins égaux à ceux de la recherche rapide.
 */
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

/**
 * Scénario : on évalue le même plateau du point de vue des deux camps.
 * Pourquoi : l’évaluation doit être équitable, à part le bonus de temps propre à chaque camp.
 * Assertions : les deux scores sont opposés une fois ce bonus retiré.
 */
test('Évaluation : symétrique hors bonus de tempo', () => {
  const board = Rules.createInitialBoard();
  const whiteScore = AI.evaluate(board, CFG.WHITE);
  const blackScore = AI.evaluate(board, CFG.BLACK);
  // Chaque camp reçoit le bonus de tempo de son point de vue.
  assert.equal(whiteScore - CFG.EVAL.TEMPO + 0, -(blackScore - CFG.EVAL.TEMPO) + 0);
});

/**
 * Scénario : on calcule la signature d’un plateau, puis après un coup.
 * Pourquoi : cette signature sert à reconnaître les positions déjà vues
 * sans recalculer tout le plateau.
 * Assertions : deux appels identiques donnent la même valeur, changer de
 * joueur la modifie, et la mise à jour après un coup donne la même valeur
 * qu’un calcul complet.
 */
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

/**
 * Scénario : vingt demi-coups joués par l’IA des deux côtés.
 * Pourquoi : vérifier qu’elle ne propose jamais un coup illégal, même après
 * plusieurs tours.
 * Assertions : chaque coup proposé est légal et il reste au moins une pièce.
 */
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

/**
 * Scénario : le joueur noir est complètement bloqué.
 * Pourquoi : l’IA doit retourner un coup nul plutôt que de planter.
 * Assertions : le résultat indique explicitement l’absence de coup.
 */
test('IA : aucun coup disponible => move null', () => {
  const board = Rules.boardFromPieces({
    [B]: [sq(1, 0)],
    [W]: [sq(2, 1), sq(3, 2)]
  });
  const result = AI.search(board, CFG.BLACK, { difficulty: 'easy', timeMs: 200 });
  assert.equal(result.move, null);
});
