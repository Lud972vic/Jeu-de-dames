/**
 * CHECKERS LEGEND 2026 — Gestionnaire de paramètres
 * --------------------------------------------------
 * Paramètres persistés localement et appliqués au document
 * (thèmes, couleurs de pions, animations).
 */
(function (global) {
  'use strict';

  const CFG = global.GameConfig;

  const DEFAULTS = {
    theme: 'neon',            // neon | classic | glass | midnight
    pieceStyle: 'neon',       // neon | classic | ruby | emerald
    mode: 'dark',             // dark | light (apparence globale)
    playerName: 'Joueur',     // nom affiché du joueur
    playerAvatar: 'user',     // icône d'avatar (voir index.html)
    coachMode: false,         // barre d'évaluation + conseil
    difficulty: 'normal',
    volume: 0.7,
    soundsEnabled: true,
    animationsEnabled: true,
    particlesEnabled: true,  // fond animé de particules
    particleDensity: 'normal', // low | normal | high
    showLegalMoves: true,
    capturesOptional: false,  // true = la prise n'est plus obligatoire
    chainCaptures: false,     // true = capturer donne un tour supplémentaire
    boardFlipped: false,      // true = Noirs en bas
    timerMinutes: 10,         // 0 = illimité
    animationSpeed: 1,        // 0.5 | 1 | 1.5
    aiThinkMs: 0              // 0 = automatique selon la difficulté
  };

  const SettingsManager = {
    settings: Object.assign({}, DEFAULTS),
    _motionBound: false,

    /** Réagit au changement du réglage système « réduire les animations ». */
    _bindMotionPreference() {
      if (this._motionBound || !global.matchMedia || !global.document) return;
      const query = global.matchMedia('(prefers-reduced-motion: reduce)');
      if (!query) return;
      const onChange = () => this.apply();
      if (typeof query.addEventListener === 'function') query.addEventListener('change', onChange);
      else if (typeof query.addListener === 'function') query.addListener(onChange);
      this._motionBound = true;
    },

    load() {
      const stored = global.StorageManager
        ? global.StorageManager.get(CFG.STORAGE.KEYS.SETTINGS, {})
        : {};
      this.settings = Object.assign({}, DEFAULTS, stored || {});
      this._bindMotionPreference();
      this.apply();
      return this.settings;
    },

    save() {
      if (global.StorageManager) {
        global.StorageManager.set(CFG.STORAGE.KEYS.SETTINGS, this.settings);
      }
    },

    get(key) {
      return this.settings[key];
    },

    set(key, value) {
      this.settings[key] = value;
      this.save();
      this.apply();
    },

    reset() {
      this.settings = Object.assign({}, DEFAULTS);
      this.save();
      this.apply();
    },

    /** Remplace les paramètres par ceux d'un fichier JSON exporté. */
    importData(data) {
      if (!data || typeof data !== 'object' || Array.isArray(data)) return false;
      const next = Object.assign({}, DEFAULTS);
      for (const key of Object.keys(DEFAULTS)) {
        if (Object.prototype.hasOwnProperty.call(data, key) &&
            typeof data[key] === typeof DEFAULTS[key]) {
          next[key] = data[key];
        }
      }
      this.settings = next;
      this.save();
      this.apply();
      return true;
    },

    /** Applique les paramètres visuels au document. */
    apply() {
      const root = global.document.documentElement;
      const body = global.document.body;
      if (!body) return;
      body.dataset.theme = this.settings.theme;
      body.dataset.pieces = this.settings.pieceStyle;
      body.dataset.mode = this.settings.mode === 'light' ? 'light' : 'dark';
      body.classList.toggle('no-animations', !this.settings.animationsEnabled);
      body.classList.toggle('reduced-motion', global.matchMedia &&
        global.matchMedia('(prefers-reduced-motion: reduce)').matches);
      if (this.settings.animationsEnabled) {
        root.style.setProperty('--anim-speed', String(1 / this.settings.animationSpeed));
      }
      const meta = typeof global.document.querySelector === 'function'
        ? global.document.querySelector('meta[name="theme-color"]')
        : null;
      if (meta) {
        meta.setAttribute('content', this.settings.mode === 'light' ? '#eef1fb' : '#07070f');
      }
      if (global.ParticlesBackground && typeof global.ParticlesBackground.sync === 'function') {
        global.ParticlesBackground.sync();
      }
    },

    /** Inverse le mode d'affichage et retourne le nouveau mode. */
    toggleMode() {
      this.set('mode', this.settings.mode === 'light' ? 'dark' : 'light');
      return this.settings.mode;
    }
  };

  global.SettingsManager = SettingsManager;
  if (typeof module !== 'undefined' && module.exports) module.exports = SettingsManager;
})(typeof globalThis !== 'undefined' ? globalThis : this);
