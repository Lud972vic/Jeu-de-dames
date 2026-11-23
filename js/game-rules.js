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
(function (global) {
  'use strict';

  const CFG = (typeof GameConfig !== 'undefined') ? GameConfig
    : (typeof require !== 'undefined' ? require('../config/game-config.js') : null);

  const SIZE = 10;
  const EMPTY = 0, WHITE_MAN = 1, WHITE_KING = 2, BLACK_MAN = 3, BLACK_KING = 4;
  const WHITE = 'white', BLACK = 'black';

  const DIAGONALS = [[-1, -1], [-1, 1], [1, -1], [1, 1]];

  /* ------------------------------------------------------------
   * Helpers de géométrie
   * ------------------------------------------------------------ */

  function inBounds(r, c) {
    return r >= 0 && r < SIZE && c >= 0 && c < SIZE;
  }

  function isDarkSquare(r, c) {
    return (r + c) % 2 === 1;
  }

  function toSquare(r, c) {
    return r * SIZE + c;
  }

  function rowOf(square) {
    return Math.floor(square / SIZE);
  }

  function colOf(square) {
    return square % SIZE;
  }

  function otherPlayer(player) {
    return player === WHITE ? BLACK : WHITE;
  }

  function isWhitePiece(p) { return p === WHITE_MAN || p === WHITE_KING; }
  function isBlackPiece(p) { return p === BLACK_MAN || p === BLACK_KING; }
  function isKing(p) { return p === WHITE_KING || p === BLACK_KING; }
  function isMan(p) { return p === WHITE_MAN || p === BLACK_MAN; }
  function pieceBelongsTo(p, player) {
    return player === WHITE ? isWhitePiece(p) : isBlackPiece(p);
  }
  function isOpponentPiece(p, player) {
    return player === WHITE ? isBlackPiece(p) : isWhitePiece(p);
  }
  function promotionRow(player) {
    return player === WHITE ? 0 : SIZE - 1;
  }

  /* ------------------------------------------------------------
   * Plateau initial
   * ------------------------------------------------------------ */

  function createInitialBoard() {
    const board = new Array(SIZE * SIZE).fill(EMPTY);
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        if (!isDarkSquare(r, c)) continue;
        if (r < 4) board[toSquare(r, c)] = BLACK_MAN;
        else if (r >= SIZE - 4) board[toSquare(r, c)] = WHITE_MAN;
      }
    }
    return board;
  }

  /* ------------------------------------------------------------
   * Génération des coups
   * ------------------------------------------------------------ */

  /** Coups simples (sans capture) pour un joueur. */
  function generateSimpleMoves(board, player) {
    const moves = [];
    for (let sq = 0; sq < board.length; sq++) {
      const piece = board[sq];
      if (!pieceBelongsTo(piece, player)) continue;
      const r = rowOf(sq), c = colOf(sq);

      if (isMan(piece)) {
        const dr = player === WHITE ? -1 : 1;
        for (const dc of [-1, 1]) {
          const nr = r + dr, nc = c + dc;
          if (!inBounds(nr, nc)) continue;
          const target = toSquare(nr, nc);
          if (board[target] === EMPTY) {
            moves.push(makeMove(sq, target, [target], [], false, player, piece));
          }
        }
      } else {
        for (const [dr, dc] of DIAGONALS) {
          let nr = r + dr, nc = c + dc;
          while (inBounds(nr, nc)) {
            const target = toSquare(nr, nc);
            if (board[target] !== EMPTY) break;
            moves.push(makeMove(sq, target, [target], [], false, player, piece));
            nr += dr; nc += dc;
          }
        }
      }
    }
    return moves;
  }

  function makeMove(from, to, path, captures, isCapture, player, piece) {
    const promotes = isMan(piece) && rowOf(to) === promotionRow(player);
    return { from, to, path, captures, isCapture, promotes };
  }

  /**
   * Génère toutes les séquences de capture maximales pour une pièce donnée.
   * Les pièces capturées restent sur le plateau (fantômes) pendant la séquence :
   * elles bloquent le parcours et ne peuvent pas être re-sautées.
   */
  function generatePieceCaptures(board, player, from, piece) {
    const results = [];
    const captured = new Set();

    function dfs(current, path, captures) {
      const r = rowOf(current), c = colOf(current);
      let extended = false;
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
            dfs(landing, path, captures);
            captures.pop();
            path.pop();
            captured.delete(enemySquare);
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
            dfs(landing, path, captures);
            captures.pop();
            path.pop();
            captured.delete(enemySquare);
          }
        }
      }

      if (!extended && captures.length > 0) {
        results.push(makeMove(from, current, path.slice(), captures.slice(), true, player, piece));
      }
    }

    dfs(from, [], []);
    return results;
  }

  /**
   * Coups légaux complets pour un joueur :
   *  1. Si des captures existent, seules les captures maximales sont légales.
   *  2. Sinon, les déplacements simples.
   * @param {object} [options] { capturesOptional: boolean } — si vrai, les déplacements
   *        simples restent jouables même lorsqu'une capture est disponible. La prise
   *        majoritaire reste appliquée parmi les captures.
   */
  function getLegalMoves(board, player, options) {
    let allCaptures = [];
    for (let sq = 0; sq < board.length; sq++) {
      const piece = board[sq];
      if (!pieceBelongsTo(piece, player)) continue;
      const seqs = generatePieceCaptures(board, player, sq, piece);
      if (seqs.length) allCaptures = allCaptures.concat(seqs);
    }

    if (allCaptures.length > 0) {
      let max = 0;
      for (const m of allCaptures) if (m.captures.length > max) max = m.captures.length;
      const best = allCaptures.filter(m => m.captures.length === max);
      return options && options.capturesOptional
        ? best.concat(generateSimpleMoves(board, player))
        : best;
    }
    return generateSimpleMoves(board, player);
  }

  /* ------------------------------------------------------------
   * Application d'un coup
   * ------------------------------------------------------------ */

  /** Retourne un NOUVEAU plateau après application du coup. */
  function applyMove(board, move) {
    const next = board.slice();
    const piece = next[move.from];
    next[move.from] = EMPTY;
    for (const cap of move.captures) next[cap] = EMPTY;

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

  function countPieces(board, player) {
    let men = 0, kings = 0;
    for (const p of board) {
      if (player === WHITE && isWhitePiece(p)) { if (p === WHITE_KING) kings++; else men++; }
      if (player === BLACK && isBlackPiece(p)) { if (p === BLACK_KING) kings++; else men++; }
    }
    return { men, kings, total: men + kings };
  }

  /** Clé de position pour la détection de répétition. */
  function positionKey(board, player) {
    return board.join('') + '|' + player;
  }

  /**
   * Calcule le statut de la partie.
   * @param {number[]} board
   * @param {string} player joueur au trait
   * @param {object} ctx { repetitionCounts, pliesSinceProgress, drawConfig, capturesOptional }
   * @returns {{over:boolean, result?:string, reason?:string, moves?:Array}}
   */
  function getGameStatus(board, player, ctx) {
    ctx = ctx || {};
    const drawCfg = ctx.drawConfig || CFG.DRAW;
    const whiteCount = countPieces(board, WHITE);
    const blackCount = countPieces(board, BLACK);

    if (whiteCount.total === 0) return { over: true, result: BLACK, reason: 'no-pieces' };
    if (blackCount.total === 0) return { over: true, result: WHITE, reason: 'no-pieces' };

    const moves = getLegalMoves(board, player, ctx);
    if (moves.length === 0) {
      return { over: true, result: otherPlayer(player), reason: 'no-moves' };
    }

    if (ctx.repetitionCounts) {
      const key = positionKey(board, player);
      const count = ctx.repetitionCounts.get(key) || 0;
      if (count >= drawCfg.REPETITION_COUNT) {
        return { over: true, result: 'draw', reason: 'repetition', moves };
      }
    }

    if (ctx.pliesSinceProgress !== undefined && ctx.pliesSinceProgress >= drawCfg.MAX_PLIES_WITHOUT_PROGRESS) {
      return { over: true, result: 'draw', reason: 'no-progress', moves };
    }

    return { over: false, moves };
  }

  /* ------------------------------------------------------------
   * Notation des coups (affichage historique)
   * ------------------------------------------------------------ */

  /** Numérotation internationale 1-50 (case 1 = haut-gauche sombre). */
  function squareNumber(square) {
    const r = rowOf(square), c = colOf(square);
    // Les cases sombres sont numérotées de 1 à 50, ligne par ligne.
    return r * 5 + Math.floor(c / 2) + 1;
  }

  /** Ex. "32-28" ou "32x23x14". */
  function moveNotation(move) {
    if (!move) return '';
    if (!move.isCapture) return squareNumber(move.from) + '-' + squareNumber(move.to);
    const stops = [move.from].concat(move.path);
    return stops.map(squareNumber).join('x');
  }

  /* ------------------------------------------------------------
   * Sérialisation / clonage
   * ------------------------------------------------------------ */

  function cloneBoard(board) {
    return board.slice();
  }

  function boardFromPieces(spec) {
    const board = new Array(SIZE * SIZE).fill(EMPTY);
    for (const key of Object.keys(spec)) {
      const piece = Number(key);
      for (const sq of spec[key]) board[sq] = piece;
    }
    return board;
  }

  const api = {
    SIZE, EMPTY, WHITE_MAN, WHITE_KING, BLACK_MAN, BLACK_KING, WHITE, BLACK,
    DIAGONALS,
    inBounds, isDarkSquare, toSquare, rowOf, colOf, otherPlayer,
    isWhitePiece, isBlackPiece, isKing, isMan, pieceBelongsTo, isOpponentPiece,
    promotionRow, createInitialBoard, generateSimpleMoves, getLegalMoves,
    applyMove, countPieces, positionKey, getGameStatus, squareNumber, moveNotation,
    cloneBoard, boardFromPieces
  };

  global.CheckersRules = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
