/**
 * CHECKERS LEGEND 2026 — Configuration globale
 * ---------------------------------------------
 * Source unique de vérité : constantes du plateau, codes de pièces,
 * paramètres de difficulté de l'IA, poids d'évaluation, règles de match nul.
 *
 * Compatible navigateur (<script>), Web Worker (importScripts) et Node (require).
 */
(function (global) {
  'use strict';

  const CONFIG = {
    /* ----- Plateau ----- */
    BOARD_SIZE: 10,
    PLAYABLE_SQUARES: 50,

    /* ----- Codes de pièces ----- */
    EMPTY: 0,
    WHITE_MAN: 1,
    WHITE_KING: 2,
    BLACK_MAN: 3,
    BLACK_KING: 4,

    /* ----- Joueurs ----- */
    WHITE: 'white',
    BLACK: 'black',

    /* ----- Couleurs ----- */
    PLAYER_LABELS: { white: 'Blancs', black: 'Noirs' },

    /* ----- Difficultés de l'IA ----- */
    DIFFICULTIES: {
      easy:   { id: 'easy',   label: 'Facile',    depth: 2,  maxDepth: 3,  timeMs: 450,  randomness: 0.55, useTT: false },
      normal: { id: 'normal', label: 'Normal',    depth: 4,  maxDepth: 5,  timeMs: 1400, randomness: 0.12, useTT: true },
      hard:   { id: 'hard',   label: 'Difficile', depth: 6,  maxDepth: 7,  timeMs: 3200, randomness: 0.0,  useTT: true },
      expert: { id: 'expert', label: 'Expert',    depth: 10, maxDepth: 12, timeMs: 8000, randomness: 0.0,  useTT: true }
    },

    /* ----- Poids d'évaluation stratégique (centipions) ----- */
    EVAL: {
      MAN: 100,
      KING: 330,
      ADVANCEMENT: 4,        // bonus par rangée avancée vers la promotion
      CENTER: 5,             // contrôle du centre
      BACK_ROW: 7,           // sécurité de la rangée arrière
      KING_CENTER: 8,        // activité des dames au centre
      MOBILITY: 2,           // mobilité (demi-coups disponibles)
      TEMPO: 2,              // bonus au trait
      ENDGAME_PIECES: 8,     // seuil de pièces pour l'évaluation de fin de partie
      ENDGAME_KING_BOOST: 1.2,
      ENDGAME_MOBILITY_BOOST: 2.0,
      RANDOM_MARGIN: 60      // marge de hasard (niveaux faciles)
    },

    /* ----- Règles de match nul ----- */
    DRAW: {
      REPETITION_COUNT: 3,          // triple répétition de position
      MAX_PLIES_WITHOUT_PROGRESS: 50 // 25 coups par joueur sans capture ni mouvement de pion
    },

    /* ----- Chronomètre ----- */
    TIMER: {
      DEFAULT_MINUTES: 10,
      OPTIONS: [3, 5, 10, 15, 30, 0] // 0 = illimité
    },

    /* ----- Stockage local ----- */
    STORAGE: {
      VERSION: 1,
      PREFIX: 'cl2026:',
      KEYS: {
        SETTINGS: 'settings',
        STATS: 'stats',
        SAVE: 'savegame',
        PROFILES: 'profiles',
        NAMED_SAVES: 'namedsaves'
      }
    },

    /* ----- XP / niveaux ----- */
    XP: {
      WIN: { easy: 30, normal: 60, hard: 100, expert: 150 },
      DRAW: 20,
      LOSS: 10,
      LEVEL_STEP: 250 // XP par niveau (niveau n requiert (n-1)*STEP XP)
    },

    /* ----- Animation ----- */
    ANIMATION: {
      MOVE_MS: 260,
      CAPTURE_MS: 320,
      PROMOTE_MS: 420
    }
  };

  global.GameConfig = CONFIG;
  if (typeof module !== 'undefined' && module.exports) module.exports = CONFIG;
})(typeof globalThis !== 'undefined' ? globalThis : this);
