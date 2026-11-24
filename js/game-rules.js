/**
 * CHECKERS LEGEND 2026 — Moteur de règles internationales (10×10)
 * -----------------------------------------------------------------
 * Module PUR : aucune dépendance au DOM, à l'interface ou au stockage.
 * Compatible navigateur (<script>), Web Worker (importScripts) et Node (require).
 *
 * Règles implémentées (dames internationales) :
 *  - Plateau 10×10, 50 cases jouables (cases sombres).
 *  - 20 pions par joueur ; les Blancs commencent.
 *  - Pions : déplacement diagonal avant d'une case ; prise avant ET arrière.
 *  - Dames : déplacement diagonal à distance ; prise à distance.
 *  - Captures obligatoires par défaut (option « capturesOptional » pour les rendre facultatives).
 *  - Prises multiples obligatoires jusqu'à épuisement.
 *  - Prise majoritaire : la séquence capturant le plus de pièces est prioritaire.
 *  - Pièces capturées retirées en fin de séquence (elles bloquent le parcours).
 *  - Promotion uniquement si le pion TERMINE sur la rangée de promotion.
 *  - Victoire : plus de pièces ou plus de coup légal pour l'adversaire.
 *  - Match nul : triple répétition ou 25 coups par joueur sans progression.
 */

/**
 * POUR BIEN COMMENCER (débutant) — Ce fichier est un « module pur » : il ne touche
 * ni à l'écran, ni à la sauvegarde. Il ne fait que calculer les règles du jeu.
 * ---------------------------------------------------------------------------
 * Notions JavaScript utiles pour lire ce fichier :
 *  - IIFE UMD : « (function (global) { ... })(globalThis) » exécute le code tout
 *    de suite et garde les variables cachées à l'intérieur. Le « UMD » signifie
 *    que le module marche dans un navigateur (<script>), un Web Worker
 *    (importScripts) ou Node (require) : la fin du fichier choisit le bon mode.
 *  - 'use strict' : passe en mode strict, qui signale certaines erreurs de style.
 *  - const / let : const = valeur qui ne change plus (ex. la taille du plateau) ;
 *    let = variable qu'on peut modifier (ex. un compteur dans une boucle).
 *  - tableaux ([ ... ]) : listes ordonnées, lues par index de 0 à 99 ici.
 *  - objets ({ ... }) : groupe de propriétés nommées, ex. un coup { from, to }.
 *  - Set : ensemble de valeurs uniques (les pièces déjà capturées).
 *  - Map : dictionnaire clé → valeur (servira aux positions répétées).
 *  - fonctions pures : même entrée = même sortie, sans modifier l'entrée.
 *    Ici applyMove() retourne un NOUVEAU plateau au lieu d'abîmer l'ancien.
 *  - récursivité : une fonction qui s'appelle elle-même, pour explorer les rafles
 *    (captures en chaîne) jusqu'à ce qu'il n'y ait plus de prise possible.
 *  - fonction fléchée (x => ...) : forme courte de fonction, ex. dans filter().
 *  - déstructuration (const [dr, dc] of ...) : sépare les 2 valeurs d'un tableau.
 * Ordre de lecture conseillé : constantes → géométrie → coups → applyMove → statut.
 */
(function (global) {
  'use strict';

  // Configuration : on la prend dans GameConfig (navigateur) sinon avec require (Node).
  // Le « ? : » est un test court : si la condition est vraie on prend la 1re valeur,
  // sinon la 2e. Ici on évite une erreur si require n'existe pas dans le navigateur.
  const CFG = (typeof GameConfig !== 'undefined') ? GameConfig
    : (typeof require !== 'undefined' ? require('../config/game-config.js') : null);

  const SIZE = 10; // damier 10×10 : 100 cases, dont seulement 50 sombres jouables
  // Une case est un nombre : 0 = vide ; 1/2 = pion/dame blanc ; 3/4 = pion/dame noir.
  // Les nombres rendent les comparaisons plus rapides que des textes.
  const EMPTY = 0, WHITE_MAN = 1, WHITE_KING = 2, BLACK_MAN = 3, BLACK_KING = 4;
  const WHITE = 'white', BLACK = 'black'; // noms lisibles des deux camps

  // Les 4 directions en diagonale sous forme [sautDeLigne, sautDeColonne] :
  // -1 = haut/gauche, +1 = bas/droite. Servent aux pions ET aux dames.
  const DIAGONALS = [[-1, -1], [-1, 1], [1, -1], [1, 1]];

  /* ------------------------------------------------------------
   * Helpers de géométrie
   * ------------------------------------------------------------ */

  /**
   * Vérifie qu'une case existe dans le plateau (ligne et colonne entre 0 et 9).
   * @param {number} r numéro de ligne
   * @param {number} c numéro de colonne
   * @returns {boolean} true si la case est dans le damier
   */
  function inBounds(r, c) {
    return r >= 0 && r < SIZE && c >= 0 && c < SIZE;
  }

  /**
   * Indique si une case est sombre (les seules où l'on joue).
   * Astuce sur un damier : (ligne + colonne) impair ⟺ case sombre.
   * @param {number} r ligne
   * @param {number} c colonne
   * @returns {boolean} true si la case est sombre
   */
  function isDarkSquare(r, c) {
    return (r + c) % 2 === 1;
  }

  /**
   * Transforme (ligne, colonne) en un index de 0 à 99 : index = ligne*10 + colonne.
   * On « aplatit » ainsi le damier en une seule ligne dans un tableau.
   * @param {number} r ligne
   * @param {number} c colonne
   * @returns {number} index de la case
   */
  function toSquare(r, c) {
    return r * SIZE + c;
  }

  /**
   * Retrouve la ligne à partir d'un index (inverse de toSquare).
   * Math.floor() prend la partie entière : 23/10 = 2.3 devient 2.
   * @param {number} square index 0..99
   * @returns {number} ligne 0..9
   */
  function rowOf(square) {
    return Math.floor(square / SIZE);
  }

  /**
   * Retrouve la colonne à partir d'un index : le reste de la division par 10.
   * L'opérateur % donne le reste : 23 % 10 = 3.
   * @param {number} square index 0..99
   * @returns {number} colonne 0..9
   */
  function colOf(square) {
    return square % SIZE;
  }

  /**
   * Donne le camp adverse : blanc ↔ noir.
   * @param {string} player 'white' ou 'black'
   * @returns {string} l'autre couleur
   */
  function otherPlayer(player) {
    return player === WHITE ? BLACK : WHITE;
  }

  /**
   * Teste si la pièce est un pion ou une dame blanche.
   * @param {number} p code de la pièce
   * @returns {boolean} true si elle est blanche
   */
  function isWhitePiece(p) { return p === WHITE_MAN || p === WHITE_KING; }

  /**
   * Teste si la pièce est un pion ou une dame noire.
   * @param {number} p code de la pièce
   * @returns {boolean} true si elle est noire
   */
  function isBlackPiece(p) { return p === BLACK_MAN || p === BLACK_KING; }

  /**
   * Teste si la pièce est une dame (pion promu).
   * @param {number} p code de la pièce
   * @returns {boolean} true pour une dame
   */
  function isKing(p) { return p === WHITE_KING || p === BLACK_KING; }

  /**
   * Teste si la pièce est un pion (pas encore promu).
   * @param {number} p code de la pièce
   * @returns {boolean} true pour un pion
   */
  function isMan(p) { return p === WHITE_MAN || p === BLACK_MAN; }

  /**
   * Teste si une pièce appartient au joueur indiqué.
   * @param {number} p code de la pièce
   * @param {string} player 'white' ou 'black'
   * @returns {boolean} true si la pièce est à ce joueur
   */
  function pieceBelongsTo(p, player) {
    return player === WHITE ? isWhitePiece(p) : isBlackPiece(p);
  }

  /**
   * Teste si une pièce appartient au camp adverse.
   * @param {number} p code de la pièce
   * @param {string} player 'white' ou 'black'
   * @returns {boolean} true si la pièce est adverse
   */
  function isOpponentPiece(p, player) {
    return player === WHITE ? isBlackPiece(p) : isWhitePiece(p);
  }

  /**
   * Donne la ligne de promotion : les Blancs montent vers la ligne 0,
   * les Noirs descendent vers la ligne 9 (SIZE - 1).
   * @param {string} player 'white' ou 'black'
   * @returns {number} ligne cible (0 ou 9)
   */
  function promotionRow(player) {
    return player === WHITE ? 0 : SIZE - 1;
  }

  /* ------------------------------------------------------------
   * Plateau initial
   * ------------------------------------------------------------ */

  /**
   * Fabrique le plateau de départ : 20 pions par camp, sur les cases sombres.
   * Les Noirs occupent les 4 premières lignes, les Blancs les 4 dernières.
   * @returns {number[]} un tableau neuf de 100 cases (4 lignes vides au milieu)
   */
  function createInitialBoard() {
    // new Array(100).fill(0) crée 100 emplacements puis les remplit de « vide ».
    const board = new Array(SIZE * SIZE).fill(EMPTY);
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        if (!isDarkSquare(r, c)) continue; // on ignore les cases claires
        if (r < 4) board[toSquare(r, c)] = BLACK_MAN;
        else if (r >= SIZE - 4) board[toSquare(r, c)] = WHITE_MAN;
      }
    }
    return board;
  }

  /* ------------------------------------------------------------
   * Génération des coups
   * ------------------------------------------------------------ */

  /**
   * Liste tous les coups simples (sans prise) d'un joueur.
   * Un pion avance d'UNE case en diagonale vers l'avant ; une dame glisse sur
   * toute une diagonale tant que les cases sont vides (boucle while).
   * @param {number[]} board plateau actuel
   * @param {string} player joueur au trait
   * @returns {object[]} tableau de coups simples
   */
  function generateSimpleMoves(board, player) {
    const moves = [];
    for (let sq = 0; sq < board.length; sq++) {
      const piece = board[sq];
      if (!pieceBelongsTo(piece, player)) continue; // case vide ou pièce adverse
      const r = rowOf(sq), c = colOf(sq);

      if (isMan(piece)) {
        // Les Blancs montent (ligne -1), les Noirs descendent (ligne +1).
        const dr = player === WHITE ? -1 : 1;
        for (const dc of [-1, 1]) { // deux diagonales avant : gauche et droite
          const nr = r + dr, nc = c + dc;
          if (!inBounds(nr, nc)) continue;
          const target = toSquare(nr, nc);
          if (board[target] === EMPTY) {
            moves.push(makeMove(sq, target, [target], [], false, player, piece));
          }
        }
      } else {
        // Dame : on avance case par case jusqu'à rencontrer une pièce ou le bord.
        for (const [dr, dc] of DIAGONALS) {
          let nr = r + dr, nc = c + dc;
          while (inBounds(nr, nc)) {
            const target = toSquare(nr, nc);
            if (board[target] !== EMPTY) break; // bloqué : on s'arrête
            moves.push(makeMove(sq, target, [target], [], false, player, piece));
            nr += dr; nc += dc;
          }
        }
      }
    }
    return moves;
  }

  /**
   * Fabrique un objet « coup » complet. Un coup est un petit paquet de données :
   * from (départ), to (arrivée), path (cases traversées), captures (pièces prises),
   * isCapture (y a-t-il prise ?) et promotes (le pion devient-il dame ?).
   * @param {number} from index de départ
   * @param {number} to index d'arrivée
   * @param {number[]} path cases d'atterrissage successives
   * @param {number[]} captures pièces capturées
   * @param {boolean} isCapture true s'il y a une prise
   * @param {string} player joueur qui joue
   * @param {number} piece code de la pièce jouée
   * @returns {object} le coup prêt à être utilisé
   */
  function makeMove(from, to, path, captures, isCapture, player, piece) {
    // Promotion : seulement si c'est un pion ET qu'il TERMINE sur la ligne cible.
    const promotes = isMan(piece) && rowOf(to) === promotionRow(player);
    return { from, to, path, captures, isCapture, promotes };
  }

  /**
   * Génère toutes les séquences de capture maximales pour UNE pièce donnée.
   * Une rafle est explorée par récursivité : la fonction dfs() s'appelle elle-même
   * après chaque saut, jusqu'à ne plus pouvoir capturer.
   * Les pièces capturées restent sur le plateau (fantômes) pendant la recherche :
   * elles bloquent le passage et ne peuvent pas être sautées deux fois. Elles ne
   * sont vraiment effacées qu'à la fin, dans applyMove().
   * @param {number[]} board plateau actuel
   * @param {string} player joueur au trait
   * @param {number} from index de départ de la pièce
   * @param {number} piece code de la pièce jouée
   * @returns {object[]} les rafles complètes (une par fin possible)
   */
  function generatePieceCaptures(board, player, from, piece) {
    const results = [];
    const captured = new Set(); // mémorise les pièces déjà prises (valeurs uniques)

    /**
     * Avance d'un saut depuis 'current', puis explore la suite (récursivité).
     * @param {number} current case où se trouve la pièce
     * @param {number[]} path cases d'atterrissage déjà visitées
     * @param {number[]} captures pièces déjà capturées
     * @returns {void} rien : les rafles trouvées sont ajoutées à 'results'
     */
    function dfs(current, path, captures) {
      const r = rowOf(current), c = colOf(current);
      let extended = false; // est-ce qu'au moins un saut supplémentaire est possible ?
      const king = isKing(piece);

      for (const [dr, dc] of DIAGONALS) {
        if (king) {
          // Dames : avance sur la diagonale jusqu'à rencontrer une pièce.
          let nr = r + dr, nc = c + dc;
          let enemySquare = -1;
          while (inBounds(nr, nc)) {
            const idx = toSquare(nr, nc);
            const v = board[idx];
            if (v !== EMPTY) {
              if (isOpponentPiece(v, player) && !captured.has(idx)) enemySquare = idx;
              break; // toute pièce (y compris fantôme) bloque la ligne
            }
            nr += dr; nc += dc;
          }
          if (enemySquare === -1) continue;

          // Cases d'atterrissage possibles au-delà de la pièce capturée.
          let lr = rowOf(enemySquare) + dr;
          let lc = colOf(enemySquare) + dc;
          while (inBounds(lr, lc)) {
            const landing = toSquare(lr, lc);
            if (board[landing] !== EMPTY) break; // occupé (ou fantôme) => stop
            extended = true;
            captured.add(enemySquare);
            path.push(landing);
            captures.push(enemySquare);
            dfs(landing, path, captures); // on explore la suite depuis la nouvelle case
            captures.pop();               // retour arrière : on annule le dernier saut
            path.pop();
            captured.delete(enemySquare); // la pièce redevient prenable pour l'essai suivant
            lr += dr; lc += dc;
          }
        } else {
          // Pions : saut d'une pièce adjacente vers la case suivante (4 directions).
          const er = r + dr, ec = c + dc;
          const lr = r + 2 * dr, lc = c + 2 * dc;
          if (!inBounds(lr, lc)) continue;
          const enemySquare = toSquare(er, ec);
          const landing = toSquare(lr, lc);
          const ev = board[enemySquare];
          if (isOpponentPiece(ev, player) && !captured.has(enemySquare) && board[landing] === EMPTY) {
            extended = true;
            captured.add(enemySquare);
            path.push(landing);
            captures.push(enemySquare);
            dfs(landing, path, captures); // on explore la suite depuis la nouvelle case
            captures.pop();               // retour arrière : on annule le dernier saut
            path.pop();
            captured.delete(enemySquare); // la pièce redevient prenable pour l'essai suivant
          }
        }
      }

      // Plus aucun saut possible et au moins une prise : cette rafle est terminée,
      // on l'enregistre. slice() copie les tableaux pour ne pas les modifier ensuite.
      if (!extended && captures.length > 0) {
        results.push(makeMove(from, current, path.slice(), captures.slice(), true, player, piece));
      }
    }

    dfs(from, [], []);
    return results;
  }

  /**
   * Donne TOUS les coups légaux d'un joueur, dans cet ordre de priorité :
   *  1. S'il existe des prises, seules les plus longues rafles sont légales.
   *  2. Sinon, tous les déplacements simples sont permis.
   * Notion clé — la « prise majoritaire » : quand plusieurs rafles sont
   * possibles, on est obligé de choisir celle qui capture le PLUS de pièces.
   * @param {number[]} board plateau actuel
   * @param {string} player joueur au trait
   * @param {object} [options] { capturesOptional: boolean } — si vrai, les déplacements
   *        simples restent jouables même lorsqu'une capture est disponible. La prise
   *        majoritaire reste appliquée parmi les captures.
   * @returns {object[]} liste des coups autorisés
   */
  function getLegalMoves(board, player, options) {
    let allCaptures = [];
    // On demande les rafles de chaque pièce appartenant au joueur, puis on les
    // rassemble avec concat() (qui ajoute les éléments d'un tableau à la fin).
    for (let sq = 0; sq < board.length; sq++) {
      const piece = board[sq];
      if (!pieceBelongsTo(piece, player)) continue;
      const seqs = generatePieceCaptures(board, player, sq, piece);
      if (seqs.length) allCaptures = allCaptures.concat(seqs);
    }

    if (allCaptures.length > 0) {
      let max = 0;
      for (const m of allCaptures) if (m.captures.length > max) max = m.captures.length;
      const best = allCaptures.filter(m => m.captures.length === max); // prise majoritaire
      return options && options.capturesOptional
        ? best.concat(generateSimpleMoves(board, player))
        : best;
    }
    return generateSimpleMoves(board, player);
  }

  /* ------------------------------------------------------------
   * Application d'un coup
   * ------------------------------------------------------------ */

  /**
   * Applique un coup et retourne un NOUVEAU plateau (le plateau reçu n'est pas
   * modifié : c'est une fonction pure, pratique pour annuler ou pour l'IA).
   * Les pièces capturées ne sont effacées qu'ICI, donc en fin de rafle.
   * @param {number[]} board plateau avant le coup
   * @param {object} move coup à jouer
   * @returns {number[]} plateau après le coup
   */
  function applyMove(board, move) {
    const next = board.slice(); // copie du tableau : on travaille sur un clone
    const piece = next[move.from];
    next[move.from] = EMPTY;
    for (const cap of move.captures) next[cap] = EMPTY;

    // Promotion uniquement si le pion TERMINE le coup sur sa ligne de promotion :
    // un pion qui traverse cette ligne en rafle mais s'arrête ailleurs reste pion.
    if (isMan(piece) && rowOf(move.to) === promotionRow(piece === WHITE_MAN ? WHITE : BLACK)) {
      next[move.to] = piece === WHITE_MAN ? WHITE_KING : BLACK_KING;
    } else {
      next[move.to] = piece;
    }
    return next;
  }

  /* ------------------------------------------------------------
   * État du jeu : victoire / match nul
   * ------------------------------------------------------------ */

  /**
   * Compte les pions et les dames d'un joueur.
   * @param {number[]} board plateau
   * @param {string} player 'white' ou 'black'
   * @returns {{men:number, kings:number, total:number}} les deux comptes et leur somme
   */
  function countPieces(board, player) {
    let men = 0, kings = 0;
    for (const p of board) { // boucle sur chaque case du plateau
      if (player === WHITE && isWhitePiece(p)) { if (p === WHITE_KING) kings++; else men++; }
      if (player === BLACK && isBlackPiece(p)) { if (p === BLACK_KING) kings++; else men++; }
    }
    return { men, kings, total: men + kings };
  }

  /**
   * Fabrique une clé unique décrivant la position : les 100 cases collées ensemble
   * (join) plus le joueur au trait. Une clé identique = position répétée.
   * @param {number[]} board plateau
   * @param {string} player joueur au trait
   * @returns {string} la clé de position
   */
  function positionKey(board, player) {
    return board.join('') + '|' + player;
  }

  /**
   * Calcule le statut de la partie : qui a gagné, ou si c'est nul, ou si elle continue.
   * Vérifications dans l'ordre : plus de pièces → plus de coup jouable → répétition
   * → trop de coups sans progression. La première condition vraie gagne.
   * @param {number[]} board plateau
   * @param {string} player joueur au trait
   * @param {object} ctx { repetitionCounts, pliesSinceProgress, drawConfig, capturesOptional }
   *   repetitionCounts est une Map (clé de position → nombre de fois vue)
   * @returns {{over:boolean, result?:string, reason?:string, moves?:Array}}
   *   over = partie finie ; result = 'white'/'black'/'draw' ; raison courte ; moves utiles
   */
  function getGameStatus(board, player, ctx) {
    ctx = ctx || {}; // évite une erreur si l'appelant oublie de fournir ctx
    const drawCfg = ctx.drawConfig || CFG.DRAW;
    const whiteCount = countPieces(board, WHITE);
    const blackCount = countPieces(board, BLACK);

    if (whiteCount.total === 0) return { over: true, result: BLACK, reason: 'no-pieces' };
    if (blackCount.total === 0) return { over: true, result: WHITE, reason: 'no-pieces' };

    // N'avoir plus aucun coup légal = perdre, même si on a encore des pièces.
    const moves = getLegalMoves(board, player, ctx);
    if (moves.length === 0) {
      return { over: true, result: otherPlayer(player), reason: 'no-moves' };
    }

    // Match nul par répétition : la même position revient assez souvent.
    if (ctx.repetitionCounts) {
      const key = positionKey(board, player);
      const count = ctx.repetitionCounts.get(key) || 0; // 0 si la clé est absente
      if (count >= drawCfg.REPETITION_COUNT) {
        return { over: true, result: 'draw', reason: 'repetition', moves };
      }
    }

    // Match nul par « non-progression » : trop de coups de dame sans prise.
    if (ctx.pliesSinceProgress !== undefined && ctx.pliesSinceProgress >= drawCfg.MAX_PLIES_WITHOUT_PROGRESS) {
      return { over: true, result: 'draw', reason: 'no-progress', moves };
    }

    return { over: false, moves };
  }

  /* ------------------------------------------------------------
   * Notation des coups (affichage historique)
   * ------------------------------------------------------------ */

  /**
   * Convertit un index en numéro international de case (1 à 50).
   * Sur une ligne il n'y a que 5 cases sombres, d'où le r * 5.
   * @param {number} square index 0..99
   * @returns {number} numéro de case 1..50
   */
  function squareNumber(square) {
    const r = rowOf(square), c = colOf(square);
    // Les cases sombres sont numérotées de 1 à 50, ligne par ligne.
    return r * 5 + Math.floor(c / 2) + 1;
  }

  /**
   * Écrit un coup en notation lisible pour l'historique : "32-28" pour un
   * déplacement simple, "32x23x14" pour une rafle (les 'x' séparent les cases).
   * @param {object} move coup à afficher
   * @returns {string} notation, ou chaîne vide si move est absent
   */
  function moveNotation(move) {
    if (!move) return '';
    if (!move.isCapture) return squareNumber(move.from) + '-' + squareNumber(move.to);
    const stops = [move.from].concat(move.path); // départ puis toutes les arrivées
    // map() transforme chaque case en numéro, join('x') les colle avec des 'x'.
    return stops.map(squareNumber).join('x');
  }

  /* ------------------------------------------------------------
   * Sérialisation / clonage
   * ------------------------------------------------------------ */

  /**
   * Copie un plateau. slice() crée un nouveau tableau : modifier la copie
   * n'a aucun effet sur l'original (utile pour les tests et les puzzles).
   * @param {number[]} board plateau à copier
   * @returns {number[]} copie indépendante
   */
  function cloneBoard(board) {
    return board.slice();
  }

  /**
   * Construit un plateau à partir d'une description { "codePièce": [cases] }.
   * Object.keys() donne les clés de l'objet ; Number() convertit une clé texte
   * (ex. "2") en nombre (ex. 2). Sert surtout à définir des positions de test.
   * @param {object} spec description des pièces, ex. { "1": [44, 55] }
   * @returns {number[]} plateau correspondant
   */
  function boardFromPieces(spec) {
    const board = new Array(SIZE * SIZE).fill(EMPTY);
    for (const key of Object.keys(spec)) {
      const piece = Number(key);
      for (const sq of spec[key]) board[sq] = piece;
    }
    return board;
  }

  // On regroupe les morceaux publics dans un seul objet 'api'. Les fonctions qui
  // ne sont pas ici (comme dfs) restent privées : c'est le but de l'IIFE.
  const api = {
    SIZE, EMPTY, WHITE_MAN, WHITE_KING, BLACK_MAN, BLACK_KING, WHITE, BLACK,
    DIAGONALS,
    inBounds, isDarkSquare, toSquare, rowOf, colOf, otherPlayer,
    isWhitePiece, isBlackPiece, isKing, isMan, pieceBelongsTo, isOpponentPiece,
    promotionRow, createInitialBoard, generateSimpleMoves, getLegalMoves,
    applyMove, countPieces, positionKey, getGameStatus, squareNumber, moveNotation,
    cloneBoard, boardFromPieces
  };

  // UMD : on expose l'objet dans le navigateur/Worker via global.CheckersRules,
  // et pour Node via module.exports. Ainsi les autres fichiers peuvent l'utiliser.
  global.CheckersRules = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
