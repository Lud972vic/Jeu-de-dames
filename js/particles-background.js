/**
 * CHECKERS LEGEND 2026 — Fond de particules
 * -----------------------------------------
 * Effet « particles.js » en Canvas 2D natif : points flottants reliés entre
 * eux par des lignes, réaction au curseur, palette adaptée au thème courant.
 * Aucune bibliothèque externe, aucune ressource réseau (100 % offline).
 *
 * POUR UN DÉBUTANT — Le module est une IIFE (fonction appelée immédiatement)
 * qui expose un objet unique, `ParticlesBackground`. À l'intérieur, `this`
 * désigne cet objet : il contient le canvas, le contexte de dessin 2D, le
 * tableau des particules et les réglages. Une particule est un simple objet
 * JavaScript avec une position (x, y), une vitesse (vx, vy), une couleur et
 * une durée de vie. Le dessin se fait avec l'API Canvas 2D (`beginPath`,
 * `moveTo`, `lineTo`, `arc`, `stroke`, `fill`) sur un fond effacé à chaque
 * image par `clearRect`. `devicePixelRatio` (plafonné à 2 ici) ajuste la
 * résolution interne du canvas pour les écrans haute densité. La boucle
 * d'animation utilise `requestAnimationFrame`, et `cancelAnimationFrame`
 * l'arrête quand l'effet est désactivé ou que l'onglet est masqué. Le module
 * écoute plusieurs événements du navigateur : `resize`, `pointermove` (souris/
 * doigt), `pointerdown` (clic dans le vide), `blur` et `visibilitychange`.
 * Un `MutationObserver` surveille les attributs du body pour rafraîchir la
 * palette quand le thème change, et `getComputedStyle` lit les variables CSS.
 * Les couleurs sont enregistrées comme objets `{r, g, b}` pour pouvoir
 * construire des chaînes `rgba(...)` avec une transparence calculée.
 */
(function (global) {
  'use strict';

  /**
   * Paliers de densité : nombre de particules selon la taille de l'écran.
   * - divisor : on divise (largeur × hauteur) par ce nombre pour obtenir le
   *   nombre de points (plus il est petit, plus il y en a) ;
   * - min / max : bornes du nombre de particules ;
   * - link : distance maximale (en pixels) pour relier deux points ;
   * - speed : multiplicateur de vitesse du palier.
   */
  const DENSITY_PRESETS = {
    low:    { divisor: 34000, min: 16, max: 38,  link: 110, speed: 0.65 },
    normal: { divisor: 19000, min: 24, max: 85,  link: 140, speed: 1 },
    high:   { divisor: 12000, min: 40, max: 120, link: 155, speed: 1.3 }
  };

  /**
   * Objet singleton qui gère le fond animé (une seule instance pour la page).
   */
  const ParticlesBackground = {
    canvas: null,        // élément <canvas> du fond
    ctx: null,           // contexte de dessin 2D
    particles: [],       // tableau des points affichés
    width: 0,            // largeur logique (CSS) de la fenêtre
    height: 0,           // hauteur logique (CSS) de la fenêtre
    dpr: 1,              // ratio de pixels de l'écran, plafonné à 2
    enabled: true,       // réglage utilisateur : effet activé
    animated: true,      // true si le mouvement est autorisé
    running: false,      // true si la boucle d'animation tourne
    rafId: 0,            // identifiant renvoyé par requestAnimationFrame
    lastTime: 0,         // horodatage de l'image précédente
    linkDistance: 140,   // distance max pour tracer un lien entre 2 points
    pointerDistance: 165,// distance max pour le lien avec le curseur
    pointer: { x: 0, y: 0, active: false }, // position du curseur
    rings: [],           // ondes de choc déclenchées au clic
    density: 'normal',   // palier courant (low / normal / high)
    speedFactor: 1,      // vitesse du palier courant
    palette: [],         // couleurs lues dans les variables CSS
    lightMode: false,    // true en mode clair (liens plus discrets)
    observer: null,      // MutationObserver qui surveille le thème

    /**
     * Initialise le canvas et synchronise l'effet avec les paramètres.
     * @param {HTMLCanvasElement} canvas élément <canvas> à utiliser
     * @returns {void}
     * Concept : on vérifie d'abord que l'élément sait dessiner, puis on
     * enchaîne les étapes : densité, couleurs, taille, événements, sync.
     */
    init(canvas) {
      if (!canvas || typeof canvas.getContext !== 'function') return;
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this._applyDensity();
      this._refreshPalette();
      this._resize();
      this._bindEvents();
      this.sync();
    },

    /**
     * Installe les écouteurs d'événements du navigateur.
     * @returns {void}
     * Concept : `addEventListener` associe un événement à une fonction.
     * L'option `{ passive: true }` indique qu'on n'annulera pas le comportement
     * par défaut, ce qui aide le navigateur à rester fluide.
     */
    _bindEvents() {
      global.addEventListener('resize', () => this._resize());

      global.addEventListener('pointermove', (event) => {
        this.pointer.x = event.clientX;
        this.pointer.y = event.clientY;
        this.pointer.active = true;
      }, { passive: true });

      global.addEventListener('pointerout', (event) => {
        if (!event.relatedTarget) this.pointer.active = false;
      });
      global.addEventListener('blur', () => { this.pointer.active = false; });

      if (global.document) {
        // Clic dans le vide : onde de choc qui repousse les particules.
        global.document.addEventListener('pointerdown', (event) => {
          const target = event.target;
          if (target && typeof target.closest === 'function' &&
              target.closest('button, a, input, select, textarea, label, .modal-card, .board-frame')) return;
          this._pulseAt(event.clientX, event.clientY);
        }, { passive: true });

        global.document.addEventListener('visibilitychange', () => this.sync());

        // Le thême / le mode clair changent les couleurs CSS : on se resynchronise.
        if (global.MutationObserver && global.document.body) {
          this.observer = new global.MutationObserver(() => this._refreshPalette());
          this.observer.observe(global.document.body, {
            attributes: true,
            attributeFilter: ['data-mode', 'data-theme']
          });
        }
      }
    },

    /**
     * Lit la palette CSS courante (variables de thème) et la convertit en RGB.
     * @returns {void}
     * Concept : `getComputedStyle` donne les valeurs CSS calculées ; on lit
     * les variables avec `getPropertyValue`. La petite fonction `read`
     * utilise une valeur de repli si la variable n'existe pas. Les particules
     * déjà créées sont recolorées pour suivre le nouveau thème.
     */
    _refreshPalette() {
      if (!global.document || !global.getComputedStyle) return;
      const body = global.document.body || global.document.documentElement;
      const style = global.getComputedStyle(body);
      /** Lit une variable CSS ou renvoie une couleur de secours. */
      const read = (name, fallback) => {
        const value = (style.getPropertyValue(name) || '').trim();
        return value || fallback;
      };
      this.lightMode = body.dataset && body.dataset.mode === 'light';
      this.palette = [
        this._toRgb(read('--cyan', '#00aef0')),
        this._toRgb(read('--violet', '#2f6fd4')),
        this._toRgb(read('--text-dim', '#a9bcd8')),
        this._toRgb(read('--gold', '#ffc72c'))
      ].filter(Boolean);

      for (const particle of this.particles) {
        particle.color = this.palette[particle.colorIndex % this.palette.length] || this.palette[0];
      }
      if (this.ctx && this.particles.length && !this.running) this._draw();
    },

    /**
     * Convertit une couleur CSS hexadécimale ou rgb(...) en objet {r, g, b}.
     * @param {string} value valeur CSS à convertir
     * @returns {?{r: number, g: number, b: number}} couleur RGB, ou null
     * Concept : une expression régulière (`/.../`) reconnaît la forme de la
     * chaîne. `parseInt(..., 16)` lit un nombre en base 16 (hexadécimal).
     */
    _toRgb(value) {
      if (!value) return null;
      const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value);
      if (hex) {
        let raw = hex[1];
        if (raw.length === 3) raw = raw.split('').map((c) => c + c).join('');
        return {
          r: parseInt(raw.slice(0, 2), 16),
          g: parseInt(raw.slice(2, 4), 16),
          b: parseInt(raw.slice(4, 6), 16)
        };
      }
      const rgb = /^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/i.exec(value);
      if (rgb) return { r: +rgb[1], g: +rgb[2], b: +rgb[3] };
      return null;
    },

    /**
     * Ajuste la taille du canvas et reconstruit les particules si besoin.
     * @returns {void}
     * Concept : la taille CSS et la taille pixels sont distinctes ; on
     * multiplie par `dpr` pour la seconde. `Math.max(1, ...)` évite un canvas
     * de taille nulle.
     */
    _resize() {
      if (!this.canvas) return;
      this.width = global.innerWidth || this.canvas.clientWidth || 1;
      this.height = global.innerHeight || this.canvas.clientHeight || 1;
      this.dpr = Math.min(2, global.devicePixelRatio || 1);
      this.canvas.width = Math.max(1, Math.round(this.width * this.dpr));
      this.canvas.height = Math.max(1, Math.round(this.height * this.dpr));
      this.canvas.style.width = this.width + 'px';
      this.canvas.style.height = this.height + 'px';
      this._build();
      if (!this.running && this.enabled) this._draw();
    },

    /**
     * Applique le palier de densité choisi dans les paramètres.
     * @returns {boolean} true si le palier a changé depuis la dernière fois
     * Concept : `SettingsManager.get()` lit un réglage sauvegardé. Si la
     * valeur n'est pas reconnue, on retombe sur le palier `normal`.
     */
    _applyDensity() {
      const settings = global.SettingsManager;
      const wanted = settings ? settings.get('particleDensity') : 'normal';
      const density = DENSITY_PRESETS[wanted] ? wanted : 'normal';
      const preset = DENSITY_PRESETS[density];
      const changed = density !== this.density;
      this.density = density;
      this.linkDistance = preset.link;
      this.speedFactor = preset.speed;
      this._preset = preset;
      return changed;
    },

    /**
     * Onde de choc au clic : impulsion locale + anneau lumineux.
     * @param {number} x coordonnée horizontale du clic (pixels CSS)
     * @param {number} y coordonnée verticale du clic (pixels CSS)
     * @returns {void}
     * Concept : on calcule la distance du point au clic. Les points proches
     * reçoivent une vitesse supplémentaire proportionnelle à la proximité.
     * La portée vaut 1,25 fois `pointerDistance` (165 × 1,25).
     */
    _pulseAt(x, y) {
      if (!this.enabled || !this.animated) return;
      const range = this.pointerDistance * 1.25;
      const range2 = range * range;
      for (const p of this.particles) {
        const dx = p.x - x;
        const dy = p.y - y;
        const dist2 = dx * dx + dy * dy;
        if (dist2 > 1 && dist2 < range2) {
          const dist = Math.sqrt(dist2);
          const force = (1 - dist / range) * 1.8;
          p.vx += (dx / dist) * force;
          p.vy += (dy / dist) * force;
        }
      }
      // L'anneau grandit de 6 à 78 pixels et s'estompe (decay 0,05 par image).
      this.rings.push({ x: x, y: y, radius: 6, max: 78, life: 1, decay: 0.05 });
      this._start();
    },

    /**
     * (Re)crée un nombre de particules adapté à la taille de l'écran.
     * @returns {void}
     * Concept : le nombre est calculé puis borné entre `min` et `max` du
     * palier avec `Math.max`/`Math.min`. Si des particules existaient déjà,
     * on garde leurs positions pour éviter un « saut » visuel au redimension.
     * Environ 20 % des points sont des « phares » plus lumineux (`link`).
     */
    _build() {
      if (!this.palette.length) return;
      const preset = this._preset || DENSITY_PRESETS.normal;
      const count = Math.max(preset.min, Math.min(preset.max,
        Math.round(this.width * this.height / preset.divisor)));
      const previous = this.particles;
      this.particles = [];
      for (let i = 0; i < count; i++) {
        const colorIndex = i % this.palette.length;
        this.particles.push({
          x: Math.random() * this.width,
          y: Math.random() * this.height,
          vx: (Math.random() - 0.5) * 0.36,
          vy: (Math.random() - 0.5) * 0.36,
          radius: 1 + Math.random() * 1.5,
          alpha: 0.35 + Math.random() * 0.45,
          colorIndex: colorIndex,
          color: this.palette[colorIndex],
          link: Math.random() < 0.2 // quelques particules « phares » plus lumineuses
        });
      }
      // Conserve les positions existantes lors d'un simple redimensionnement.
      if (previous.length) {
        for (let i = 0; i < this.particles.length && i < previous.length; i++) {
          this.particles[i].x = Math.min(this.width, previous[i].x);
          this.particles[i].y = Math.min(this.height, previous[i].y);
        }
      }
    },

    /**
     * Vérifie que les animations sont autorisées par l'utilisateur/le système.
     * @returns {boolean} true si le mouvement est autorisé
     * Concept : une classe CSS sur le body ou le réglage système
     * « prefers-reduced-motion » peut demander à supprimer les effets.
     */
    _motionAllowed() {
      const body = global.document && global.document.body;
      if (body && (body.classList.contains('no-animations') ||
                   body.classList.contains('reduced-motion'))) return false;
      return !(global.matchMedia &&
        global.matchMedia('(prefers-reduced-motion: reduce)').matches);
    },

    /**
     * Met à jour l'état de l'effet (réglage, mouvement réduit, onglet actif).
     * @returns {void}
     * Concept : cette méthode est le « chef d'orchestre » : elle décide si
     * l'effet doit être visible et animé, puis démarre ou arrête la boucle.
     * `document.hidden` indique que l'onglet n'est pas affiché.
     */
    sync() {
      if (!this.canvas) return;
      const settings = global.SettingsManager;
      this.enabled = !settings || settings.get('particlesEnabled') !== false;
      this.canvas.style.visibility = this.enabled ? '' : 'hidden';
      if (!this.enabled) {
        this._stop();
        return;
      }
      if (this._applyDensity() && this.particles.length) this._build();
      this.animated = this._motionAllowed();
      const hidden = !!(global.document && global.document.hidden);
      if (this.animated && !hidden) this._start();
      else {
        this._stop();
        if (!hidden) this._draw();
      }
    },

    /**
     * Démarre la boucle d'animation avec requestAnimationFrame.
     * @returns {void}
     * Concept : le navigateur appelle la fonction `frame` avant chaque image.
     * `dt` vaut 1 pour une image à 60 i/s ; il est plafonné à 40 ms pour ne
     * pas faire sauter les objets après un long blocage.
     */
    _start() {
      if (this.running) return;
      this.running = true;
      this.lastTime = global.performance ? global.performance.now() : Date.now();
      /** Une image de la boucle : mise à jour, dessin, puis demande suivante. */
      const frame = (now) => {
        if (!this.running) return;
        const time = now || (global.performance ? global.performance.now() : Date.now());
        const dt = Math.min(40, time - this.lastTime) / 16.67;
        this.lastTime = time;
        this._update(dt);
        this._draw();
        this.rafId = global.requestAnimationFrame(frame);
      };
      this.rafId = global.requestAnimationFrame(frame);
    },

    /**
     * Arrête proprement la boucle d'animation.
     * @returns {void}
     * Concept : `cancelAnimationFrame` annule l'image demandée mais pas encore
     * affichée, ce qui évite de continuer à consommer du processeur.
     */
    _stop() {
      if (!this.running) return;
      this.running = false;
      if (global.cancelAnimationFrame) global.cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    },

    /**
     * Fait évoluer les particules et les ondes d'une image.
     * @param {number} dt facteur de temps (1 ≈ 16,67 ms)
     * @returns {void}
     * Concept : les points rebondissent sur les bords en inversant leur
     * vitesse (`Math.abs`). Le curseur repousse les points proches, puis un
     * amortissement (`0.995 ^ dt`) empêche les vitesses de s'emballer.
     */
    _update(dt) {
      const range = this.linkDistance;
      const speed = this.speedFactor || 1;
      for (const p of this.particles) {
        p.x += p.vx * dt * speed;
        p.y += p.vy * dt * speed;

        // Rebond doux sur les bords pour garder une densité homogène.
        if (p.x < 0) { p.x = 0; p.vx = Math.abs(p.vx); }
        if (p.x > this.width) { p.x = this.width; p.vx = -Math.abs(p.vx); }
        if (p.y < 0) { p.y = 0; p.vy = Math.abs(p.vy); }
        if (p.y > this.height) { p.y = this.height; p.vy = -Math.abs(p.vy); }

        // Le curseur repousse légèrement les particules proches (effet « push »).
        if (this.pointer.active) {
          const dx = p.x - this.pointer.x;
          const dy = p.y - this.pointer.y;
          const dist2 = dx * dx + dy * dy;
          if (dist2 > 1 && dist2 < range * range) {
            const dist = Math.sqrt(dist2);
            const force = (1 - dist / range) * 0.045 * dt;
            p.vx += (dx / dist) * force;
            p.vy += (dy / dist) * force;
          }
        }
        // Amortissement pour éviter que les vitesses ne s'emballent.
        p.vx *= Math.pow(0.995, dt);
        p.vy *= Math.pow(0.995, dt);
      }
      // Les ondes de choc grandissent puis disparaissent (parcours à l'envers).
      for (let i = this.rings.length - 1; i >= 0; i--) {
        const ring = this.rings[i];
        ring.radius += 2.5 * dt;
        ring.life -= ring.decay * dt;
        if (ring.life <= 0 || ring.radius >= ring.max) this.rings.splice(i, 1);
      }
    },

    /**
     * Dessine le fond : liens entre points, ondes, liens curseur et points.
     * @returns {void}
     * Concept : `setTransform` passe en coordonnées CSS et `clearRect` efface
     * l'image précédente. On compare les points deux à deux (boucle dans la
     * boucle) pour tracer un lien seulement s'ils sont proches ; la
     * transparence diminue avec la distance. `toFixed(3)` formate le nombre.
     */
    _draw() {
      if (!this.ctx || !this.canvas || !this.palette.length) return;
      const ctx = this.ctx;
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      ctx.clearRect(0, 0, this.width, this.height);

      const link2 = this.linkDistance * this.linkDistance;
      const linkAlpha = this.lightMode ? 0.17 : 0.2;

      // Liens entre particules voisines.
      ctx.lineWidth = 1;
      for (let i = 0; i < this.particles.length; i++) {
        const a = this.particles[i];
        for (let j = i + 1; j < this.particles.length; j++) {
          const b = this.particles[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const dist2 = dx * dx + dy * dy;
          if (dist2 >= link2) continue;
          const alpha = (1 - Math.sqrt(dist2) / this.linkDistance) * linkAlpha;
          const c = a.color || this.palette[0];
          ctx.strokeStyle = 'rgba(' + c.r + ',' + c.g + ',' + c.b + ',' + alpha.toFixed(3) + ')';
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }

      // Ondes de choc déclenchées au clic.
      for (const ring of this.rings) {
        const alpha = Math.max(0, Math.min(1, ring.life)) * 0.5;
        const c = this.palette[0];
        ctx.strokeStyle = 'rgba(' + c.r + ',' + c.g + ',' + c.b + ',' + alpha.toFixed(3) + ')';
        ctx.lineWidth = 1.5 * ring.life + 0.5;
        ctx.beginPath();
        ctx.arc(ring.x, ring.y, ring.radius, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Liens avec le curseur, puis les points.
      if (this.pointer.active) {
        const range2 = this.pointerDistance * this.pointerDistance;
        for (const p of this.particles) {
          const dx = p.x - this.pointer.x;
          const dy = p.y - this.pointer.y;
          const dist2 = dx * dx + dy * dy;
          if (dist2 >= range2) continue;
          const alpha = (1 - Math.sqrt(dist2) / this.pointerDistance) * 0.32;
          ctx.strokeStyle = 'rgba(' + this.palette[0].r + ',' + this.palette[0].g + ',' +
            this.palette[0].b + ',' + alpha.toFixed(3) + ')';
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(this.pointer.x, this.pointer.y);
          ctx.stroke();
        }
      }

      for (const p of this.particles) {
        const c = p.color || this.palette[0];
        const alpha = Math.min(1, p.alpha + (p.link ? 0.2 : 0));
        ctx.fillStyle = 'rgba(' + c.r + ',' + c.g + ',' + c.b + ',' + alpha.toFixed(3) + ')';
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fill();
      }
    },

    /**
     * Active/désactive l'effet et persiste le choix.
     * @param {boolean} enabled true pour activer le fond animé
     * @returns {void}
     * Concept : `!!enabled` force la valeur en booléen. Si un gestionnaire de
     * paramètres existe, on y enregistre le choix ; sinon on applique directement.
     */
    setEnabled(enabled) {
      if (global.SettingsManager) global.SettingsManager.set('particlesEnabled', !!enabled);
      else { this.enabled = !!enabled; this.sync(); }
    }
  };

  // Exposition globale (navigateur) et compatibilité Node avec `require()`.
  global.ParticlesBackground = ParticlesBackground;
  if (typeof module !== 'undefined' && module.exports) module.exports = ParticlesBackground;
})(typeof globalThis !== 'undefined' ? globalThis : this);
