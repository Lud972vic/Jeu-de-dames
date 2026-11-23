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
      solution: [{ from: 70, captures: [52, 25] }]
    },
    {
      id: 'capture-arriere',
      title: 'Par derrière',
      level: 'Débutant',
      hint: 'La dame capture aussi en arrière : regardez toutes les diagonales.',
      spec: { 2: [45], 3: [34] },
      player: CFG.WHITE,
      solution: [{ from: 45, captures: [34] }]
    },
    {
      id: 'grande-diagonale',
      title: 'Grande diagonale',
      level: 'Avancé',
      hint: 'Deux sauts sur une même diagonale, du haut vers le bas.',
      spec: { 2: [12], 3: [34, 56] },
      player: CFG.WHITE,
      solution: [{ from: 12, captures: [34, 56] }]
    }
  ];

  const Puzzles = {
    list: PUZZLES,

    getById(id) {
      return PUZZLES.find((p) => p.id === id) || null;
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
