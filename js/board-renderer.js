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
 *
 * POUR UN DÉBUTANT — Tout le fichier est enveloppé dans une « IIFE »
 * (fonction immédiatement appelée) : `(function (global) { ... })(...)`.
 * Elle crée un espace privé pour nos variables, puis expose une seule classe
 * sur l'objet global pour que le reste du jeu puisse s'en servir. Le mot-clé
 * `this` désigne l'instance courante : l'objet qui mémorise le plateau, les
 * pièces et l'état de la sélection. Les cases et pièces sont des éléments du
 * DOM (la page web) fabriqués avec `document.createElement`. Les 100 cases
 * sont rangées dans un tableau (`squareEls`, index 0 à 99) et les pièces dans
 * une `Map` (un tableau associatif qui associe un numéro de case à son élément
 * visuel). Chaque case occupant 10 % du plateau, on positionne les pièces en
 * pourcentage (`left`/`top`) plutôt qu'en pixels : le plateau s'adapte ainsi à
 * toutes les tailles d'écran. `getBoundingClientRect()` sert uniquement à
 * convertir une case en pixels pour y placer les effets spéciaux. Enfin,
 * `async`/`await` permet d'attendre la fin d'une animation avant de passer à
 * l'étape suivante d'un coup, sans figer le navigateur.
 */
(function (global) {
  'use strict';

  // CFG = réglages généraux du jeu ; Rules = outils de calcul des cases.
  const CFG = global.GameConfig;
  const Rules = global.CheckersRules;

  /**
   * Classe du renderer : elle dessine le plateau et les pièces, mais ne
   * connaît pas les règles du jeu (c'est une classe « vue »).
   */
  class BoardRenderer {
    /**
     * Prépare le renderer et construit les 100 cases du plateau.
     * @param {HTMLElement} boardEl élément DOM qui contient les cases
     * @param {HTMLElement} piecesEl élément DOM (calque) qui contient les pièces
     * @param {object} [options] options facultatives de rendu
     * @returns {BoardRenderer} l'objet nouvellement créé (constructeur)
     * Concept : le constructeur est la fonction appelée par `new`. `this`
     * désigne le nouvel objet dans lequel on range l'état du rendu.
     */
    constructor(boardEl, piecesEl, options) {
      this.boardEl = boardEl;
      this.piecesEl = piecesEl;
      this.options = options || {};
      this.flipped = false;             // true = plateau orienté pour les Noirs
      // Map : comme un tableau, mais on accède avec une clé (numéro de case).
      this.pieceEls = new Map(); // square -> element
      this.squareEls = [];              // tableau des 100 cases, index 0..99
      this.selected = null;             // case de la pièce sélectionnée
      this.hints = [];                  // cases en surbrillance (coups possibles)
      this.onSquareClick = null;        // fonction à appeler lors d'un clic
      this._buildSquares();
    }

    /**
     * Crée les 100 cases du plateau et installe les écouteurs de clic/clavier.
     * @returns {void}
     * Concept : `innerHTML = ''` vide le contenu avant de reconstruire.
     * `addEventListener` demande au navigateur de nous prévenir quand un
     * événement survient ; la fonction passée est alors appelée (callback).
     */
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
      /**
       * Callback de clic : retrouve la case cliquée, même si c'est une pièce.
       * @param {Event} event événement de clic fourni par le navigateur
       * @returns {void}
       * Concept : `=>` définit une fonction courte (fonction fléchée).
       * `.closest()` remonte dans le DOM pour trouver l'élément parent qui
       * porte la classe demandée.
       */
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
      /**
       * Callback clavier : Entrée/Espace valide, les flèches déplacent le focus.
       * @param {KeyboardEvent} event événement touche fourni par le navigateur
       * @returns {void}
       * Concept : `event.preventDefault()` annule l'action par défaut du
       * navigateur (par exemple faire défiler la page avec la barre d'espace).
       */
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

      this._coordEls = [];   // étiquettes a-j / 1-10 posées sur les bords
      this._lastMove = null; // dernier coup joué (départ et arrivée)
      this._updateCoordinates();
    }

    /**
     * Repères a–j / 1–10 placés sur les bords visuels du plateau.
     * @returns {void}
     * Concept : on retire d'abord les anciennes étiquettes avec `remove()`,
     * puis on les recrée : il n'y a ainsi jamais de doublon à l'écran.
     */
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

    /**
     * Met en évidence le dernier coup joué (départ et arrivée).
     * @param {object} move coup contenant `from` (départ) et `to` (arrivée)
     * @returns {void}
     * Concept : `classList.add()` ajoute une classe CSS, ce qui change
     * l'apparence sans toucher à la structure de la page.
     */
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

    /**
     * Efface la mise en évidence du dernier coup.
     * @returns {void}
     * Concept : `for...of` parcourt un tableau, tandis que `.values()`
     * parcourt les valeurs d'une `Map`. On retire les classes une à une.
     */
    clearLastMove() {
      for (const el of this.squareEls) {
        el.classList.remove('last-move-from', 'last-move-to');
      }
      for (const el of this.pieceEls.values()) el.classList.remove('last-moved');
      this._lastMove = null;
    }

    /**
     * Position en pourcentage (left/top) pour une case, selon l'orientation.
     * @param {number} square numéro de case (0..99)
     * @returns {{left: number, top: number}} position en pourcentage
     * Concept : 10 cases × 10 % = 100 %. Si le plateau est retourné, on
     * soustrait l'index à 9 pour inverser lignes et colonnes.
     */
    _pos(square) {
      let r = Rules.rowOf(square), c = Rules.colOf(square);
      if (this.flipped) { r = 9 - r; c = 9 - c; }
      return { left: c * 10, top: r * 10 };
    }

    /**
     * Retourne le plateau (Blancs ou Noirs en bas) et redessine l'état courant.
     * @param {boolean} flipped true pour inverser l'orientation
     * @returns {void}
     * Concept : `!!valeur` convertit n'importe quelle valeur en booléen
     * (vrai ou faux). On réutilise le dernier plateau mémorisé dans `_lastBoard`.
     */
    setFlipped(flipped) {
      this.flipped = !!flipped;
      this._updateCoordinates();
      this.render(this._lastBoard || new Array(100).fill(0));
    }

    /**
     * Traduit un code de pièce en classes CSS (couleur et type).
     * @param {number} piece code de la pièce (pion ou dame, blanc ou noir)
     * @returns {string} classes CSS, ou chaîne vide si le code est inconnu
     * Concept : une suite de `if` teste chaque cas ; le premier qui convient
     * renvoie tout de suite une valeur grâce à `return`.
     */
    _pieceClass(piece) {
      if (piece === CFG.WHITE_MAN) return 'piece-white man';
      if (piece === CFG.WHITE_KING) return 'piece-white king';
      if (piece === CFG.BLACK_MAN) return 'piece-black man';
      if (piece === CFG.BLACK_KING) return 'piece-black king';
      return '';
    }

    /**
     * Fabrique l'élément DOM d'une pièce et le place sur sa case.
     * @param {number} square numéro de case (0..99)
     * @param {number} piece code de la pièce à afficher
     * @returns {HTMLElement} nouvel élément (pas encore ajouté à la page)
     * Concept : `element.innerHTML` définit le contenu HTML interne avec des
     * `<span>` ; une dame ajoute un second disque et une couronne.
     */
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

    /**
     * Rendu complet du plateau et des pièces.
     * @param {number[]} board tableau de 100 codes décrivant chaque case
     * @returns {void}
     * Concept : `slice()` copie le tableau pour mémoriser l'état sans que le
     * reste du jeu puisse le modifier ensuite. On vide puis on recrée les pièces.
     */
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

    /**
     * Sélection d'une pièce + affichage des coups possibles.
     * @param {number} square case de la pièce sélectionnée
     * @param {object[]} moves liste des coups autorisés
     * @param {boolean} showHints true pour afficher les cases cibles
     * @returns {void}
     * Concept : un `Set` est une collection sans doublons ; il sert ici à ne
     * mettre en évidence qu'une seule fois chaque case cible.
     */
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

    /**
     * Retire toutes les surbrillances (sélection, cibles, pièces menacées).
     * @returns {void}
     */
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

    /**
     * Désactive visuellement l'interaction (tour de l'IA).
     * @param {boolean} interactive true si le joueur peut cliquer
     * @returns {void}
     * Concept : `classList.toggle(nom, condition)` ajoute la classe si la
     * condition est vraie et la retire sinon. Ici la condition est inversée.
     */
    setInteractive(interactive) {
      this.piecesEl.classList.toggle('not-interactive', !interactive);
    }

    /**
     * Anime un coup (déplacement + captures + promotion).
     * @param {object} move coup issu du moteur (from, to, path, captures, promotes)
     * @param {object} [opts] réglages : `speed` et callback `onCapture`
     * @returns {Promise<void>} promesse résolue quand l'animation est terminée
     * Concept : une fonction `async` renvoie toujours une Promise. `await`
     * met en pause cette fonction jusqu'à la fin de `sleep()`, sans bloquer
     * le navigateur. Le coup avance étape par étape le long de `path` (utile
     * pour les rafles), chaque étape durant au moins 60 millisecondes.
     */
    async animateMove(move, opts) {
      opts = opts || {};
      const speed = opts.speed || 1;
      // Durée d'une étape : réglage du jeu divisé par la vitesse, jamais < 60 ms.
      const stepMs = Math.max(60, (CFG.ANIMATION.MOVE_MS / speed));
      const el = this.pieceEls.get(move.from);
      if (!el) return;

      el.classList.add('moving');
      // Une dame qui mange « frappe » : aura dorée + rotation pendant le coup.
      if (opts.moverIsKing) el.classList.add('queen-strike');
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
          // On retient si la victime était une dame (classe 'king') avant de
          // retirer son élément : le contrôleur s'en sert pour la décapitation.
          const wasKing = !!(capEl && capEl.classList.contains('king'));
          if (capEl) {
            capEl.classList.add('captured');
            this.pieceEls.delete(capturedSquare);
            // On laisse l'animation CSS se terminer avant de retirer l'élément.
            global.setTimeout(() => capEl.remove(), 380);
          }
          if (opts.onCapture) {
            opts.onCapture(capturedSquare, captureIndex + 1, move.captures.length, wasKing);
          }
        }
      }

      el.classList.remove('moving', 'queen-strike');
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

        // L'éclat dure 900 ms, accéléré quand la vitesse dépasse 1.
        global.setTimeout(() => el.classList.remove('promoting'), 900 / speed);
        await global.Animations.sleep(CFG.ANIMATION.PROMOTE_MS / speed);
      }
    }

    /**
     * Position pixel (centre) d'une case relative au plateau.
     * @param {number} square numéro de case (0..99)
     * @returns {{x: number, y: number}} coordonnées en pixels
     * Concept : `getBoundingClientRect()` donne la taille réelle du plateau à
     * l'écran. On ajoute 5 % (la moitié d'une case) pour tomber au centre.
     */
    squareCenter(square) {
      const rect = this.boardEl.getBoundingClientRect();
      const pos = this._pos(square);
      return {
        x: rect.width * (pos.left + 5) / 100,
        y: rect.height * (pos.top + 5) / 100
      };
    }

    /**
     * Force le rendu d'une pièce en dame (promotion immédiate sans animation).
     * @param {number} square numéro de case (0..99)
     * @param {number} piece code de la pièce (0 = case vide)
     * @returns {void}
     * Concept : on remplace l'ancien élément par un nouveau. C'est plus simple
     * que de modifier son HTML en place et cela évite les états intermédiaires.
     */
    updatePiece(square, piece) {
      const old = this.pieceEls.get(square);
      if (old) old.remove();
      if (!piece) { this.pieceEls.delete(square); return; }
      const el = this._createPieceEl(square, piece);
      this.piecesEl.appendChild(el);
      this.pieceEls.set(square, el);
    }
  }

  // On expose la classe sur le global (la fenêtre du navigateur, ou `global`
  // dans Node). Le second test permet aussi un usage avec `require()` dans Node.
  global.BoardRenderer = BoardRenderer;
  if (typeof module !== 'undefined' && module.exports) module.exports = BoardRenderer;
})(typeof globalThis !== 'undefined' ? globalThis : this);
