/**
 * CHECKERS LEGEND 2026 — Rendu du plateau
 * ----------------------------------------
 * Rendu DOM/CSS du plateau 10×10 et des pièces :
 *  - cases sombres/clairres, coordonnées visuelles
 *  - pièces 3D positionnées en pourcentage (animations fluides)
 *  - sélection, coups possibles, cibles de capture
 *  - animation des déplacements et des prises le long du parcours
 *  - orientation du plateau (Blancs ou Noirs en bas)
 *
 * Le renderer ne contient AUCUNE règle du jeu : il affiche l'état fourni.
 */
(function (global) {
  'use strict';

  const CFG = global.GameConfig;
  const Rules = global.CheckersRules;

  class BoardRenderer {
    constructor(boardEl, piecesEl, options) {
      this.boardEl = boardEl;
      this.piecesEl = piecesEl;
      this.options = options || {};
      this.flipped = false;
      this.pieceEls = new Map(); // square -> element
      this.squareEls = [];
      this.selected = null;
      this.hints = [];
      this.onSquareClick = null;
      this._buildSquares();
    }

    _buildSquares() {
      this.boardEl.innerHTML = '';
      this.squareEls = [];
      for (let i = 0; i < 100; i++) {
        const el = global.document.createElement('div');
        const r = Rules.rowOf(i), c = Rules.colOf(i);
        el.className = 'square ' + (Rules.isDarkSquare(r, c) ? 'dark' : 'light');
        el.dataset.square = String(i);
        el.setAttribute('role', 'gridcell');
        el.setAttribute('aria-label', 'Ligne ' + (r + 1) + ', colonne ' + (c + 1) +
          (Rules.isDarkSquare(r, c) ? ', case jouable' : ', case non jouable'));
        el.tabIndex = Rules.isDarkSquare(r, c) ? 0 : -1;
        this.boardEl.appendChild(el);
        this.squareEls.push(el);
      }
      // Le calque des pièces est un frère du plateau (et non un enfant) :
      // les deux zones doivent donc transmettre les clics au contrôleur.
      const handleClick = (event) => {
        const squareEl = event.target.closest('.square');
        const pieceEl = event.target.closest('.piece');
        let square = null;
        if (pieceEl) square = Number(pieceEl.dataset.square);
        else if (squareEl) square = Number(squareEl.dataset.square);
        if (square !== null && Number.isInteger(square) && this.onSquareClick) {
          this.onSquareClick(square);
        }
      };
      this.boardEl.addEventListener('click', handleClick);
      this.piecesEl.addEventListener('click', handleClick);

      // Navigation clavier : Entrée/Espace joue la case, flèches se déplacent
      // de case jouable en case jouable (les cases claires sont ignorées).
      const handleKey = (event) => {
        const squareEl = event.target.closest('.square');
        if (!squareEl) return;
        const square = Number(squareEl.dataset.square);
        if (!Number.isInteger(square)) return;

        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          if (this.onSquareClick) this.onSquareClick(square);
          return;
        }

        let r = Rules.rowOf(square), c = Rules.colOf(square);
        const step = {
          ArrowLeft: [0, -1], ArrowRight: [0, 1],
          ArrowUp: [-1, 0], ArrowDown: [1, 0]
        }[event.key];
        if (!step) return;
        event.preventDefault();
        do {
          r += step[0];
          c += step[1];
        } while (Rules.inBounds(r, c) && !Rules.isDarkSquare(r, c));
        if (!Rules.inBounds(r, c)) return;
        const target = this.squareEls[Rules.toSquare(r, c)];
        if (target) target.focus();
      };
      this.boardEl.addEventListener('keydown', handleKey);

      this._coordEls = [];
      this._lastMove = null;
      this._updateCoordinates();
    }

    /** Repères a–j / 1–10 placés sur les bords visuels du plateau. */
    _updateCoordinates() {
      if (!this._coordEls) this._coordEls = [];
      this._coordEls.forEach((el) => el.remove());
      this._coordEls = [];
      const files = 'abcdefghij';
      for (let i = 0; i < 100; i++) {
        const pos = this._pos(i);
        const square = this.squareEls[i];
        if (!square) continue;
        if (pos.top === 90) {
          const label = global.document.createElement('span');
          label.className = 'coord-label coord-file';
          label.textContent = files[Rules.colOf(i)];
          square.appendChild(label);
          this._coordEls.push(label);
        }
        if (pos.left === 0) {
          const label = global.document.createElement('span');
          label.className = 'coord-label coord-rank';
          label.textContent = String(10 - Rules.rowOf(i));
          square.appendChild(label);
          this._coordEls.push(label);
        }
      }
    }

    /** Met en évidence le dernier coup joué (départ et arrivée). */
    showLastMove(move) {
      this.clearLastMove();
      if (!move) return;
      const from = this.squareEls[move.from];
      const to = this.squareEls[move.to];
      if (from) from.classList.add('last-move-from');
      if (to) to.classList.add('last-move-to');
      const piece = this.pieceEls.get(move.to);
      if (piece) piece.classList.add('last-moved');
      this._lastMove = move;
    }

    clearLastMove() {
      for (const el of this.squareEls) {
        el.classList.remove('last-move-from', 'last-move-to');
      }
      for (const el of this.pieceEls.values()) el.classList.remove('last-moved');
      this._lastMove = null;
    }

    /** Position en pourcentage (left/top) pour une case, selon l'orientation. */
    _pos(square) {
      let r = Rules.rowOf(square), c = Rules.colOf(square);
      if (this.flipped) { r = 9 - r; c = 9 - c; }
      return { left: c * 10, top: r * 10 };
    }

    setFlipped(flipped) {
      this.flipped = !!flipped;
      this._updateCoordinates();
      this.render(this._lastBoard || new Array(100).fill(0));
    }

    _pieceClass(piece) {
      if (piece === CFG.WHITE_MAN) return 'piece-white man';
      if (piece === CFG.WHITE_KING) return 'piece-white king';
      if (piece === CFG.BLACK_MAN) return 'piece-black man';
      if (piece === CFG.BLACK_KING) return 'piece-black king';
      return '';
    }

    _createPieceEl(square, piece) {
      const el = global.document.createElement('div');
      el.className = 'piece ' + this._pieceClass(piece);
      el.dataset.square = String(square);
      const pos = this._pos(square);
      el.style.left = pos.left + '%';
      el.style.top = pos.top + '%';
      // Une dame est un « doublon » : deux pions empilés surmontés de la couronne.
      const isKing = piece === CFG.WHITE_KING || piece === CFG.BLACK_KING;
      el.innerHTML =
        '<span class="piece-inner piece-inner-bottom"></span>' +
        (isKing ? '<span class="piece-inner piece-inner-top"></span>' : '') +
        '<span class="piece-crown"></span>';
      return el;
    }

    /** Rendu complet du plateau et des pièces. */
    render(board) {
      this._lastBoard = board.slice();
      this.piecesEl.innerHTML = '';
      this.pieceEls.clear();
      for (let i = 0; i < 100; i++) {
        const piece = board[i];
        if (!piece) continue;
        const el = this._createPieceEl(i, piece);
        this.piecesEl.appendChild(el);
        this.pieceEls.set(i, el);
      }
      this.clearHighlights();
    }

    /** Sélection d'une pièce + affichage des coups possibles. */
    showMoves(square, moves, showHints) {
      this.clearHighlights();
      this.selected = square;
      const pieceEl = this.pieceEls.get(square);
      if (pieceEl) pieceEl.classList.add('selected');

      if (!showHints) return;
      const seen = new Set();
      for (const move of moves) {
        if (seen.has(move.to)) continue;
        seen.add(move.to);
        const target = this.squareEls[move.to];
        if (!target) continue;
        target.classList.add(move.isCapture ? 'capture-target' : 'move-target');
        this.hints.push(target);
      }
      // Mise en évidence des pièces adverses capturables.
      const capturedSquares = new Set();
      for (const move of moves) for (const cap of move.captures) capturedSquares.add(cap);
      for (const cap of capturedSquares) {
        const el = this.pieceEls.get(cap);
        if (el) el.classList.add('threatened');
      }
    }

    clearHighlights() {
      this.selected = null;
      this.hints = [];
      for (const el of this.squareEls) {
        el.classList.remove('move-target', 'capture-target');
      }
      for (const el of this.pieceEls.values()) {
        el.classList.remove('selected', 'threatened');
      }
    }

    /** Désactive visuellement l'interaction (tour de l'IA). */
    setInteractive(interactive) {
      this.piecesEl.classList.toggle('not-interactive', !interactive);
    }

    /**
     * Anime un coup (déplacement + captures + promotion).
     * @param {object} move coup issu du moteur
     * @param {object} opts { speed, onCapture(square, index, total) }
     */
    async animateMove(move, opts) {
      opts = opts || {};
      const speed = opts.speed || 1;
      const stepMs = Math.max(60, (CFG.ANIMATION.MOVE_MS / speed));
      const el = this.pieceEls.get(move.from);
      if (!el) return;

      el.classList.add('moving');
      this.clearHighlights();

      const stops = [move.from].concat(move.path);
      for (let i = 1; i < stops.length; i++) {
        const pos = this._pos(stops[i]);
        el.style.left = pos.left + '%';
        el.style.top = pos.top + '%';
        el.dataset.square = String(stops[i]);
        await global.Animations.sleep(stepMs);

        // Capture associée à cette étape (si présente).
        const captureIndex = i - 1;
        const capturedSquare = move.captures[captureIndex];
        if (capturedSquare !== undefined) {
          const capEl = this.pieceEls.get(capturedSquare);
          if (capEl) {
            capEl.classList.add('captured');
            this.pieceEls.delete(capturedSquare);
            global.setTimeout(() => capEl.remove(), 380);
          }
          if (opts.onCapture) {
            opts.onCapture(capturedSquare, captureIndex + 1, move.captures.length);
          }
        }
      }

      el.classList.remove('moving');
      if (move.promotes) {
        el.classList.remove('man');
        el.classList.add('king', 'promoting');

        // Le pion se double : on ajoute le second disque empilé.
        if (!el.querySelector('.piece-inner-top')) {
          const topDisc = global.document.createElement('span');
          topDisc.className = 'piece-inner piece-inner-top';
          const crown = el.querySelector('.piece-crown');
          if (crown) el.insertBefore(topDisc, crown);
          else el.appendChild(topDisc);
        }

        // Éclat doré + étincelles au moment où le pion devient dame.
        const center = this.squareCenter(stops[stops.length - 1]);
        if (global.Animations && !global.Animations.reducedMotion()) {
          global.Animations.burst(center.x, center.y, '#fbbf24', 26);
          global.setTimeout(() => {
            global.Animations.burst(center.x, center.y, '#fff3c4', 14);
          }, 130 / speed);
        }

        global.setTimeout(() => el.classList.remove('promoting'), 900 / speed);
        await global.Animations.sleep(CFG.ANIMATION.PROMOTE_MS / speed);
      }
    }

    /** Position pixel (centre) d'une case relative au plateau. */
    squareCenter(square) {
      const rect = this.boardEl.getBoundingClientRect();
      const pos = this._pos(square);
      return {
        x: rect.width * (pos.left + 5) / 100,
        y: rect.height * (pos.top + 5) / 100
      };
    }

    /** Force le rendu d'une pièce en dame (promotion immédiate sans animation). */
    updatePiece(square, piece) {
      const old = this.pieceEls.get(square);
      if (old) old.remove();
      if (!piece) { this.pieceEls.delete(square); return; }
      const el = this._createPieceEl(square, piece);
      this.piecesEl.appendChild(el);
      this.pieceEls.set(square, el);
    }
  }

  global.BoardRenderer = BoardRenderer;
  if (typeof module !== 'undefined' && module.exports) module.exports = BoardRenderer;
})(typeof globalThis !== 'undefined' ? globalThis : this);
