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

/**
 * POUR BIEN DÉBUTER
 * -----------------
 * Un puzzle est un petit objet de données : un titre, un niveau, un indice,
 * une position de départ (spec) et la liste des coups attendus (solution).
 * PUZZLES est un tableau : une liste ordonnée de ces objets.
 *
 * Le plateau n'est pas stocké directement : la « spec » associe un code de pièce
 * à une liste de cases, puis CheckersRules.boardFromPieces() construit le plateau.
 * C'est une façon compacte de décrire une position.
 *
 * Le module utilise les méthodes des tableaux : find() (premier élément trouvé),
 * findIndex() (sa position), slice() (copier avant de trier), sort() (trier),
 * join() (assembler en texte) et Set (ensemble de valeurs uniques, sans doublon).
 * Les nombres de cases vont de 0 à 99 (plateau 10 x 10).
 * Tout est dans une IIFE : seul CheckersPuzzles est rendu public.
 */
(function (global) {
  'use strict';

  // CFG donne les codes de pièces et les identifiants des camps.
  const CFG = global.GameConfig;

  // Schéma d'un puzzle :
  // id = identifiant unique ; title / level / hint = textes affichés ;
  // spec = objet { codeDePièce: [numérosDeCases] } décrivant la position ;
  // player = camp qui joue (CFG.WHITE ou CFG.BLACK) ;
  // solution = liste de coups { from, captures, to? } à jouer dans l'ordre.
  // `to` est facultatif : sans lui, toute case d'atterrissage qui capture les
  // bonnes pièces est acceptée (utile pour les dames qui volent).
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

  /**
   * Compare deux listes de cases sans tenir compte de l'ordre.
   * On copie chaque liste avec slice() avant de la trier, pour ne pas modifier
   * les originaux ; join(',') assemble ensuite les nombres en une seule chaîne.
   * @param {number[]} a première liste de cases.
   * @param {number[]} b deuxième liste de cases.
   * @returns {boolean} true si les deux listes contiennent les mêmes cases.
   */
  const sameSquares = (a, b) => a.slice().sort((x, y) => x - y).join(',') ===
    b.slice().sort((x, y) => x - y).join(',');

  // Objet public : `list` donne accès à tous les puzzles ; les méthodes
  // ci-dessous permettent de les chercher, de les vérifier et d'en choisir un.
  const Puzzles = {
    list: PUZZLES,

    /**
     * Cherche un puzzle par son identifiant.
     * find() renvoie le premier élément qui correspond, ou undefined.
     * @param {string} id identifiant recherché.
     * @returns {object|null} le puzzle trouvé, ou null.
     */
    getById(id) {
      return PUZZLES.find((p) => p.id === id) || null;
    },

    /**
     * Puzzle suivant dans la liste, avec retour au premier après le dernier.
     * Le reste de la division (%) fait le « tour » : après le dernier index,
     * on repart à 0.
     * @param {string} id identifiant du puzzle courant.
     * @returns {object} le puzzle suivant (ou le premier en secours).
     */
    next(id) {
      const index = PUZZLES.findIndex((p) => p.id === id);
      return PUZZLES[(index + 1) % PUZZLES.length] || PUZZLES[0];
    },

    /**
     * Vérifie la cohérence de toutes les positions et solutions.
     * Pour chaque puzzle : identifiant unique, textes présents, codes de pièces
     * valides, cases dans le plateau (0 à 99). Ensuite on « joue » la solution
     * avec le moteur de règles pour vérifier que chaque coup est bien légal.
     * @param {object} rules module de règles (CheckersRules), optionnel en navigateur
     * @returns {{ok: boolean, errors: string[]}} réussite et liste des erreurs trouvées
     */
    validate(rules) {
      const engine = rules || global.CheckersRules;
      const errors = [];
      if (!engine) return { ok: false, errors: ['Module de règles indisponible.'] };

      // Set = ensemble : il ne conserve qu'une fois chaque identifiant,
      // ce qui permet de repérer les doublons.
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
        // On rejoue la solution coup par coup sur un plateau temporaire (current).
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

    /**
     * Puzzle déterministe du jour (même résultat pour tout le monde).
     * La date devient un nombre AAMMJJ ; le reste de ce nombre par le nombre de
     * puzzles donne un index. Ainsi tout le monde voit le même puzzle ce jour-là.
     * @returns {object} le puzzle du jour.
     */
    daily() {
      const now = new Date();
      const key = now.getFullYear() * 10000 + (now.getMonth() + 1) * 100 + now.getDate();
      return PUZZLES[key % PUZZLES.length];
    }
  };

  // Motif UMD : on publie l'objet dans le navigateur (global.CheckersPuzzles)
  // et on l'exporte aussi pour Node (module.exports).
  global.CheckersPuzzles = Puzzles;
  if (typeof module !== 'undefined' && module.exports) module.exports = Puzzles;
})(typeof globalThis !== 'undefined' ? globalThis : this);
