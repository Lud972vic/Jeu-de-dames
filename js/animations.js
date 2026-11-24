/**
 * CHECKERS LEGEND 2026 — Animations et effets spéciaux
 * -----------------------------------------------------
 * Particules de capture, confettis de victoire, utilitaires de temporisation.
 * Canvas 2D natif, aucune bibliothèque externe.
 *
 * POUR UN DÉBUTANT — Le fichier est une IIFE (fonction appelée tout de suite)
 * qui expose un seul objet, `Animations`. `this` désigne cet objet : toutes
 * ses propriétés (tableaux de particules, canvas, etc.) sont partagées par ses
 * méthodes. Les effets sont dessinés sur un canvas avec l'API « Canvas 2D » :
 * `ctx.beginPath()`, `ctx.arc()`, `ctx.fill()` tracent des formes, tandis que
 * `ctx.clearRect()` efface l'image précédente à chaque image. Les objets à
 * afficher vivent dans des tableaux (`particles`, `confetti`, `shockwaves`,
 * `splats`, `cracks`) ; on les fait évoluer avec `_update()` puis on les
 * supprime avec `splice()` lorsqu'ils ont disparu. La boucle est pilotée par
 * `requestAnimationFrame()` : le navigateur rappelle notre fonction `frame`
 * environ 60 fois par seconde. `devicePixelRatio` (dpr) adapte la résolution
 * du canvas aux écrans haute densité afin d'éviter un rendu flou. Les
 * positions sont aléatoires (`Math.random`), le temps est mesuré avec
 * `performance.now()`, et une image est ralentie/accélérée grâce au facteur
 * `dt` (1 ≈ 16,67 ms, soit une image à 60 images/seconde).
 */
(function (global) {
  'use strict';

  /**
   * Objet singleton (une seule instance) qui gère tous les effets du jeu.
   * Les tableaux ci-dessous contiennent les objets actuellement animés.
   */
  const Animations = {
    canvas: null,      // élément <canvas> sur lequel on dessine
    ctx: null,         // contexte de dessin 2D obtenu avec getContext('2d')
    particles: [],     // éclats de capture et étincelles
    confetti: [],      // confettis de victoire
    shockwaves: [],    // anneaux de choc
    splats: [],        // éclaboussures collées au plateau
    cracks: [],        // fissures du plateau
    flash: 0,          // intensité du flash rouge (0 = aucun, max 0,5)
    running: false,    // true tant que la boucle d'animation tourne
    dpr: 1,            // ratio de pixels de l'écran (devicePixelRatio)

    /**
     * Prépare le canvas et surveille les changements de taille de la fenêtre.
     * @param {HTMLCanvasElement} canvas élément <canvas> à utiliser
     * @returns {void}
     * Concept : `getContext('2d')` fournit la « boîte à outils » de dessin.
     */
    init(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this._resize();
      global.addEventListener('resize', () => this._resize());
    },

    /**
     * Méthode publique pour recalculer la taille du canvas (ex. changement de
     * layout).
     * @returns {void}
     */
    resize() {
      this._resize();
    },

    /**
     * Ajuste la taille interne du canvas à celle de son parent et au dpr.
     * @returns {void}
     * Concept : on distingue la taille CSS (ce que voit l'utilisateur) de la
     * taille en pixels du canvas (ce que dessine le navigateur).
     */
    _resize() {
      if (!this.canvas) return;
      this.dpr = global.devicePixelRatio || 1;
      const rect = this.canvas.parentElement
        ? this.canvas.parentElement.getBoundingClientRect()
        : { width: global.innerWidth, height: global.innerHeight };
      this.canvas.width = Math.max(1, Math.round(rect.width * this.dpr));
      this.canvas.height = Math.max(1, Math.round(rect.height * this.dpr));
      this.canvas.style.width = rect.width + 'px';
      this.canvas.style.height = rect.height + 'px';
    },

    /**
     * Lance une gerbe de particules à partir d'un point.
     * @param {number} x coordonnée horizontale (pixels CSS)
     * @param {number} y coordonnée verticale (pixels CSS)
     * @param {string} color couleur des particules (valeur CSS)
     * @param {number} [count] nombre de particules (16 par défaut)
     * @returns {void}
     * Concept : `Math.cos`/`Math.sin` répartissent les particules sur un
     * cercle complet (angle aléatoire entre 0 et 2π). `vx`/`vy` sont les
     * vitesses horizontale et verticale ; `life` diminue jusqu'à 0.
     */
    burst(x, y, color, count) {
      if (this.reducedMotion()) return;
      count = count || 16;
      for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 1.5 + Math.random() * 4;
        this.particles.push({
          x: x, y: y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life: 1,
          decay: 0.015 + Math.random() * 0.02,
          size: 2 + Math.random() * 4,
          color: color || '#22d3ee'
        });
      }
      this._start();
    },

    /**
     * Pluie de confettis (victoire) : 140 morceaux qui tombent depuis le haut.
     * @returns {void}
     * Concept : chaque confetti a une position, une vitesse, une taille et
     * une rotation ; la palette est un tableau de couleurs choisies au hasard.
     */
    celebrate() {
      if (this.reducedMotion()) return;
      const w = this.canvas ? this.canvas.clientWidth : global.innerWidth;
      const colors = ['#a855f7', '#6366f1', '#22d3ee', '#fbbf24', '#f472b6', '#34d399'];
      for (let i = 0; i < 140; i++) {
        this.confetti.push({
          x: Math.random() * w,
          y: -20 - Math.random() * 120,
          vx: (Math.random() - 0.5) * 1.5,
          vy: 1.5 + Math.random() * 3,
          size: 4 + Math.random() * 6,
          rotation: Math.random() * Math.PI,
          vr: (Math.random() - 0.5) * 0.2,
          color: colors[Math.floor(Math.random() * colors.length)],
          life: 1,
          decay: 0.003 + Math.random() * 0.004
        });
      }
      this._start();
    },

    /**
     * Éclat de capture « brutal » : anneau de choc, éclats rouges, flash.
     * @param {number} x position dans le canvas (pixels CSS)
     * @param {number} y position dans le canvas (pixels CSS)
     * @param {number} intensity 1 pour une prise simple, croissant en rafle
     * @returns {void}
     * Concept : l'intensité est bornée entre 1 et 6 (`Math.max`/`Math.min`)
     * pour éviter des effets démesurés ; plus elle est grande, plus il y a
     * d'éclats (jusqu'à 130) et de fissures.
     */
    brutalCapture(x, y, intensity) {
      if (this.reducedMotion()) return;
      const level = Math.max(1, Math.min(6, intensity || 1));

      // Ondes de choc : anneau principal, contre-onde, puis halo en rafle.
      this.shockwaves.push({
        x: x, y: y, radius: 8, max: 70 + level * 26,
        life: 1, decay: 0.032 + level * 0.004, width: 3 + level
      });
      this.shockwaves.push({
        x: x, y: y, radius: 4, max: 38 + level * 18,
        life: 1, decay: 0.06, width: 2
      });
      if (level >= 3) {
        this.shockwaves.push({
          x: x, y: y, radius: 2, max: 120 + level * 20,
          life: 1, decay: 0.08, width: 1.5
        });
      }

      // Fissures du plateau : traits cassés rayonnant depuis l'impact.
      for (let i = 0; i < 5 + level * 2; i++) {
        const angle = (Math.PI * 2 * i) / (5 + level * 2) + (Math.random() - 0.5) * 0.5;
        const points = [{ x: x, y: y }];
        const reach = 22 + Math.random() * (30 + level * 12);
        for (let step = 1; step <= 4; step++) {
          const radius = (reach * step) / 4;
          const wobble = (Math.random() - 0.5) * 0.45;
          points.push({
            x: x + Math.cos(angle + wobble) * radius,
            y: y + Math.sin(angle + wobble) * radius
          });
        }
        this.cracks.push({ points: points, life: 1, decay: 0.045 });
      }

      // Éclats : rouge sang, noir, blanc pour les plus violents, avec gravité.
      const colors = ['#ff0000', '#c40000', '#8b0000', '#ff3b3b', '#ff9b9b', '#ffffff'];
      const count = Math.min(130, 34 + level * 16);
      for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 3 + Math.random() * (5 + level * 1.8);
        this.particles.push({
          x: x, y: y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 1.5,
          life: 1,
          decay: 0.012 + Math.random() * 0.016,
          size: 2 + Math.random() * (3.5 + level * 0.9),
          color: colors[Math.floor(Math.random() * colors.length)],
          gravity: 0.28,
          drag: 0.982,
          shard: true
        });
      }

      // Grosses éclaboussures qui collent au plateau avant de s'estomper.
      for (let i = 0; i < 10 + level * 4; i++) {
        const angle = Math.random() * Math.PI * 2;
        const radius = 6 + Math.random() * (24 + level * 10);
        this.splats.push({
          x: x + Math.cos(angle) * radius,
          y: y + Math.sin(angle) * radius,
          size: 2 + Math.random() * (4 + level),
          rotation: Math.random() * Math.PI,
          color: colors[Math.floor(Math.random() * 4)],
          life: 1,
          decay: 0.012 + Math.random() * 0.012
        });
      }

      this.flash = Math.min(0.5, this.flash + 0.18 + level * 0.06);
      this._start();
    },

    /**
     * Indique si l'utilisateur préfère réduire les animations.
     * @returns {boolean} true si les effets doivent être désactivés
     * Concept : `classList.contains` vérifie une classe CSS sur le body, et
     * `matchMedia` interroge le réglage système « prefers-reduced-motion ».
     */
    reducedMotion() {
      const body = global.document && global.document.body;
      if (body && body.classList.contains('no-animations')) return true;
      return !!(global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches);
    },

    /**
     * Démarre la boucle d'animation si elle n'est pas déjà lancée.
     * @returns {void}
     * Concept : `requestAnimationFrame` demande au navigateur d'appeler notre
     * fonction avant la prochaine image. On calcule `dt` (temps écoulé divisé
     * par 16,67 ms) pour que la vitesse soit la même sur tous les écrans.
     * Tant qu'il reste des objets animés, on demande une nouvelle image ;
     * sinon on efface le canvas et on s'arrête pour économiser le CPU.
     */
    _start() {
      if (this.running) return;
      this.running = true;
      this._last = global.performance ? global.performance.now() : Date.now();
      /**
       * Une image de la boucle : met à jour, dessine, puis recommence.
       * @returns {void}
       */
      const frame = () => {
        const now = global.performance ? global.performance.now() : Date.now();
        const dt = Math.min(40, now - this._last) / 16.67;
        this._last = now;
        this._update(dt);
        this._draw();
        if (this.particles.length || this.confetti.length || this.shockwaves.length ||
            this.splats.length || this.cracks.length || this.flash > 0) {
          global.requestAnimationFrame(frame);
        } else {
          this.running = false;
          if (this.ctx) this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        }
      };
      global.requestAnimationFrame(frame);
    },

    /**
     * Fait évoluer tous les objets animés d'une image.
     * @param {number} dt facteur de temps (1 ≈ 16,67 ms à 60 images/s)
     * @returns {void}
     * Concept : on parcourt les tableaux à l'envers (de la fin vers le début)
     * afin de pouvoir supprimer un élément avec `splice()` sans décaler les
     * index des éléments qui restent à traiter.
     */
    _update(dt) {
      for (let i = this.particles.length - 1; i >= 0; i--) {
        const p = this.particles[i];
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += (p.gravity === undefined ? 0.08 : p.gravity) * dt;
        const drag = p.drag === undefined ? 0.985 : p.drag;
        p.vx *= drag;
        p.vy *= drag;
        p.life -= p.decay * dt;
        if (p.life <= 0) this.particles.splice(i, 1);
      }
      for (let i = this.shockwaves.length - 1; i >= 0; i--) {
        const s = this.shockwaves[i];
        s.radius += (s.max - s.radius) * 0.18 * dt;
        s.life -= s.decay * dt;
        if (s.life <= 0) this.shockwaves.splice(i, 1);
      }
      for (let i = this.splats.length - 1; i >= 0; i--) {
        const s = this.splats[i];
        s.life -= s.decay * dt;
        if (s.life <= 0) this.splats.splice(i, 1);
      }
      for (let i = this.cracks.length - 1; i >= 0; i--) {
        const c = this.cracks[i];
        c.life -= c.decay * dt;
        if (c.life <= 0) this.cracks.splice(i, 1);
      }
      if (this.flash > 0) this.flash = Math.max(0, this.flash - 0.055 * dt);
      for (let i = this.confetti.length - 1; i >= 0; i--) {
        const c = this.confetti[i];
        c.x += c.vx * dt;
        c.y += c.vy * dt;
        c.rotation += c.vr * dt;
        c.vy += 0.02 * dt;
        if (c.y > (this.canvas ? this.canvas.clientHeight : 800) + 40) {
          this.confetti.splice(i, 1);
        }
      }
    },

    /**
     * Dessine tous les effets sur le canvas pour l'image courante.
     * @returns {void}
     * Concept : `setTransform(dpr, ...)` passe en coordonnées CSS, puis
     * `clearRect()` efface tout. `save()`/`restore()` mémorise et restaure
     * l'état du crayon (utile pour ne pas garder la rotation des confettis).
     * `globalAlpha` fixe la transparence ; `arc()`/ellipse()` tracent des formes.
     */
    _draw() {
      if (!this.ctx || !this.canvas) return;
      const ctx = this.ctx;
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      ctx.clearRect(0, 0, this.canvas.clientWidth, this.canvas.clientHeight);

      // Fissures : d'abord le trait sombre, puis une fine ligne rouge vif.
      for (const crack of this.cracks) {
        const alpha = Math.max(0, Math.min(1, crack.life));
        ctx.beginPath();
        ctx.moveTo(crack.points[0].x, crack.points[0].y);
        for (let i = 1; i < crack.points.length; i++) {
          ctx.lineTo(crack.points[i].x, crack.points[i].y);
        }
        ctx.strokeStyle = 'rgba(20, 0, 0, ' + (alpha * 0.9).toFixed(3) + ')';
        ctx.lineWidth = 4 * alpha + 1;
        ctx.stroke();
        ctx.strokeStyle = 'rgba(255, 60, 60, ' + (alpha * 0.8).toFixed(3) + ')';
        ctx.lineWidth = 1.5 * alpha + 0.5;
        ctx.stroke();
      }

      for (const p of this.particles) {
        ctx.globalAlpha = Math.max(0, p.life);
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
        ctx.fill();
        if (p.shard) {
          // Traînée de l'éclat, orientée dans le sens de la vitesse.
          ctx.strokeStyle = p.color;
          ctx.lineWidth = Math.max(1, p.size * p.life * 0.7);
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x - p.vx * 1.6, p.y - p.vy * 1.6);
          ctx.stroke();
        }
      }

      for (const c of this.confetti) {
        ctx.globalAlpha = Math.max(0, Math.min(1, c.life));
        ctx.save();
        ctx.translate(c.x, c.y);
        ctx.rotate(c.rotation);
        ctx.fillStyle = c.color;
        ctx.fillRect(-c.size / 2, -c.size / 4, c.size, c.size / 2);
        ctx.restore();
      }
      ctx.globalAlpha = 1;

      // Éclaboussures collées au plateau.
      for (const s of this.splats) {
        const alpha = Math.max(0, Math.min(1, s.life));
        ctx.fillStyle = s.color;
        ctx.globalAlpha = alpha * 0.8;
        ctx.beginPath();
        ctx.ellipse(s.x, s.y, s.size, s.size * 0.62, s.rotation, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      for (const s of this.shockwaves) {
        const alpha = Math.max(0, Math.min(1, s.life)) * 0.85;
        ctx.strokeStyle = 'rgba(255, 45, 45, ' + alpha.toFixed(3) + ')';
        ctx.lineWidth = s.width * Math.max(0.3, s.life);
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.radius, 0, Math.PI * 2);
        ctx.stroke();
      }

      if (this.flash > 0) {
        ctx.fillStyle = 'rgba(255, 0, 24, ' + this.flash.toFixed(3) + ')';
        ctx.fillRect(0, 0, this.canvas.clientWidth, this.canvas.clientHeight);
      }
    },

    /**
     * Attend un certain temps avant de continuer.
     * @param {number} ms durée d'attente en millisecondes
     * @returns {Promise<void>} promesse résolue après le délai
     * Concept : une Promise représente un résultat futur. Ici `setTimeout`
     * appelle `resolve` à la fin du délai, ce qui permet d'écrire `await`.
     */
    sleep(ms) {
      return new Promise(resolve => global.setTimeout(resolve, ms));
    }
  };

  // Exposition globale (navigateur) et compatibilité Node avec `require()`.
  global.Animations = Animations;
  if (typeof module !== 'undefined' && module.exports) module.exports = Animations;
})(typeof globalThis !== 'undefined' ? globalThis : this);
