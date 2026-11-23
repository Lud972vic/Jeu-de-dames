/**
 * CHECKERS LEGEND 2026 — Moteur d'intelligence artificielle
 * -----------------------------------------------------------
 * IA stratégique 100 % JavaScript, locale, sans aucune dépendance réseau.
 *
 * Algorithmes :
 *  - Minimax avec élagage Alpha-Bêta (Negamax).
 *  - Iterative Deepening (recherche progressive avec limite de temps).
 *  - Table de transposition (TT) + Zobrist Hashing.
 *  - Move Ordering : captures, promotions, TT move, killer moves, history heuristic.
 *  - Quiescence Search (extension des séquences de capture).
 *  - Évaluation stratégique : matériel, avancement, centre, sécurité, mobilité,
 *    activité des dames, fin de partie.
 *  - Détection de répétition dans l'arbre de recherche.
 *  - Quatre niveaux de difficulté : facile, normal, difficile, expert.
 *
 * Compatible navigateur (<script>), Web Worker (importScripts) et Node (require).
 */
(function (global) {
  'use strict';

  const CFG = (typeof GameConfig !== 'undefined') ? GameConfig
    : (typeof require !== 'undefined' ? require('../config/game-config.js') : null);
  const Rules = (typeof CheckersRules !== 'undefined') ? CheckersRules
    : (typeof require !== 'undefined' ? require('./game-rules.js') : null);

  const WHITE = CFG.WHITE, BLACK = CFG.BLACK;
  const E = CFG.EVAL;
  const MATE = 1000000;
  const TIMEOUT = { __timeout: true };

  const TT_FLAG_EXACT = 0, TT_FLAG_LOWER = 1, TT_FLAG_UPPER = 2;
  const TT_MAX_ENTRIES = 300000;

  /* ============================================================
   * Zobrist Hashing (déterministe, reproductible)
   * ============================================================ */

  const ZOBRIST = (function () {
    let seed = 0x1a2b3c4d;
    function rand32() {
      // xorshift32
      seed ^= (seed << 13); seed >>>= 0;
      seed ^= (seed >>> 17);
      seed ^= (seed << 5); seed >>>= 0;
      return seed;
    }
    const table = [];
    for (let i = 0; i < 100; i++) {
      table.push([0, rand32(), rand32(), rand32(), rand32()]);
    }
    return { table, side: rand32() };
  })();

  function computeHash(board, player) {
    let h = 0;
    for (let i = 0; i < 100; i++) {
      const v = board[i];
      if (v) h ^= ZOBRIST.table[i][v];
    }
    if (player === BLACK) h ^= ZOBRIST.side;
    return h >>> 0;
  }

  /** Applique un coup et met à jour le hash de façon incrémentale. */
  function applyMoveWithHash(board, move, hash) {
    const next = board.slice();
    const piece = next[move.from];
    let h = hash;
    h ^= ZOBRIST.table[move.from][piece];
    next[move.from] = 0;
    for (let k = 0; k < move.captures.length; k++) {
      const cap = move.captures[k];
      h ^= ZOBRIST.table[cap][next[cap]];
      next[cap] = 0;
    }
    let placed = piece;
    if (Rules.isMan(piece) && Rules.rowOf(move.to) === Rules.promotionRow(Rules.isWhitePiece(piece) ? WHITE : BLACK)) {
      placed = Rules.isWhitePiece(piece) ? CFG.WHITE_KING : CFG.BLACK_KING;
    }
    next[move.to] = placed;
    h ^= ZOBRIST.table[move.to][placed];
    h ^= ZOBRIST.side; // changement de joueur
    return { board: next, hash: h >>> 0 };
  }

  /* ============================================================
   * Évaluation stratégique
   * ============================================================ */

  function evaluate(board, player) {
    let score = 0;
    let whiteKings = 0, blackKings = 0;
    let whiteMobility = 0, blackMobility = 0;
    let totalPieces = 0;

    for (let i = 0; i < 100; i++) {
      const v = board[i];
      if (!v) continue;
      totalPieces++;
      const r = (i / 10) | 0;
      const c = i % 10;
      const central = r >= 3 && r <= 6 && c >= 3 && c <= 6;
      const edge = r === 0 || r === 9 || c === 0 || c === 9;

      if (v === CFG.WHITE_MAN) {
        score += E.MAN + (9 - r) * E.ADVANCEMENT;
        if (central) score += E.CENTER;
        if (r === 9) score += E.BACK_ROW;
        if (edge) score -= 2;
        // mobilité pion (2 directions avant)
        if (r > 0) {
          if (c > 0 && board[i - 11] === 0) whiteMobility++;
          if (c < 9 && board[i - 9] === 0) whiteMobility++;
        }
      } else if (v === CFG.WHITE_KING) {
        whiteKings++;
        score += E.KING;
        if (central) score += E.KING_CENTER;
        whiteMobility += kingMobility(board, r, c);
      } else if (v === CFG.BLACK_MAN) {
        score -= E.MAN + r * E.ADVANCEMENT;
        if (central) score -= E.CENTER;
        if (r === 0) score -= E.BACK_ROW;
        if (edge) score += 2;
        if (r < 9) {
          if (c > 0 && board[i + 9] === 0) blackMobility++;
          if (c < 9 && board[i + 11] === 0) blackMobility++;
        }
      } else if (v === CFG.BLACK_KING) {
        blackKings++;
        score -= E.KING;
        if (central) score -= E.KING_CENTER;
        blackMobility += kingMobility(board, r, c);
      }
    }

    score += (whiteMobility - blackMobility) * E.MOBILITY;

    // Fin de partie : valoriser davantage les dames et la mobilité.
    if (totalPieces <= E.ENDGAME_PIECES) {
      score += (whiteKings - blackKings) * E.KING * (E.ENDGAME_KING_BOOST - 1);
      score += (whiteMobility - blackMobility) * E.MOBILITY * (E.ENDGAME_MOBILITY_BOOST - 1);
    }

    // Tempo : léger bonus au joueur au trait.
    score += (player === WHITE ? E.TEMPO : -E.TEMPO);

    return player === WHITE ? score : -score;
  }

  function kingMobility(board, r, c) {
    let count = 0;
    const dirs = Rules.DIAGONALS;
    for (let d = 0; d < 4; d++) {
      let nr = r + dirs[d][0], nc = c + dirs[d][1];
      while (nr >= 0 && nr < 10 && nc >= 0 && nc < 10) {
        if (board[nr * 10 + nc] !== 0) break;
        count++;
        nr += dirs[d][0]; nc += dirs[d][1];
      }
    }
    return count;
  }

  /* ============================================================
   * Ordonnancement des coups
   * ============================================================ */

  function sameMove(a, b) {
    return a && b && a.from === b.from && a.to === b.to &&
      a.captures.length === b.captures.length;
  }

  function orderMoves(moves, ttMove, ctx, ply) {
    const killers = ctx.killers[ply] || [];
    for (const m of moves) {
      let s = 0;
      if (sameMove(m, ttMove)) s += 10000000;
      if (m.isCapture) s += 1000000 + m.captures.length * 10000;
      if (m.promotes) s += 500000;
      for (const k of killers) if (sameMove(m, k)) { s += 400000; break; }
      s += ctx.history[m.from * 100 + m.to] || 0;
      m.__order = s;
    }
    moves.sort((a, b) => b.__order - a.__order);
    return moves;
  }

  /** Joueur au trait après un coup (le mode « tour bonus » conserve le joueur). */
  function nextPlayer(player, move, ctx) {
    return ctx.ruleOptions.chainCaptures && move.isCapture
      ? player
      : Rules.otherPlayer(player);
  }

  /* ============================================================
   * Quiescence Search
   * ============================================================ */

  function quiesce(board, player, alpha, beta, ply, hash, ctx, qdepth) {
    ctx.nodes++;
    if ((ctx.nodes & 2047) === 0 && Date.now() > ctx.deadline) throw TIMEOUT;

    const legal = Rules.getLegalMoves(board, player, ctx.ruleOptions);
    if (legal.length === 0) return -MATE + ply;

    // La quiescence ne explore que les captures (même en mode « prise facultative »).
    const moves = legal.filter(m => m.isCapture);
    if (moves.length === 0 || qdepth <= 0) return evaluate(board, player);

    orderMoves(moves, null, ctx, ply);

    let best = -Infinity;
    for (const m of moves) {
      const applied = applyMoveWithHash(board, m, hash);
      const score = -quiesce(applied.board, nextPlayer(player, m, ctx), -beta, -alpha, ply + 1, applied.hash, ctx, qdepth - 1);
      if (score > best) best = score;
      if (best > alpha) alpha = best;
      if (alpha >= beta) break;
    }
    return best;
  }

  /* ============================================================
   * Negamax + Alpha-Bêta
   * ============================================================ */

  function negamax(board, player, depth, alpha, beta, ply, hash, ctx, pliesNoProgress) {
    ctx.nodes++;
    if ((ctx.nodes & 1023) === 0 && Date.now() > ctx.deadline) throw TIMEOUT;

    // Répétition de position dans l'arbre : valeur de match nul.
    const seen = ctx.pathCounts.get(hash) || 0;
    if (seen >= 2) return 0;

    // Règle de non-progression.
    if (pliesNoProgress >= ctx.drawPlies) return 0;

    const moves = Rules.getLegalMoves(board, player, ctx.ruleOptions);
    if (moves.length === 0) return -MATE + ply;

    if (depth <= 0) return quiesce(board, player, alpha, beta, ply, hash, ctx, 4);

    // Table de transposition
    let ttMove = null;
    if (ctx.useTT) {
      const entry = ctx.tt.get(hash);
      if (entry) {
        ttMove = entry.move;
        if (entry.depth >= depth) {
          if (entry.flag === TT_FLAG_EXACT) return entry.score;
          if (entry.flag === TT_FLAG_LOWER && entry.score >= beta) return entry.score;
          if (entry.flag === TT_FLAG_UPPER && entry.score <= alpha) return entry.score;
        }
      }
    }

    orderMoves(moves, ttMove, ctx, ply);

    const alphaOrig = alpha;
    let bestScore = -Infinity;
    let bestMove = null;

    ctx.pathCounts.set(hash, seen + 1);

    for (const m of moves) {
      const applied = applyMoveWithHash(board, m, hash);
      const childNoProgress = (m.isCapture || Rules.isMan(board[m.from])) ? 0 : pliesNoProgress + 1;
      const score = -negamax(
        applied.board, nextPlayer(player, m, ctx), depth - 1,
        -beta, -alpha, ply + 1, applied.hash, ctx, childNoProgress
      );
      if (score > bestScore) { bestScore = score; bestMove = m; }
      if (bestScore > alpha) alpha = bestScore;
      if (alpha >= beta) {
        // Killer moves + history heuristic
        if (!m.isCapture) {
          const killers = ctx.killers[ply] || (ctx.killers[ply] = []);
          if (!killers.some(k => sameMove(k, m))) {
            killers.unshift(m);
            if (killers.length > 2) killers.pop();
          }
          ctx.history[m.from * 100 + m.to] += depth * depth;
        }
        break;
      }
    }

    ctx.pathCounts.set(hash, seen);
    if (seen === 0) ctx.pathCounts.delete(hash);

    // Stockage TT
    if (ctx.useTT) {
      if (ctx.tt.size > TT_MAX_ENTRIES) ctx.tt.clear();
      let flag = TT_FLAG_EXACT;
      if (bestScore <= alphaOrig) flag = TT_FLAG_UPPER;
      else if (bestScore >= beta) flag = TT_FLAG_LOWER;
      ctx.tt.set(hash, { depth, score: bestScore, flag, move: bestMove });
    }

    return bestScore;
  }

  /* ============================================================
   * Recherche à la racine (iterative deepening)
   * ============================================================ */

  function rootSearch(board, player, depth, ctx, legalMoves, rootHash, collectAll) {
    const hash = rootHash;
    const alphaOrig = -Infinity;
    let alpha = -Infinity;
    const beta = Infinity;
    let bestMove = null;
    let bestScore = -Infinity;
    const scored = [];

    orderMoves(legalMoves, ctx.rootBestMove || null, ctx, 0);
    const seen = ctx.pathCounts.get(hash) || 0;
    ctx.pathCounts.set(hash, seen + 1);

    for (const m of legalMoves) {
      const applied = applyMoveWithHash(board, m, hash);
      const childNoProgress = (m.isCapture || Rules.isMan(board[m.from])) ? 0 : ctx.rootPliesNoProgress + 1;
      let score;
      if (collectAll) {
        // Fenêtre complète : scores exacts pour le choix aléatoire (niveaux faciles).
        score = -negamax(applied.board, nextPlayer(player, m, ctx), depth - 1, -Infinity, Infinity, 1, applied.hash, ctx, childNoProgress);
      } else {
        score = -negamax(applied.board, nextPlayer(player, m, ctx), depth - 1, -beta, -alpha, 1, applied.hash, ctx, childNoProgress);
      }
      scored.push({ move: m, score });
      if (score > bestScore) { bestScore = score; bestMove = m; }
      if (score > alpha) alpha = score;
    }

    ctx.pathCounts.set(hash, seen);
    if (seen === 0) ctx.pathCounts.delete(hash);

    ctx.rootBestMove = bestMove;
    scored.sort((a, b) => b.score - a.score);
    return { move: bestMove, score: bestScore, depth, scored };
  }

  /* ============================================================
   * API de recherche
   * ============================================================ */

  /**
   * Recherche le meilleur coup.
   * @param {number[]} board plateau
   * @param {string} player joueur au trait
   * @param {object} options { difficulty, timeMs, maxDepth, randomness, useTT, capturesOptional, chainCaptures, onProgress }
   * @returns {{move:object|null, score:number, depth:number, nodes:number, timeMs:number, forced?:boolean}}
   */
  function search(board, player, options) {
    options = options || {};
    const diff = CFG.DIFFICULTIES[options.difficulty] || CFG.DIFFICULTIES.normal;
    const maxDepth = options.maxDepth || diff.maxDepth || diff.depth;
    const timeMs = options.timeMs || diff.timeMs;
    const randomness = options.randomness !== undefined ? options.randomness : (diff.randomness || 0);
    const useTT = options.useTT !== undefined ? options.useTT : !!diff.useTT;

    const start = Date.now();
    const ctx = {
      nodes: 0,
      deadline: start + timeMs,
      tt: new Map(),
      killers: [],
      history: new Int32Array(10000),
      pathCounts: new Map(),
      useTT,
      ruleOptions: {
        capturesOptional: !!options.capturesOptional,
        chainCaptures: !!options.chainCaptures
      },
      drawPlies: CFG.DRAW.MAX_PLIES_WITHOUT_PROGRESS,
      rootBestMove: null,
      rootPliesNoProgress: 0
    };

    const legalMoves = Rules.getLegalMoves(board, player, ctx.ruleOptions);
    if (legalMoves.length === 0) {
      return { move: null, score: -MATE, depth: 0, nodes: 0, timeMs: 0 };
    }
    if (legalMoves.length === 1) {
      return { move: legalMoves[0], score: 0, depth: 0, nodes: 0, timeMs: 0, forced: true };
    }

    const rootHash = computeHash(board, player);
    const collectAll = randomness > 0;

    let best = { move: legalMoves[0], score: 0, depth: 0, scored: null };
    let completedDepth = 0;

    for (let d = 1; d <= maxDepth; d++) {
      try {
        const result = rootSearch(board, player, d, ctx, legalMoves, rootHash, collectAll);
        if (result.move) {
          best = result;
          completedDepth = d;
        }
        if (options.onProgress) {
          options.onProgress({
            depth: d,
            score: result.score,
            nodes: ctx.nodes,
            timeMs: Date.now() - start
          });
        }
        // Victoire/défaite forcée détectée : inutile d'approfondir.
        if (Math.abs(result.score) >= MATE - 1000) break;
      } catch (err) {
        if (err !== TIMEOUT) throw err;
        break;
      }
      if (Date.now() >= ctx.deadline) break;
    }

    // Niveaux faciles : choix parmi les meilleurs coups (moins optimisé).
    let chosen = best.move;
    if (randomness > 0 && best.scored && best.scored.length > 1) {
      const margin = E.RANDOM_MARGIN * (0.5 + randomness);
      const candidates = best.scored.filter(s => s.score >= best.score - margin);
      if (candidates.length > 1) {
        chosen = candidates[Math.floor(Math.random() * candidates.length)].move;
      }
    }

    return {
      move: chosen,
      score: best.score,
      depth: completedDepth,
      nodes: ctx.nodes,
      timeMs: Date.now() - start
    };
  }

  const api = {
    search,
    evaluate,
    computeHash,
    applyMoveWithHash,
    MATE,
    ZOBRIST
  };

  global.CheckersAI = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
