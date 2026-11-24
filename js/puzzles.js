/**
 * CHECKERS LEGEND 2026 — Puzzles tactiques
 * -----------------------------------------
 * Petites positions à résoudre (prises forcées, rafles, promotions).
 * Les plateaux sont décrits avec CheckersRules.boardFromPieces() :
 *   1 = pion blanc, 2 = dame blanche, 3 = pion noir, 4 = dame noire.
 * Chaque solution décrit les coups attendus : { from, captures[, to] }.
 * Sans `to`, toutes les cases d'atterrissage capturant les bonnes pièces
 * sont acceptées (cas des dames volantes).
 */
(function (global) {
  'use strict';

  const CFG = global.GameConfig;

  const PUZZLES = [
    {
      id: 'prise-simple',
      title: 'La prise oubliée',
      level: 'Débutant',
      hint: 'Un pion peut sauter par-dessus la pièce adverse, même vers l’avant.',
      spec: { 1: [34], 3: [23] },
      player: CFG.WHITE,
      solution: [{ from: 34, captures: [23], to: 12 }]
    },
    {
      id: 'double-rafle',
      title: 'La double rafle',
      level: 'Intermédiaire',
      hint: 'Une capture en appelle souvent une autre : ne vous arrêtez pas au premier saut.',
      spec: { 1: [54], 3: [43, 21] },
      player: CFG.WHITE,
      solution: [{ from: 54, captures: [43, 21], to: 10 }]
    },
    {
      id: 'promotion',
      title: 'Dernière ligne',
      level: 'Intermédiaire',
      hint: 'Terminez la rafle sur la dernière rangée pour devenir dame.',
      spec: { 1: [23], 3: [12] },
      player: CFG.WHITE,
      solution: [{ from: 23, captures: [12], to: 1 }]
    },
    {
      id: 'dame-volante',
      title: 'La dame volante',
      level: 'Avancé',
      hint: 'La dame capture à distance : prolongez la rafle sur la même diagonale.',
      spec: { 2: [70], 3: [52, 25] },
      player: CFG.WHITE,
      solution: [{ from: 70, captures: [52, 25], to: 16 }]
    },
    {
      id: 'capture-arriere',
      title: 'Par derrière',
      level: 'Débutant',
      hint: 'La dame capture aussi en arrière : ici l’adversaire est sous la dame.',
      spec: { 2: [45], 3: [56] },
      player: CFG.WHITE,
      solution: [{ from: 45, captures: [56], to: 67 }]
    },
    {
      id: 'grande-diagonale',
      title: 'Grande diagonale',
      level: 'Avancé',
      hint: 'Deux sauts sur une même diagonale, du haut vers le bas.',
      spec: { 2: [12], 3: [34, 56] },
      player: CFG.WHITE,
      solution: [{ from: 12, captures: [34, 56], to: 78 }]
    }
  ];

  const sameSquares = (a, b) => a.slice().sort((x, y) => x - y).join(',') ===
    b.slice().sort((x, y) => x - y).join(',');

  const Puzzles = {
    list: PUZZLES,

    getById(id) {
      return PUZZLES.find((p) => p.id === id) || null;
    },

    /** Puzzle suivant dans la liste, avec retour au premier après le dernier. */
    next(id) {
      const index = PUZZLES.findIndex((p) => p.id === id);
      return PUZZLES[(index + 1) % PUZZLES.length] || PUZZLES[0];
    },

    /**
     * Vérifie la cohérence de toutes les positions et solutions.
     * @param {object} rules module de règles (CheckersRules), optionnel en navigateur
     * @returns {{ok: boolean, errors: string[]}}
     */
    validate(rules) {
      const engine = rules || global.CheckersRules;
      const errors = [];
      if (!engine) return { ok: false, errors: ['Module de règles indisponible.'] };

      const ids = new Set();
      for (const puzzle of PUZZLES) {
        const label = puzzle.id || '(id manquant)';
        if (!puzzle.id || ids.has(puzzle.id)) errors.push(label + ' : identifiant manquant ou dupliqué.');
        ids.add(puzzle.id);
        if (!puzzle.title || !puzzle.hint || !puzzle.level) {
          errors.push(label + ' : titre, indice ou niveau manquant.');
        }
        if (puzzle.player !== CFG.WHITE && puzzle.player !== CFG.BLACK) {
          errors.push(label + ' : joueur invalide.');
        }

        const board = engine.boardFromPieces(puzzle.spec);
        for (const entry of Object.keys(puzzle.spec)) {
          const code = Number(entry);
          if (![CFG.WHITE_MAN, CFG.WHITE_KING, CFG.BLACK_MAN, CFG.BLACK_KING].includes(code)) {
            errors.push(label + ' : code de pièce inconnu (' + entry + ').');
          }
          for (const square of puzzle.spec[entry]) {
            if (!Number.isInteger(square) || square < 0 || square > 99 || board[square] !== code) {
              errors.push(label + ' : case ' + square + ' invalide pour la pièce ' + entry + '.');
            }
          }
        }

        if (!Array.isArray(puzzle.solution) || puzzle.solution.length === 0) {
          errors.push(label + ' : solution vide.');
          continue;
        }
        let current = board;
        for (const step of puzzle.solution) {
          const moves = engine.getLegalMoves(current, puzzle.player);
          const found = moves.find((move) => move.from === step.from &&
            Array.isArray(step.captures) && sameSquares(move.captures, step.captures) &&
            (!step.to || move.to === step.to));
          if (!found) {
            errors.push(label + ' : coup de solution introuvable (' + step.from + ' → ' + step.to + ').');
            break;
          }
          current = engine.applyMove(current, found);
        }
      }
      return { ok: errors.length === 0, errors: errors };
    },

    /** Puzzle déterministe du jour (même résultat pour tout le monde). */
    daily() {
      const now = new Date();
      const key = now.getFullYear() * 10000 + (now.getMonth() + 1) * 100 + now.getDate();
      return PUZZLES[key % PUZZLES.length];
    }
  };

  global.CheckersPuzzles = Puzzles;
  if (typeof module !== 'undefined' && module.exports) module.exports = Puzzles;
})(typeof globalThis !== 'undefined' ? globalThis : this);
