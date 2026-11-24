/**
 * CHECKERS LEGEND 2026 — Fond de particules
 * -----------------------------------------
 * Effet « particles.js » en Canvas 2D natif : points flottants reliés entre
 * eux par des lignes, réaction au curseur, palette adaptée au thème courant.
 * Aucune bibliothèque externe, aucune ressource réseau (100 % offline).
 */
(function (global) {
  'use strict';

  const DENSITY_PRESETS = {
    low:    { divisor: 34000, min: 16, max: 38,  link: 110, speed: 0.65 },
    normal: { divisor: 19000, min: 24, max: 85,  link: 140, speed: 1 },
    high:   { divisor: 12000, min: 40, max: 120, link: 155, speed: 1.3 }
  };

  const ParticlesBackground = {
    canvas: null,
    ctx: null,
    particles: [],
    width: 0,
    height: 0,
    dpr: 1,
    enabled: true,
    animated: true,
    running: false,
    rafId: 0,
    lastTime: 0,
    linkDistance: 140,
    pointerDistance: 165,
    pointer: { x: 0, y: 0, active: false },
    rings: [],
    density: 'normal',
    speedFactor: 1,
    palette: [],
    lightMode: false,
    observer: null,

    /** Initialise le canvas et synchronise l'effet avec les paramètres. */
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

    /** Lit la palette CSS courante (variables de thème) et la convertit en RGB. */
    _refreshPalette() {
      if (!global.document || !global.getComputedStyle) return;
      const body = global.document.body || global.document.documentElement;
      const style = global.getComputedStyle(body);
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

    /** Applique le palier de densité choisi dans les paramètres. */
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

    /** Onde de choc au clic : impulsion locale + anneau lumineux. */
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
      this.rings.push({ x: x, y: y, radius: 6, max: 78, life: 1, decay: 0.05 });
      this._start();
    },

    /** (Re)crée un nombre de particules adapté à la taille de l'écran. */
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

    _motionAllowed() {
      const body = global.document && global.document.body;
      if (body && (body.classList.contains('no-animations') ||
                   body.classList.contains('reduced-motion'))) return false;
      return !(global.matchMedia &&
        global.matchMedia('(prefers-reduced-motion: reduce)').matches);
    },

    /** Met à jour l'état de l'effet (réglage, mouvement réduit, onglet actif). */
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

    _start() {
      if (this.running) return;
      this.running = true;
      this.lastTime = global.performance ? global.performance.now() : Date.now();
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

    _stop() {
      if (!this.running) return;
      this.running = false;
      if (global.cancelAnimationFrame) global.cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    },

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
      for (let i = this.rings.length - 1; i >= 0; i--) {
        const ring = this.rings[i];
        ring.radius += 2.5 * dt;
        ring.life -= ring.decay * dt;
        if (ring.life <= 0 || ring.radius >= ring.max) this.rings.splice(i, 1);
      }
    },

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

    /** Activate/désactive l'effet et persiste le choix. */
    setEnabled(enabled) {
      if (global.SettingsManager) global.SettingsManager.set('particlesEnabled', !!enabled);
      else { this.enabled = !!enabled; this.sync(); }
    }
  };

  global.ParticlesBackground = ParticlesBackground;
  if (typeof module !== 'undefined' && module.exports) module.exports = ParticlesBackground;
})(typeof globalThis !== 'undefined' ? globalThis : this);
