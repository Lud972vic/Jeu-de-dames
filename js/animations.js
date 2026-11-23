/**
 * CHECKERS LEGEND 2026 — Animations et effets spéciaux
 * -----------------------------------------------------
 * Particules de capture, confettis de victoire, utilitaires de temporisation.
 * Canvas 2D natif, aucune bibliothèque externe.
 */
(function (global) {
  'use strict';

  const Animations = {
    canvas: null,
    ctx: null,
    particles: [],
    confetti: [],
    running: false,
    dpr: 1,

    init(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this._resize();
      global.addEventListener('resize', () => this._resize());
    },

    resize() {
      this._resize();
    },

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

    /** Coordonnées en pixels CSS relatives au canvas. */
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

    /** Pluie de confettis (victoire). */
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

    reducedMotion() {
      const body = global.document && global.document.body;
      if (body && body.classList.contains('no-animations')) return true;
      return !!(global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches);
    },

    _start() {
      if (this.running) return;
      this.running = true;
      this._last = global.performance ? global.performance.now() : Date.now();
      const frame = () => {
        const now = global.performance ? global.performance.now() : Date.now();
        const dt = Math.min(40, now - this._last) / 16.67;
        this._last = now;
        this._update(dt);
        this._draw();
        if (this.particles.length || this.confetti.length) {
          global.requestAnimationFrame(frame);
        } else {
          this.running = false;
          if (this.ctx) this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        }
      };
      global.requestAnimationFrame(frame);
    },

    _update(dt) {
      for (let i = this.particles.length - 1; i >= 0; i--) {
        const p = this.particles[i];
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += 0.08 * dt;
        p.vx *= 0.985;
        p.life -= p.decay * dt;
        if (p.life <= 0) this.particles.splice(i, 1);
      }
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

    _draw() {
      if (!this.ctx || !this.canvas) return;
      const ctx = this.ctx;
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      ctx.clearRect(0, 0, this.canvas.clientWidth, this.canvas.clientHeight);

      for (const p of this.particles) {
        ctx.globalAlpha = Math.max(0, p.life);
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
        ctx.fill();
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
    },

    sleep(ms) {
      return new Promise(resolve => global.setTimeout(resolve, ms));
    }
  };

  global.Animations = Animations;
  if (typeof module !== 'undefined' && module.exports) module.exports = Animations;
})(typeof globalThis !== 'undefined' ? globalThis : this);
