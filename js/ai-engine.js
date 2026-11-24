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

/**
 * POUR BIEN COMMENCER (débutant) — Ce fichier est le « cerveau » de l'ordinateur.
 * Il reçoit un plateau et cherche le meilleur coup en imaginant la suite de la
 * partie. Il n'affiche rien et ne joue pas : il ne fait que calculer un score.
 * ---------------------------------------------------------------------------
 * Notions JavaScript et concepts de jeu utilisés :
 *  - IIFE UMD : tout est enfermé dans une fonction exécutée tout de suite, puis
 *    exposé sous CheckersAI (navigateur/Worker) ou module.exports (Node).
 *  - const / let : constantes (ne changent pas) et variables (changent).
 *  - tableaux ([ ... ]) pour le plateau et les coups ; objets ({ ... }) pour les
 *    données ; Map pour les tables de transposition et les positions vues.
 *  - Int32Array : tableau de nombres entiers de taille fixe, plus compact et
 *    rapide qu'un tableau classique (ici pour l'heuristique 'history').
 *  - fonctions pures : evaluate() et computeHash() ne modifient rien.
 *  - récursivité : une fonction s'appelle elle-même pour explorer un arbre de coups.
 *  - Minimax : on suppose que l'adversaire joue TOUJOURS le meilleur coup ;
 *    l'IA choisit donc le coup qui résiste au pire. Ici on utilise le « Negamax »,
 *    une forme compacte où l'on inverse simplement le signe du score à chaque tour.
 *  - Alpha-Bêta : on arrête d'explorer une branche dès qu'elle ne peut plus
 *    améliorer le meilleur résultat déjà trouvé (gros gain de temps).
 *  - Table de transposition + Zobrist : on donne un numéro unique à chaque
 *    position pour retrouver un calcul déjà fait au lieu de le refaire.
 *  - Quiescence : avant d'arrêter le calcul, on prolonge les échanges de prises
 *    pour ne pas juger une position « en plein milieu d'une rafle ».
 *  - limite de temps : la recherche s'arrête à une date (deadline) grâce à une
 *    exception interne, pour ne jamais bloquer l'interface.
 * Ordre de lecture : constantes → Zobrist → évaluation → ordre des coups →
 * quiesce → negamax → rootSearch → search (l'API appelée par le Worker).
 */
(function (global) {
  'use strict';

  // Mêmes sources que dans les autres modules : navigateur d'abord, Node ensuite.
  const CFG = (typeof GameConfig !== 'undefined') ? GameConfig
    : (typeof require !== 'undefined' ? require('../config/game-config.js') : null);
  const Rules = (typeof CheckersRules !== 'undefined') ? CheckersRules
    : (typeof require !== 'undefined' ? require('./game-rules.js') : null);

  const WHITE = CFG.WHITE, BLACK = CFG.BLACK;
  const E = CFG.EVAL; // raccourci vers les poids de l'évaluation (valeur des pièces…)
  const MATE = 1000000; // score « énorme » : une victoire forcée vaut plus que tout
  const TIMEOUT = { __timeout: true }; // signal interne pour interrompre la recherche

  // Qualité d'une entrée de la table de transposition :
  // score exact, borne inférieure (au moins ceci) ou borne supérieure (au plus ceci).
  const TT_FLAG_EXACT = 0, TT_FLAG_LOWER = 1, TT_FLAG_UPPER = 2;
  const TT_MAX_ENTRIES = 300000; // au-delà, on vide la table pour ne pas saturer la mémoire

  /* ============================================================
   * Zobrist Hashing (déterministe, reproductible)
   * Une table de nombres aléatoires fixes : à chaque (case, type de pièce)
   * correspond un nombre. Le « hash » d'une position est le mélange (XOR) de
   * ces nombres. Deux positions identiques donnent toujours le même hash.
   * ============================================================ */

  // IIFE : cette petite fonction est exécutée une seule fois pour fabriquer la
  // table. 'seed' est une graine fixe : les « nombres aléatoires » sont donc
  // toujours les mêmes d'une exécution à l'autre (reproductible, pour les tests).
  const ZOBRIST = (function () {
    let seed = 0x1a2b3c4d;
    /**
     * Génère un nombre « aléatoire » de 32 bits avec l'algorithme xorshift.
     * L'opérateur ^= est un XOR : il mélange les bits. >>>= 0 garde 32 bits.
     * @returns {number} entier entre 0 et 2^32-1
     */
    function rand32() {
      // xorshift32
      seed ^= (seed << 13); seed >>>= 0;
      seed ^= (seed >>> 17);
      seed ^= (seed << 5); seed >>>= 0;
      return seed;
    }
    const table = [];
    for (let i = 0; i < 100; i++) {
      // index 0 = case vide (jamais utilisé), indexes 1..4 = les 4 types de pièces.
      table.push([0, rand32(), rand32(), rand32(), rand32()]);
    }
    return { table, side: rand32() }; // 'side' distingue le joueur au trait
  })();

  /**
   * Calcule le hash (identifiant numérique) d'une position en mélangeant les
   * nombres Zobrist de toutes les pièces présentes, plus celui du joueur au trait.
   * C'est une fonction pure : le plateau n'est pas modifié.
   * @param {number[]} board plateau
   * @param {string} player joueur au trait
   * @returns {number} hash entier positif sur 32 bits
   */
  function computeHash(board, player) {
    let h = 0;
    for (let i = 0; i < 100; i++) {
      const v = board[i];
      if (v) h ^= ZOBRIST.table[i][v]; // XOR : 'retire' et 'ajoute' en une opération
    }
    if (player === BLACK) h ^= ZOBRIST.side; // le camp au trait change le hash
    return h >>> 0; // >>> 0 force un entier positif (pas de signe négatif)
  }

  /**
   * Applique un coup et met à jour le hash SANS recalculer tout le plateau
   * (mise à jour « incrémentale ») : on retire les cases quittées et on ajoute
   * les cases occupées, toujours avec des XOR qui s'annulent deux à deux.
   * @param {number[]} board plateau avant le coup
   * @param {object} move coup à jouer
   * @param {number} hash hash de la position avant le coup
   * @returns {{board:number[], hash:number}} nouveau plateau et nouveau hash
   */
  function applyMoveWithHash(board, move, hash) {
    const next = board.slice();
    const piece = next[move.from];
    let h = hash;
    h ^= ZOBRIST.table[move.from][piece]; // on « efface » la pièce de son départ
    next[move.from] = 0;
    // Puis on efface chaque pièce capturée du hash et du plateau.
    for (let k = 0; k < move.captures.length; k++) {
      const cap = move.captures[k];
      h ^= ZOBRIST.table[cap][next[cap]];
      next[cap] = 0;
    }
    let placed = piece;
    // Promotion : si le pion atteint la dernière ligne, on pose une dame à la place.
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

  /**
   * Donne une note (un score) à une position : plus c'est grand, mieux c'est
   * pour le joueur demandé. L'IA compare ainsi les positions sans « comprendre »
   * le jeu : on lui donne simplement des critères chiffrés.
   * Critères : matériel (pions/dames), avancement, centre, mobilité (liberté de
   * mouvement), sécurité du fond, activité des dames, début de fin de partie.
   * C'est une fonction pure : rien n'est modifié.
   * @param {number[]} board plateau à juger
   * @param {string} player camp pour lequel on calcule la note
   * @returns {number} score positif si 'player' est avantagé, négatif sinon
   */
  function evaluate(board, player) {
    let score = 0;
    let whiteKings = 0, blackKings = 0;
    let whiteMobility = 0, blackMobility = 0;
    let totalPieces = 0;

    for (let i = 0; i < 100; i++) { // on examine chaque case une par une
      const v = board[i];
      if (!v) continue; // case vide : on passe à la suivante
      totalPieces++;
      const r = (i / 10) | 0; // | 0 est une astuce pour tronquer en entier
      const c = i % 10;
      const central = r >= 3 && r <= 6 && c >= 3 && c <= 6; // les 16 cases du centre
      const edge = r === 0 || r === 9 || c === 0 || c === 9; // le bord du damier

      if (v === CFG.WHITE_MAN) {
        // Le pion blanc monte : plus r est petit, plus il a avancé (9 - r).
        score += E.MAN + (9 - r) * E.ADVANCEMENT;
        if (central) score += E.CENTER;
        if (r === 9) score += E.BACK_ROW; // garder son pion de fond = sécurité
        if (edge) score -= 2; // un pion sur le bord a moins de choix
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
        // Le pion noir descend : plus r est grand, plus il a avancé. On SOUSTRAIT
        // car tout ce qui aide les Noirs diminue le score des Blancs.
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

    // Mobilité = nombre de cases libres accessibles : davantage de choix = meilleur.
    score += (whiteMobility - blackMobility) * E.MOBILITY;

    // Fin de partie : valoriser davantage les dames et la mobilité.
    if (totalPieces <= E.ENDGAME_PIECES) {
      score += (whiteKings - blackKings) * E.KING * (E.ENDGAME_KING_BOOST - 1);
      score += (whiteMobility - blackMobility) * E.MOBILITY * (E.ENDGAME_MOBILITY_BOOST - 1);
    }

    // Tempo : léger bonus au joueur au trait.
    score += (player === WHITE ? E.TEMPO : -E.TEMPO);

    // Le score est calculé du point de vue des Blancs ; on le renverse pour les Noirs.
    return player === WHITE ? score : -score;
  }

  /**
   * Compte les cases vides qu'une dame peut atteindre depuis sa position.
   * On regarde les 4 diagonales et on avance jusqu'à un obstacle (while).
   * @param {number[]} board plateau
   * @param {number} r ligne de la dame
   * @param {number} c colonne de la dame
   * @returns {number} nombre de cases accessibles (mobilité de la dame)
   */
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

  /**
   * Compare deux coups : sont-ils équivalents ? On compare départ, arrivée et
   * nombre de pièces prises (le chemin exact n'est pas vérifié ici).
   * @param {object} a premier coup
   * @param {object} b second coup
   * @returns {boolean} true si les deux coups sont les mêmes
   */
  function sameMove(a, b) {
    return a && b && a.from === b.from && a.to === b.to &&
      a.captures.length === b.captures.length;
  }

  /**
   * Classe les coups du plus prometteur au moins prometteur. Pourquoi ? Avec
   * Alpha-Bêta, trouver tôt un bon coup permet d'écarter les autres plus vite.
   * Priorité (du plus fort au plus faible) : coup de la table de transposition,
   * capture, promotion, killer move, puis heuristique 'history'.
   * @param {object[]} moves coups à classer (triés sur place)
   * @param {object} ttMove coup conseillé par la table de transposition
   * @param {object} ctx contexte de recherche (killers, history…)
   * @param {number} ply profondeur actuelle dans l'arbre
   * @returns {object[]} le même tableau, ordonné
   */
  function orderMoves(moves, ttMove, ctx, ply) {
    const killers = ctx.killers[ply] || []; // bons coups trouvés à cette profondeur
    for (const m of moves) {
      let s = 0; // score d'ordre, plus il est grand, plus le coup est essayé tôt
      if (sameMove(m, ttMove)) s += 10000000;
      if (m.isCapture) s += 1000000 + m.captures.length * 10000;
      if (m.promotes) s += 500000;
      for (const k of killers) if (sameMove(m, k)) { s += 400000; break; }
      s += ctx.history[m.from * 100 + m.to] || 0;
      m.__order = s; // on stocke le score sur le coup lui-même
    }
    moves.sort((a, b) => b.__order - a.__order); // tri décroissant
    return moves;
  }

  /**
   * Donne le joueur au trait après un coup. Normalement on alterne ; dans le
   * mode « tour bonus » (chainCaptures), une capture laisse la main au même joueur.
   * @param {string} player joueur qui vient de jouer
   * @param {object} move coup joué
   * @param {object} ctx contexte contenant ruleOptions
   * @returns {string} 'white' ou 'black'
   */
  function nextPlayer(player, move, ctx) {
    return ctx.ruleOptions.chainCaptures && move.isCapture
      ? player
      : Rules.otherPlayer(player);
  }

  /* ============================================================
   * Quiescence Search
   * ============================================================ */

  /**
   * « Quiescence » : quand la recherche normale s'arrête, on prolonge encore un
   * peu l'analyse en ne jouant que des captures. Sans cela, on noterait mal une
   * position où une pièce est sur le point d'être prise. 'qdepth' limite cette
   * extension. Même idée que negamax : récursivité + Alpha-Bêta + inversion du
   * score (-score) à chaque tour.
   * @param {number[]} board plateau
   * @param {string} player joueur au trait
   * @param {number} alpha meilleur score déjà trouvé pour le joueur qui maximise
   * @param {number} beta meilleur score pour l'adversaire (au-delà, on coupe)
   * @param {number} ply profondeur (nombre de demi-coups depuis la racine)
   * @param {number} hash hash de la position
   * @param {object} ctx contexte de recherche
   * @param {number} qdepth profondeur de quiescence restante
   * @returns {number} score de la position
   */
  function quiesce(board, player, alpha, beta, ply, hash, ctx, qdepth) {
    ctx.nodes++; // compteur de positions examinées (pour les stats et le temps)
    // Limite de temps : on ne vérifie l'horloge que toutes les 2048 positions
    // (& 2047 teste si les derniers bits sont tous à 1) pour gagner du temps.
    // Si la date limite est dépassée, on 'lance' TIMEOUT pour tout interrompre.
    if ((ctx.nodes & 2047) === 0 && Date.now() > ctx.deadline) throw TIMEOUT;

    const legal = Rules.getLegalMoves(board, player, ctx.ruleOptions);
    // Pas de coup légal = défaite ; '+ ply' rend la défaite d'autant moins mauvaise
    // qu'elle arrive tard (on préfère perdre au coup 20 qu'au coup 2).
    if (legal.length === 0) return -MATE + ply;

    // La quiescence n'explore que les captures (même en mode « prise facultative »).
    const moves = legal.filter(m => m.isCapture);
    if (moves.length === 0 || qdepth <= 0) return evaluate(board, player);

    orderMoves(moves, null, ctx, ply);

    let best = -Infinity;
    for (const m of moves) {
      const applied = applyMoveWithHash(board, m, hash);
      const score = -quiesce(applied.board, nextPlayer(player, m, ctx), -beta, -alpha, ply + 1, applied.hash, ctx, qdepth - 1);
      if (score > best) best = score;
      if (best > alpha) alpha = best;
      if (alpha >= beta) break; // élagage : cette branche ne peut plus rien changer
    }
    return best;
  }

  /* ============================================================
   * Negamax + Alpha-Bêta
   * ============================================================ */

  /**
   * Cœur de la recherche : Negamax avec élagage Alpha-Bêta.
   * « Minimax » signifie : on suppose que l'adversaire joue le meilleur coup,
   * donc on se prépare au pire. Le Negamax évite d'écrire deux versions (MAX et
   * MIN) : on renvoie toujours le score du point de vue du joueur au trait et
   * on prend simplement -score chez l'adversaire.
   * Alpha = meilleur résultat déjà trouvé ; Beta = seuil au-delà duquel une
   * branche est inutile. Quand alpha >= beta, on coupe la branche (Alpha-Bêta).
   * @param {number[]} board plateau
   * @param {string} player joueur au trait
   * @param {number} depth coups restants à explorer
   * @param {number} alpha borne inférieure (meilleur score connu)
   * @param {number} beta borne supérieure (espoir de l'adversaire)
   * @param {number} ply profondeur depuis la racine
   * @param {number} hash hash de la position
   * @param {object} ctx contexte (TT, killers, history, deadline…)
   * @param {number} pliesNoProgress coups sans prise ni pion depuis la racine
   * @returns {number} meilleur score trouvé pour 'player'
   */
  function negamax(board, player, depth, alpha, beta, ply, hash, ctx, pliesNoProgress) {
    ctx.nodes++;
    // Limite de temps : l'horloge est lue toutes les 1024 positions seulement.
    if ((ctx.nodes & 1023) === 0 && Date.now() > ctx.deadline) throw TIMEOUT;

    // Répétition de position dans l'arbre : valeur de match nul.
    // pathCounts compte les positions sur le chemin en cours (pas toute la partie).
    const seen = ctx.pathCounts.get(hash) || 0;
    if (seen >= 2) return 0;

    // Règle de non-progression : trop de coups sans prise = nul.
    if (pliesNoProgress >= ctx.drawPlies) return 0;

    const moves = Rules.getLegalMoves(board, player, ctx.ruleOptions);
    if (moves.length === 0) return -MATE + ply; // aucune sortie = défaite retardée

    // Profondeur épuisée : on passe à la quiescence au lieu de s'arrêter sec.
    if (depth <= 0) return quiesce(board, player, alpha, beta, ply, hash, ctx, 4);

    // Table de transposition (TT) : si cette position a déjà été calculée assez
    // profondément, le score mémorisé évite de refaire tout le travail.
    let ttMove = null;
    if (ctx.useTT) {
      const entry = ctx.tt.get(hash); // Map : clé = hash, valeur = infos mémorisées
      if (entry) {
        ttMove = entry.move; // même sans score utilisable, le coup conseillé sert à l'ordre
        // On ne réutilise le score que si l'ancienne recherche était assez profonde.
        if (entry.depth >= depth) {
          if (entry.flag === TT_FLAG_EXACT) return entry.score; // valeur certaine
          if (entry.flag === TT_FLAG_LOWER && entry.score >= beta) return entry.score; // au moins
          if (entry.flag === TT_FLAG_UPPER && entry.score <= alpha) return entry.score; // au plus
        }
      }
    }

    orderMoves(moves, ttMove, ctx, ply); // on essaie d'abord les coups prometteurs

    const alphaOrig = alpha; // mémorisé pour savoir si le résultat est une borne
    let bestScore = -Infinity; // -Infinity = « pas encore de meilleur score »
    let bestMove = null;

    ctx.pathCounts.set(hash, seen + 1); // on marque la position comme visitée

    for (const m of moves) {
      const applied = applyMoveWithHash(board, m, hash);
      // Une prise ou un pion qui bouge remet le compteur de non-progression à zéro.
      const childNoProgress = (m.isCapture || Rules.isMan(board[m.from])) ? 0 : pliesNoProgress + 1;
      // Appel récursif : on explore la suite. Les bornes sont échangées et
      // le score est inversé (-) car c'est maintenant l'adversaire qui joue.
      const score = -negamax(
        applied.board, nextPlayer(player, m, ctx), depth - 1,
        -beta, -alpha, ply + 1, applied.hash, ctx, childNoProgress
      );
      if (score > bestScore) { bestScore = score; bestMove = m; }
      if (bestScore > alpha) alpha = bestScore;
      if (alpha >= beta) {
        // Coupure Alpha-Bêta : ce coup est si bon que l'adversaire ne laissera
        // jamais la partie arriver ici. On arrête et on retient le coup ('killer'
        // et 'history') pour l'essayer plus tôt dans les recherches futures.
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

    // Retour arrière : on remet le compteur à sa valeur avant d'être passé ici,
    // car cette position ne fait plus partie du chemin en cours.
    ctx.pathCounts.set(hash, seen);
    if (seen === 0) ctx.pathCounts.delete(hash);

    // Stockage TT : on garde le résultat pour les prochaines recherches.
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

  /**
   * Recherche « à la racine » : essaie chacun des coups possibles une fois, puis
   * appelle negamax pour juger la suite. C'est le niveau le plus haut de l'arbre.
   * @param {number[]} board plateau de départ
   * @param {string} player joueur au trait
   * @param {number} depth profondeur à explorer
   * @param {object} ctx contexte de recherche
   * @param {object[]} legalMoves coups possibles à la racine
   * @param {number} rootHash hash de la position de départ
   * @param {boolean} collectAll si true, calcule le score exact de CHAQUE coup
   *   (nécessaire aux niveaux faciles qui choisissent au hasard parmi les bons coups)
   * @returns {{move:object|null, score:number, depth:number, scored:object[]}}
   *   meilleur coup, son score, la profondeur et tous les coups scorés
   */
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
   * Point d'entrée : recherche le meilleur coup et le renvoie à l'appelant.
   * « Iterative Deepening » : on refait la recherche avec profondeur 1, puis 2,
   * puis 3… On garde le dernier résultat terminé. Ainsi, même si le temps s'écoule,
   * on a toujours un bon coup sous la main, et les coups déjà calculés aident
   * les profondeurs suivantes (grâce à l'ordre des coups et à la TT).
   * @param {number[]} board plateau
   * @param {string} player joueur au trait
   * @param {object} options { difficulty, timeMs, maxDepth, randomness, useTT, capturesOptional, chainCaptures, onProgress }
   * @returns {{move:object|null, score:number, depth:number, nodes:number, timeMs:number, forced?:boolean}}
   *   'forced' est true s'il n'y avait qu'un seul coup jouable
   */
  function search(board, player, options) {
    options = options || {};
    const diff = CFG.DIFFICULTIES[options.difficulty] || CFG.DIFFICULTIES.normal;
    const maxDepth = options.maxDepth || diff.maxDepth || diff.depth;
    const timeMs = options.timeMs || diff.timeMs;
    const randomness = options.randomness !== undefined ? options.randomness : (diff.randomness || 0);
    const useTT = options.useTT !== undefined ? options.useTT : !!diff.useTT;

    const start = Date.now();
    // 'ctx' regroupe toute la mémoire de la recherche et est passé aux fonctions.
    const ctx = {
      nodes: 0, // nombre de positions visitées
      deadline: start + timeMs, // date limite : après, on jette TIMEOUT
      tt: new Map(), // table de transposition (hash → résultat mémorisé)
      killers: [], // bons coups « tueurs » par profondeur
      history: new Int32Array(10000), // tableau de 10000 entiers : score par (départ,arrivée)
      pathCounts: new Map(), // positions déjà vues sur le chemin en cours
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

    // Iterative Deepening : on augmente la profondeur d'un cran à chaque passage.
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
        // Seul notre signal d'expiration est attendu : les vraies erreurs sont
        // relancées pour ne pas masquer un bug. Puis on s'arrête proprement.
        if (err !== TIMEOUT) throw err;
        break;
      }
      if (Date.now() >= ctx.deadline) break;
    }

    // Niveaux faciles : choix au hasard PARMI les bons coups (moins optimisé).
    // La marge définit l'écart de score encore accepté : plus elle est grande,
    // plus l'IA peut choisir un coup imparfait (donc facile à battre).
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

  // Seules ces fonctions sortent de l'IIFE : negamax() et quiesce() restent
  // privées. search() est celle que le Web Worker appellera.
  const api = {
    search,
    evaluate,
    computeHash,
    applyMoveWithHash,
    MATE,
    ZOBRIST
  };

  // UMD : CheckersAI pour le navigateur/Worker, module.exports pour Node.
  global.CheckersAI = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
