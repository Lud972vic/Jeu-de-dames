/**
 * CHECKERS LEGEND 2026 — Gestionnaire audio
 * ------------------------------------------
 * Sons 100 % locaux (assets/sounds/*.wav) via Web Audio API.
 * Volume et activation contrôlés par les paramètres.
 * Aucune requête réseau autre que les fichiers locaux du projet.
 *
 * POUR UN DÉBUTANT — Comme les autres modules, celui-ci est une IIFE (une
 * fonction appelée immédiatement) qui expose un seul objet, `AudioManager`.
 * `this` désigne cet objet : il garde le contexte audio, les sons chargés et
 * les réglages. La Web Audio API fonctionne ainsi : on crée un `AudioContext`
 * (le moteur audio du navigateur), on charge chaque fichier WAV local en
 * mémoire dans un « buffer » (un tableau de données audio), puis on lit ce
 * buffer avec une `AudioBufferSourceNode` reliée à un `GainNode` (le volume)
 * avant d'envoyer le son à la sortie (`destination`). Le chargement utilise
 * une Promise : `fetch()` récupère le fichier, `.arrayBuffer()` le convertit
 * en données brutes, puis `decodeAudioData()` les décode. Les trois `.then()`
 * s'enchaînent et `.catch()` avale les erreurs silencieusement si un son
 * manque. Les navigateurs bloquent le son jusqu'à une première action de
 * l'utilisateur : c'est le rôle de `unlock()` qui reprend le contexte s'il est
 * en pause (`suspended`). Enfin, le tableau `SOUNDS` liste les sons connus et
 * `volume` (0,7 par défaut) est borné entre 0 et 1.
 */
(function (global) {
  'use strict';

  // Noms des sons : chaque entrée correspond à un fichier WAV local du projet.
  const SOUNDS = ['move', 'capture', 'promote', 'victory', 'click', 'invalid', 'draw'];

  /** Objet singleton qui centralise la lecture des sons du jeu. */
  const AudioManager = {
    ctx: null,       // AudioContext (moteur audio), créé au moment de l'init
    buffers: {},     // sons décodés, classés par nom : objet { nom : buffer }
    enabled: true,   // sons activés ou non (réglage utilisateur)
    volume: 0.7,     // volume par défaut : 0 = muet, 1 = maximum
    _loading: {},    // évite de charger deux fois le même son en même temps
    _unlocked: false,// true après la première interaction utilisateur

    /**
     * Applique les réglages (activation et volume) fournis par le jeu.
     * @param {object} settings réglages contenant `soundsEnabled` et `volume`
     * @returns {void}
     * Concept : `!== false` signifie « activé sauf indication contraire ».
     * `typeof ... === 'number'` vérifie le type avant d'utiliser la valeur.
     */
    configure(settings) {
      this.enabled = settings.soundsEnabled !== false;
      this.volume = typeof settings.volume === 'number' ? settings.volume : 0.7;
    },

    /**
     * Prépare le contexte audio et précharge les sons.
     * @returns {void}
     * Concept : `try`/`catch` protège le code si le navigateur n'a pas
     * l'API audio ou si sa création échoue. Certains navigateurs utilisent
     * l'ancien nom `webkitAudioContext`, d'où le test des deux versions.
     */
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

    /**
     * À appeler sur la première interaction utilisateur.
     * @returns {void}
     * Concept : le navigateur met souvent le contexte en pause (`suspended`)
     * tant que l'utilisateur n'a pas cliqué. `resume()` le relance et renvoie
     * une Promise ; `.catch(function () {})` ignore un éventuel échec.
     */
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

    /**
     * Charge et décode un fichier son en mémoire (une seule fois par son).
     * @param {string} name nom du son (voir le tableau SOUNDS)
     * @returns {void}
     * Concept : `_loading[name]` sert de « verrou » pour ne pas lancer deux
     * chargements identiques. Les `.then()` s'exécutent dans l'ordre quand
     * chaque étape est terminée ; `.catch()` rend le son silencieux s'il est
     * indisponible, sans afficher d'erreur à l'utilisateur.
     */
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

    /**
     * Joue un son s'il est disponible (sinon on tente de le charger).
     * @param {string} name nom du son à jouer
     * @returns {void}
     * Concept : `createBufferSource()` fabrique la source, `createGain()`
     * fabrique le volume, et `connect()` relie les deux jusqu'à la sortie.
     * `Math.max(0, Math.min(1, ...))` borne le volume entre 0 et 1.
     * `start(0)` lance la lecture immédiatement.
     */
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

    /**
     * Inverse l'activation des sons.
     * @returns {boolean} nouvel état (true = sons activés)
     */
    toggle() {
      this.enabled = !this.enabled;
      return this.enabled;
    }
  };

  // Exposition globale (navigateur) et compatibilité Node avec `require()`.
  global.AudioManager = AudioManager;
  if (typeof module !== 'undefined' && module.exports) module.exports = AudioManager;
})(typeof globalThis !== 'undefined' ? globalThis : this);
