/**
 * CHECKERS LEGEND 2026 — Moteur de partie
 * ----------------------------------------
 * Machine à états indépendante de l'interface :
 *  - nouvelle partie (IA ou 2 joueurs)
 *  - validation et application des coups
 *  - alternance des joueurs
 *  - historique et annulation (undo)
 *  - compteurs de répétition / progression pour les matchs nuls
 *  - sérialisation complète pour la sauvegarde locale
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

  class GameEngine {
    constructor(config) {
      this.config = config || CFG;
      this.ruleOptions = { capturesOptional: false, chainCaptures: false };
      this.reset();
    }

    reset() {
      this.board = Rules.createInitialBoard();
      this.currentPlayer = WHITE;
      this.history = [];          // { move, notation, player, boardAfter, status }
      this.undoStack = [];        // snapshots complets
      this.positionCounts = new Map();
      this.pliesSinceProgress = 0;
      this.status = { over: false };
      this.mode = 'ai';           // 'ai' | 'pvp'
      this.difficulty = 'normal';
      this.playerColor = WHITE;   // couleur humaine en mode IA
      this.startedAt = Date.now();
      this._registerPosition();
    }

    /** Démarre une nouvelle partie. */
    newGame(options) {
      options = options || {};
      this.reset();
      this.mode = options.mode === 'pvp' ? 'pvp' : 'ai';
      this.difficulty = options.difficulty || 'normal';
      this.playerColor = options.playerColor || WHITE;
      this.ruleOptions.capturesOptional = !!options.capturesOptional;
      this.ruleOptions.chainCaptures = !!options.chainCaptures;
      this.startedAt = Date.now();
      return this;
    }

    /** Met à jour les options de règles en cours de partie. */
    setRuleOptions(options) {
      options = options || {};
      if (options.capturesOptional !== undefined) {
        this.ruleOptions.capturesOptional = !!options.capturesOptional;
      }
      if (options.chainCaptures !== undefined) {
        this.ruleOptions.chainCaptures = !!options.chainCaptures;
      }
      return this.ruleOptions;
    }

    /** Coups légaux du joueur au trait. */
    getLegalMoves() {
      if (this.status.over) return [];
      return Rules.getLegalMoves(this.board, this.currentPlayer, this.ruleOptions);
    }

    /** Coups légaux d'une pièce précise. */
    getMovesForSquare(square) {
      return this.getLegalMoves().filter(m => m.from === square);
    }

    /** Vérifie qu'un coup proposé fait bien partie des coups légaux. */
    isLegalMove(move) {
      if (!move) return false;
      return this.getLegalMoves().some(m =>
        m.from === move.from && m.to === move.to &&
        m.captures.length === move.captures.length &&
        m.path.join(',') === (move.path || []).join(',')
      );
    }

    /**
     * Joue un coup. Retourne { ok, error?, status, move }.
     * Le coup doit provenir de getLegalMoves() (même forme).
     */
    playMove(move) {
      if (this.status.over) return { ok: false, error: 'Partie terminée' };
      if (!this.isLegalMove(move)) return { ok: false, error: 'Coup illégal' };

      // Snapshot pour l'annulation
      this.undoStack.push({
        board: this.board.slice(),
        currentPlayer: this.currentPlayer,
        historyLength: this.history.length,
        positionCounts: new Map(this.positionCounts),
        pliesSinceProgress: this.pliesSinceProgress,
        status: { ...this.status }
      });

      const mover = this.currentPlayer;
      const piece = this.board[move.from];
      this.board = Rules.applyMove(this.board, move);
      this.history.push({
        move,
        notation: Rules.moveNotation(move),
        player: mover,
        pieceWasMan: Rules.isMan(piece),
        timestamp: Date.now()
      });

      // Progression : une capture ou un déplacement de pion remet le compteur à zéro.
      if (move.isCapture || Rules.isMan(piece)) this.pliesSinceProgress = 0;
      else this.pliesSinceProgress++;

      // Option « non réglementaire » : capturer donne un tour supplémentaire.
      this.currentPlayer = (this.ruleOptions.chainCaptures && move.isCapture)
        ? mover
        : Rules.otherPlayer(mover);
      this._registerPosition();
      this.status = Rules.getGameStatus(this.board, this.currentPlayer, {
        repetitionCounts: this.positionCounts,
        pliesSinceProgress: this.pliesSinceProgress,
        drawConfig: this.config.DRAW,
        capturesOptional: this.ruleOptions.capturesOptional
      });

      return { ok: true, move, status: this.status };
    }

    /** Annule le dernier coup. Retourne le coup annulé ou null. */
    undo() {
      if (this.undoStack.length === 0) return null;
      const snap = this.undoStack.pop();
      const undone = this.history[this.history.length - 1] || null;
      this.board = snap.board;
      this.currentPlayer = snap.currentPlayer;
      this.history.length = snap.historyLength;
      this.positionCounts = snap.positionCounts;
      this.pliesSinceProgress = snap.pliesSinceProgress;
      this.status = snap.status;
      return undone;
    }

    /** Nombre de coups annulables. */
    canUndo() {
      return this.undoStack.length > 0;
    }

    /** Compteurs de pièces par joueur. */
    getCounts() {
      return {
        white: Rules.countPieces(this.board, WHITE),
        black: Rules.countPieces(this.board, BLACK)
      };
    }

    /** Nombre de captures effectuées par chaque joueur. */
    getCaptureCounts() {
      let white = 0, black = 0;
      for (const h of this.history) {
        if (!h.move.isCapture) continue;
        if (h.player === WHITE) white += h.move.captures.length;
        else black += h.move.captures.length;
      }
      return { white, black };
    }

    _registerPosition() {
      const key = Rules.positionKey(this.board, this.currentPlayer);
      this.positionCounts.set(key, (this.positionCounts.get(key) || 0) + 1);
    }

    /** Indique si c'est au tour de l'IA. */
    isAITurn() {
      return this.mode === 'ai' && !this.status.over && this.currentPlayer !== this.playerColor;
    }

    /** Sérialisation complète (sauvegarde locale). */
    serialize() {
      return {
        version: this.config.STORAGE.VERSION,
        board: this.board.slice(),
        currentPlayer: this.currentPlayer,
        history: this.history.map(h => ({
          notation: h.notation,
          player: h.player,
          timestamp: h.timestamp,
          move: {
            from: h.move.from, to: h.move.to,
            path: h.move.path.slice(), captures: h.move.captures.slice(),
            isCapture: h.move.isCapture, promotes: h.move.promotes
          }
        })),
        undoStack: this.undoStack.map(s => ({
          board: s.board.slice(),
          currentPlayer: s.currentPlayer,
          historyLength: s.historyLength,
          positionCounts: Array.from(s.positionCounts.entries()),
          pliesSinceProgress: s.pliesSinceProgress,
          status: { ...s.status }
        })),
        positionCounts: Array.from(this.positionCounts.entries()),
        pliesSinceProgress: this.pliesSinceProgress,
        status: { ...this.status },
        mode: this.mode,
        difficulty: this.difficulty,
        playerColor: this.playerColor,
        ruleOptions: { ...this.ruleOptions },
        startedAt: this.startedAt
      };
    }

    /** Recharge une partie sauvegardée. */
    loadState(snapshot) {
      if (!snapshot || !Array.isArray(snapshot.board)) return false;
      this.board = snapshot.board.slice();
      this.currentPlayer = snapshot.currentPlayer === BLACK ? BLACK : WHITE;
      this.history = (snapshot.history || []).map(h => ({
        notation: h.notation,
        player: h.player,
        timestamp: h.timestamp,
        pieceWasMan: true,
        move: {
          from: h.move.from, to: h.move.to,
          path: (h.move.path || []).slice(), captures: (h.move.captures || []).slice(),
          isCapture: !!h.move.isCapture, promotes: !!h.move.promotes
        }
      }));
      this.undoStack = (snapshot.undoStack || []).map(s => ({
        board: s.board.slice(),
        currentPlayer: s.currentPlayer,
        historyLength: s.historyLength,
        positionCounts: new Map(s.positionCounts || []),
        pliesSinceProgress: s.pliesSinceProgress,
        status: { ...s.status }
      }));
      this.positionCounts = new Map(snapshot.positionCounts || []);
      this.pliesSinceProgress = snapshot.pliesSinceProgress || 0;
      this.status = snapshot.status || { over: false };
      this.mode = snapshot.mode === 'pvp' ? 'pvp' : 'ai';
      this.difficulty = snapshot.difficulty || 'normal';
      this.playerColor = snapshot.playerColor === BLACK ? BLACK : WHITE;
      this.ruleOptions = {
        capturesOptional: !!(snapshot.ruleOptions && snapshot.ruleOptions.capturesOptional),
        chainCaptures: !!(snapshot.ruleOptions && snapshot.ruleOptions.chainCaptures)
      };
      this.startedAt = snapshot.startedAt || Date.now();
      return true;
    }

    /** Position actuelle (pour l'IA). */
    getPosition() {
      return {
        board: this.board.slice(),
        player: this.currentPlayer,
        pliesSinceProgress: this.pliesSinceProgress
      };
    }
  }

  global.GameEngine = GameEngine;
  if (typeof module !== 'undefined' && module.exports) module.exports = GameEngine;
})(typeof globalThis !== 'undefined' ? globalThis : this);
