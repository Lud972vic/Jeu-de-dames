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

/**
 * POUR BIEN COMMENCER (débutant) — Ce fichier est le « chef d'orchestre » d'une
 * partie. Il ne calcule pas les règles lui-même : il appelle game-rules.js et
 * garde en mémoire tout ce qui change pendant la partie (plateau, historique,
 * annulations, compteurs de nul, options, sauvegarde).
 * ---------------------------------------------------------------------------
 * Notions JavaScript utilisées :
 *  - IIFE UMD : le code est enveloppé dans une fonction exécutée tout de suite,
 *    puis exposé comme GameEngine dans le navigateur ou via module.exports (Node).
 *  - class / constructor : un « plan » pour créer des objets ; this désigne
 *    l'objet en cours de construction (ses données s'appellent des propriétés).
 *  - objets ({ ... }) et tableaux ([ ... ]) : l'historique est un tableau de
 *    petits objets { move, notation, player, ... }.
 *  - Map : dictionnaire clé → nombre, ici pour compter les positions répétées.
 *  - spread ({ ...obj }) et slice() : deux façons de COPIER sans abîmer l'original
 *    (indispensable pour l'annulation 'undo').
 *  - Date.now() : l'heure actuelle en millisecondes, pour horodater le début et
 *    les coups de l'historique.
 *  - sérialisation : convertir l'état en un simple objet fait de tableaux/objets,
 *    que l'on pourra enregistrer puis recharger (loadState).
 * Pour lire : commence par constructor/reset, puis playMove/undo, puis serialize.
 */
(function (global) {
  'use strict';

  // Configuration et règles : comme dans game-rules.js, on cherche d'abord dans
  // le navigateur, sinon on charge avec require() sous Node.
  const CFG = (typeof GameConfig !== 'undefined') ? GameConfig
    : (typeof require !== 'undefined' ? require('../config/game-config.js') : null);
  const Rules = (typeof CheckersRules !== 'undefined') ? CheckersRules
    : (typeof require !== 'undefined' ? require('./game-rules.js') : null);

  const WHITE = CFG.WHITE, BLACK = CFG.BLACK; // raccourcis lisibles

  /**
   * Classe représentant une partie complète. Une classe est un modèle : chaque
   * nouvel objet créé avec new GameEngine() possède ses propres données (this).
   * Les méthodes ci-dessous sont les actions possibles sur une partie.
   */
  class GameEngine {
    /**
     * Construit un moteur de partie et le remet à zéro.
     * @param {object} [config] configuration (par défaut CFG)
     */
    constructor(config) {
      this.config = config || CFG;
      this.ruleOptions = { capturesOptional: false, chainCaptures: false }; // options par défaut
      this.reset();
    }

    /**
     * Remet toutes les données à leur valeur initiale (plateau neuf, Blancs
     * au trait, historique vide, compteurs à zéro). Appelé aussi par newGame().
     * @returns {void} rien : l'objet est modifié sur place
     */
    reset() {
      this.board = Rules.createInitialBoard();
      this.currentPlayer = WHITE;
      this.history = [];          // { move, notation, player, boardAfter, status }
      this.undoStack = [];        // snapshots complets (copies avant chaque coup)
      this.positionCounts = new Map(); // clé de position → nombre d'occurrences
      this.pliesSinceProgress = 0; // coups joués sans capture ni déplacement de pion
      this.status = { over: false }; // statut calculé par les règles
      this.mode = 'ai';           // 'ai' | 'pvp'
      this.difficulty = 'normal';
      this.playerColor = WHITE;   // couleur humaine en mode IA
      this.startedAt = Date.now();
      this._registerPosition();  // la position de départ compte déjà pour 1
    }

    /**
     * Démarre une nouvelle partie avec les options choisies (IA ou 2 joueurs,
     * difficulté, couleur du joueur humain, variantes de règles).
     * @param {object} [options] { mode, difficulty, playerColor, capturesOptional, chainCaptures }
     * @returns {GameEngine} l'objet lui-même (pratique pour enchaîner les appels)
     */
    newGame(options) {
      options = options || {}; // valeur par défaut si rien n'est fourni
      this.reset();
      this.mode = options.mode === 'pvp' ? 'pvp' : 'ai';
      this.difficulty = options.difficulty || 'normal';
      this.playerColor = options.playerColor || WHITE;
      // !! transforme la valeur en true/false (booléen), même si elle est absente.
      this.ruleOptions.capturesOptional = !!options.capturesOptional;
      this.ruleOptions.chainCaptures = !!options.chainCaptures;
      this.startedAt = Date.now();
      return this;
    }

    /**
     * Change les options de règles pendant une partie (ne touche pas au plateau).
     * @param {object} [options] capturesOptional / chainCaptures (booléens)
     * @returns {object} les options après modification
     */
    setRuleOptions(options) {
      options = options || {};
      // undefined signifie « pas de changement » : on garde la valeur actuelle.
      if (options.capturesOptional !== undefined) {
        this.ruleOptions.capturesOptional = !!options.capturesOptional;
      }
      if (options.chainCaptures !== undefined) {
        this.ruleOptions.chainCaptures = !!options.chainCaptures;
      }
      return this.ruleOptions;
    }

    /**
     * Demande aux règles la liste des coups autorisés pour le joueur au trait.
     * @returns {object[]} coups légaux, ou [] si la partie est terminée
     */
    getLegalMoves() {
      if (this.status.over) return [];
      return Rules.getLegalMoves(this.board, this.currentPlayer, this.ruleOptions);
    }

    /**
     * Filtre les coups légaux pour ne garder que ceux d'une case donnée.
     * @param {number} square index de la case cliquée
     * @returns {object[]} coups possibles depuis cette case
     */
    getMovesForSquare(square) {
      return this.getLegalMoves().filter(m => m.from === square);
    }

    /**
     * Vérifie qu'un coup reçu de l'interface correspond bien à un coup légal.
     * some() répond true dès qu'UN coup correspond (comparaison des cases, du
     * nombre de prises et du chemin, ce dernier étant comparé en texte via join).
     * @param {object} move coup proposé
     * @returns {boolean} true si le coup est autorisé
     */
    isLegalMove(move) {
      if (!move) return false;
      return this.getLegalMoves().some(m =>
        m.from === move.from && m.to === move.to &&
        m.captures.length === move.captures.length &&
        m.path.join(',') === (move.path || []).join(',')
      );
    }

    /**
     * Joue un coup validé : sauvegarde l'état pour l'annulation, applique le coup,
     * met à jour l'historique, alterne les joueurs et recalcule le statut.
     * Le coup doit avoir la même forme que ceux de getLegalMoves().
     * @param {object} move coup à jouer
     * @returns {{ok:boolean, error?:string, status?:object, move?:object}}
     *   ok indique si le coup a été accepté ; sinon error explique pourquoi
     */
    playMove(move) {
      if (this.status.over) return { ok: false, error: 'Partie terminée' };
      if (!this.isLegalMove(move)) return { ok: false, error: 'Coup illégal' };

      // Snapshot pour l'annulation : on copie TOUT ce qui va changer.
      // Le spread { ...obj } copie un objet ; slice() copie un tableau ;
      // new Map(map) copie un dictionnaire. Ainsi undo() peut tout restaurer.
      this.undoStack.push({
        board: this.board.slice(),
        currentPlayer: this.currentPlayer,
        historyLength: this.history.length,
        positionCounts: new Map(this.positionCounts),
        pliesSinceProgress: this.pliesSinceProgress,
        status: { ...this.status }
      });

      const mover = this.currentPlayer; // on garde le joueur avant le changement
      const piece = this.board[move.from];
      this.board = Rules.applyMove(this.board, move); // nouveau plateau (fonction pure)
      this.history.push({
        move,
        notation: Rules.moveNotation(move),
        player: mover,
        pieceWasMan: Rules.isMan(piece),
        timestamp: Date.now()
      });

      // Progression : une capture ou un déplacement de pion remet le compteur à zéro.
      // Seuls les allers-retours de dames font monter le compteur de non-progression.
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

    /**
     * Annule le dernier coup en restaurant la copie mise de côté par playMove().
     * pop() retire le dernier élément de la pile (principe « dernier entré,
     * premier sorti »). L'historique est raccourci en changeant sa longueur.
     * @returns {object|null} le coup annulé, ou null si rien à annuler
     */
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

    /**
     * Indique s'il reste au moins un coup annulable.
     * @returns {boolean} true si la pile d'annulation n'est pas vide
     */
    canUndo() {
      return this.undoStack.length > 0;
    }

    /**
     * Demande aux règles le nombre de pions et de dames de chaque camp.
     * @returns {{white:object, black:object}} comptes { men, kings, total } par couleur
     */
    getCounts() {
      return {
        white: Rules.countPieces(this.board, WHITE),
        black: Rules.countPieces(this.board, BLACK)
      };
    }

    /**
     * Additionne les pièces prises par chaque joueur au fil de l'historique.
     * @returns {{white:number, black:number}} total de captures par couleur
     */
    getCaptureCounts() {
      let white = 0, black = 0;
      for (const h of this.history) {
        if (!h.move.isCapture) continue; // un déplacement simple ne prend rien
        if (h.player === WHITE) white += h.move.captures.length;
        else black += h.move.captures.length;
      }
      return { white, black };
    }

    /**
     * Méthode interne (préfixe _) : compte la position actuelle dans la Map.
     * set() associe la clé à son nombre de fois, avec 0 si elle est nouvelle.
     * @returns {void} rien
     */
    _registerPosition() {
      const key = Rules.positionKey(this.board, this.currentPlayer);
      this.positionCounts.set(key, (this.positionCounts.get(key) || 0) + 1);
    }

    /**
     * Indique si l'ordinateur doit jouer : mode IA, partie en cours, et joueur
     * au trait différent de la couleur humaine.
     * @returns {boolean} true si c'est au tour de l'IA
     */
    isAITurn() {
      return this.mode === 'ai' && !this.status.over && this.currentPlayer !== this.playerColor;
    }

    /**
     * Sérialise la partie : transforme tous les objets spéciaux (Map, plateau,
     * coups) en simples tableaux/objets que l'on peut enregistrer en mémoire.
     * Array.from(map.entries()) convertit une Map en tableau de paires [clé, valeur].
     * @returns {object} snapshot complet de la partie
     */
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

    /**
     * Recharge une partie à partir d'un snapshot produit par serialize().
     * Array.isArray vérifie que la donnée reçue est bien un tableau (sécurité).
     * new Map(tableauDePaires) refait le dictionnaire à l'envers.
     * @param {object} snapshot état sauvegardé
     * @returns {boolean} true si le chargement a réussi, false si donnée invalide
     */
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

    /**
     * Fournit à l'IA une copie de la position actuelle, sans lui donner accès
     * au reste de la partie (le plateau est copié pour éviter toute modification).
     * @returns {{board:number[], player:string, pliesSinceProgress:number}}
     */
    getPosition() {
      return {
        board: this.board.slice(),
        player: this.currentPlayer,
        pliesSinceProgress: this.pliesSinceProgress
      };
    }
  }

  // UMD : on expose la classe dans le navigateur/Worker (global.GameEngine) et
  // pour Node (module.exports) pour que l'interface puisse créer une partie.
  global.GameEngine = GameEngine;
  if (typeof module !== 'undefined' && module.exports) module.exports = GameEngine;
})(typeof globalThis !== 'undefined' ? globalThis : this);
