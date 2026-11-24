/**
 * CHECKERS LEGEND 2026 — Configuration globale
 * ---------------------------------------------
 * Source unique de vérité : constantes du plateau, codes de pièces,
 * paramètres de difficulté de l'IA, poids d'évaluation, règles de match nul.
 *
 * Compatible navigateur (<script>), Web Worker (importScripts) et Node (require).
 */

/**
 * POUR BIEN DÉBUTER
 * -----------------
 * Ce fichier est la « source unique de vérité » du jeu : toutes les valeurs
 * importantes (taille du plateau, difficultés, points, durées) sont ici.
 *
 * Le code est enveloppé dans une IIFE (fonction immédiatement appelée) : les
 * variables restent privées et seul l'objet CONFIG est rendu public. C'est le
 * motif UMD : le même fichier fonctionne dans le navigateur (<script>), dans
 * un Web Worker (importScripts) et dans Node (module.exports). globalThis
 * désigne l'objet global commun à ces environnements.
 *
 * CONFIG est un objet de configuration : des paires « clé : valeur » rangées
 * par sections. Pour lire une valeur : GameConfig.BOARD_SIZE. On ne change pas
 * ces nombres à la légère, car tout le jeu en dépend.
 */
(function (global) {
  'use strict';

  const CONFIG = {
    /* ----- Plateau ----- */
    // BOARD_SIZE = nombre de cases sur un côté : 10 x 10 = 100 cases numérotées de 0 à 99.
    // PLAYABLE_SQUARES = nombre de cases réellement utilisables (les cases sombres du damier).
    BOARD_SIZE: 10,
    PLAYABLE_SQUARES: 50,

    /* ----- Codes de pièces ----- */
    // Chaque pièce est représentée par un petit nombre entier : c'est un « code ».
    // 0 = case vide ; 1 et 2 = pion/dame blancs ; 3 et 4 = pion/dame noirs.
    // Des nombres plutôt que des mots rendent le plateau plus rapide à comparer.
    EMPTY: 0,
    WHITE_MAN: 1,
    WHITE_KING: 2,
    BLACK_MAN: 3,
    BLACK_KING: 4,

    /* ----- Joueurs ----- */
    // Identifiants textes des deux camps. On les retrouve dans les paramètres
    // et dans les résultats de parties (CONFIG.WHITE vaut 'white').
    WHITE: 'white',
    BLACK: 'black',

    /* ----- Couleurs ----- */
    // Petit dictionnaire pour afficher le nom lisible d'un camp à partir de son identifiant.
    // Exemple : PLAYER_LABELS.white donne 'Blancs'.
    PLAYER_LABELS: { white: 'Blancs', black: 'Noirs' },

    /* ----- Difficultés de l'IA ----- */
    // Chaque difficulté est un objet : depth = nombre de coups anticipés,
    // maxDepth = limite de recherche, timeMs = temps de réflexion (millisecondes),
    // randomness = part de hasard (0 = aucune), useTT = mémorisation des positions.
    // Plus depth est grand, plus l'IA « voit » loin, et plus elle est lente.
    DIFFICULTIES: {
      easy:   { id: 'easy',   label: 'Facile',    depth: 2,  maxDepth: 3,  timeMs: 450,  randomness: 0.55, useTT: false },
      normal: { id: 'normal', label: 'Normal',    depth: 4,  maxDepth: 5,  timeMs: 1400, randomness: 0.12, useTT: true },
      hard:   { id: 'hard',   label: 'Difficile', depth: 6,  maxDepth: 7,  timeMs: 3200, randomness: 0.0,  useTT: true },
      expert: { id: 'expert', label: 'Expert',    depth: 10, maxDepth: 12, timeMs: 8000, randomness: 0.0,  useTT: true }
    },

    /* ----- Poids d'évaluation stratégique (centipions) ----- */
    // L'IA note chaque position avec des points : un pion vaut 100, une dame 330.
    // Les autres nombres sont des bonus (avancement, centre, mobilité, etc.).
    // Un « centipion » vaut 1/100 de pion, d'où la valeur 100 pour un pion.
    // Les champs ENDGAME_* sont utilisés quand il reste peu de pièces.
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
    // Un match nul est déclaré après 3 fois la même position, ou après
    // 50 demi-coups (25 par joueur) sans capture ni avancée de pion.
    DRAW: {
      REPETITION_COUNT: 3,          // triple répétition de position
      MAX_PLIES_WITHOUT_PROGRESS: 50 // 25 coups par joueur sans capture ni mouvement de pion
    },

    /* ----- Chronomètre ----- */
    // DEFAULT_MINUTES = durée proposée par défaut ; OPTIONS = choix affichés.
    // La valeur 0 signifie « sans limite de temps » (voir le commentaire en ligne).
    TIMER: {
      DEFAULT_MINUTES: 10,
      OPTIONS: [3, 5, 10, 15, 30, 0] // 0 = illimité
    },

    /* ----- Stockage local ----- */
    // VERSION = version du format sauvegardé (voir storage-manager.js : le
    // versioning permet de convertir plus tard les anciennes données).
    // PREFIX = préfixe ajouté à chaque clé localStorage pour éviter les
    // collisions avec d'autres sites. KEYS donne le nom court de chaque magasin.
    // Attention : ne jamais changer ces chaînes, sinon les sauvegardes
    // existantes deviennent introuvables.
    STORAGE: {
      VERSION: 1,
      PREFIX: 'cl2026:',
      KEYS: {
        SETTINGS: 'settings',
        STATS: 'stats',
        SAVE: 'savegame',
        PROFILES: 'profiles',
        NAMED_SAVES: 'namedsaves',
        PUZZLE: 'puzzle'
      }
    },

    /* ----- XP / niveaux ----- */
    // XP = points d'expérience gagnés en jouant. WIN / DRAW / LOSS donnent le
    // gain selon le résultat et la difficulté. LEVEL_STEP = XP par niveau :
    // le niveau n demande (n-1) * LEVEL_STEP points (voir statistics.js).
    XP: {
      WIN: { easy: 30, normal: 60, hard: 100, expert: 150 },
      DRAW: 20,
      LOSS: 10,
      LEVEL_STEP: 250 // XP par niveau (niveau n requiert (n-1)*STEP XP)
    },

    /* ----- Animation ----- */
    // Durées des animations en millisecondes (1000 ms = 1 seconde) :
    // déplacement d'une pièce, capture, et promotion (pion qui devient dame).
    ANIMATION: {
      MOVE_MS: 260,
      CAPTURE_MS: 320,
      PROMOTE_MS: 420
    }
  };

  // Motif UMD : on publie CONFIG dans le navigateur (global.GameConfig) et,
  // si Node est présent, on l'exporte aussi (module.exports).
  global.GameConfig = CONFIG;
  if (typeof module !== 'undefined' && module.exports) module.exports = CONFIG;
})(typeof globalThis !== 'undefined' ? globalThis : this);
