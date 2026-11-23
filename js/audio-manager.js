/**
 * CHECKERS LEGEND 2026 — Gestionnaire audio
 * ------------------------------------------
 * Sons 100 % locaux (assets/sounds/*.wav) via Web Audio API.
 * Volume et activation contrôlés par les paramètres.
 * Aucune requête réseau autre que les fichiers locaux du projet.
 */
(function (global) {
  'use strict';

  const SOUNDS = ['move', 'capture', 'promote', 'victory', 'click', 'invalid', 'draw'];

  const AudioManager = {
    ctx: null,
    buffers: {},
    enabled: true,
    volume: 0.7,
    _loading: {},
    _unlocked: false,

    configure(settings) {
      this.enabled = settings.soundsEnabled !== false;
      this.volume = typeof settings.volume === 'number' ? settings.volume : 0.7;
    },

    /** Prépare le contexte audio et précharge les sons. */
    init() {
      try {
        const Ctx = global.AudioContext || global.webkitAudioContext;
        if (!Ctx) return;
        this.ctx = new Ctx();
        for (const name of SOUNDS) this._load(name);
      } catch (e) {
        console.warn('[Audio] initialisation impossible :', e);
      }
    },

    /** À appeler sur la première interaction utilisateur. */
    unlock() {
      if (!this.ctx) {
        try {
          const Ctx = global.AudioContext || global.webkitAudioContext;
          if (Ctx) this.ctx = new Ctx();
        } catch (e) { return; }
      }
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume().catch(function () {});
      }
      this._unlocked = true;
    },

    _load(name) {
      if (!this.ctx || this.buffers[name] || this._loading[name]) return;
      this._loading[name] = true;
      const url = 'assets/sounds/' + name + '.wav';
      global.fetch(url)
        .then(function (res) { return res.arrayBuffer(); })
        .then((arrayBuffer) => this.ctx.decodeAudioData(arrayBuffer))
        .then((buffer) => { this.buffers[name] = buffer; })
        .catch(function () { /* son indisponible : silencieux */ });
    },

    play(name) {
      if (!this.enabled || !this.ctx) return;
      const buffer = this.buffers[name];
      if (!buffer) {
        this._load(name);
        return;
      }
      try {
        const source = this.ctx.createBufferSource();
        source.buffer = buffer;
        const gain = this.ctx.createGain();
        gain.gain.value = Math.max(0, Math.min(1, this.volume));
        source.connect(gain);
        gain.connect(this.ctx.destination);
        source.start(0);
      } catch (e) {
        /* lecture impossible : on ignore */
      }
    },

    toggle() {
      this.enabled = !this.enabled;
      return this.enabled;
    }
  };

  global.AudioManager = AudioManager;
  if (typeof module !== 'undefined' && module.exports) module.exports = AudioManager;
})(typeof globalThis !== 'undefined' ? globalThis : this);
