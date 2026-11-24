/**
 * CHECKERS LEGEND 2026 — Gestionnaire de paramètres
 * --------------------------------------------------
 * Paramètres persistés localement et appliqués au document
 * (thèmes, couleurs de pions, animations).
 */

/**
 * POUR BIEN DÉBUTER
 * -----------------
 * Ce module gère les « paramètres » : préférences du joueur (thème, difficulté,
 * volume...). DEFAULTS est un objet de configuration qui donne les valeurs de
 * départ. Object.assign({}, DEFAULTS, stored) fusionne trois objets dans un
 * nouveau : les valeurs enregistrées écrasent les valeurs par défaut.
 *
 * Les paramètres sont sauvegardés via StorageManager (donc dans localStorage,
 * sous forme de JSON) puis « appliqués » au document : on modifie des attributs
 * data-* du <body> et des classes CSS, que la feuille de style utilise.
 *
 * matchMedia interroge le système (ici : préférence « réduire les animations ») ;
 * on écoute ses changements pour réappliquer les réglages. Enfin, tout est dans
 * une IIFE (fonction immédiatement appelée) : seul SettingsManager est public.
 */
(function (global) {
  'use strict';

  // CFG donne accès aux noms de clés du stockage (CFG.STORAGE.KEYS.SETTINGS).
  const CFG = global.GameConfig;

  // Schéma des paramètres : chaque clé correspond à un réglage et chaque
  // commentaire en ligne liste les valeurs possibles. Ce modèle sert de
  // référence : on ne le modifie jamais, on copie son contenu dans `settings`.
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
    goreMode: false,          // true = captures sanglantes et répliques acidicules
    decapitationMode: false,  // true = les dames capturées sont décapitées
    boardFlipped: false,      // true = Noirs en bas
    timerMinutes: 10,         // 0 = illimité
    animationSpeed: 1,        // 0.5 | 1 | 1.5
    aiThinkMs: 0,             // 0 = automatique selon la difficulté
    githubPromo: true         // petit message GitHub au lancement du jeu
  };

  // Objet unique utilisé par tout le jeu (un « singleton ») :
  // par exemple SettingsManager.get('theme'). Les champs ci-dessous sont :
  // - DEFAULTS : les valeurs de référence, exposées aussi aux autres modules ;
  // - settings : les valeurs courantes, copie de DEFAULTS ;
  // - _motionBound : évite d'installer deux fois le même écouteur système.
  // Une méthode dont le nom commence par _ est interne à l'objet.
  const SettingsManager = {
    DEFAULTS: DEFAULTS,
    settings: Object.assign({}, DEFAULTS),
    _motionBound: false,

    /**
     * Réagit au changement du réglage système « réduire les animations ».
     * Selon le navigateur, on utilise addEventListener ou l'ancien addListener.
     * @returns {void}
     */
    _bindMotionPreference() {
      if (this._motionBound || !global.matchMedia || !global.document) return;
      const query = global.matchMedia('(prefers-reduced-motion: reduce)');
      if (!query) return;
      const onChange = () => this.apply();
      if (typeof query.addEventListener === 'function') query.addEventListener('change', onChange);
      else if (typeof query.addListener === 'function') query.addListener(onChange);
      this._motionBound = true;
    },

    /**
     * Charge les paramètres enregistrés puis les applique à la page.
     * Les champs absents sont comblés par DEFAULTS grâce à Object.assign.
     * @returns {object} les paramètres courants.
     */
    load() {
      const stored = global.StorageManager
        ? global.StorageManager.get(CFG.STORAGE.KEYS.SETTINGS, {})
        : {};
      this.settings = Object.assign({}, DEFAULTS, stored || {});
      this._bindMotionPreference();
      this.apply();
      return this.settings;
    },

    /**
     * Enregistre les paramètres courants dans le stockage local (JSON).
     * @returns {void}
     */
    save() {
      if (global.StorageManager) {
        global.StorageManager.set(CFG.STORAGE.KEYS.SETTINGS, this.settings);
      }
    },

    /**
     * Lit un seul paramètre.
     * @param {string} key nom du réglage (ex. 'theme').
     * @returns {*} valeur du réglage, ou undefined si la clé n'existe pas.
     */
    get(key) {
      return this.settings[key];
    },

    /**
     * Modifie un paramètre, l'enregistre puis l'applique immédiatement.
     * @param {string} key nom du réglage.
     * @param {*} value nouvelle valeur.
     * @returns {void}
     */
    set(key, value) {
      this.settings[key] = value;
      this.save();
      this.apply();
    },

    /**
     * Rétablit tous les paramètres de départ, enregistre et applique.
     * @returns {void}
     */
    reset() {
      this.settings = Object.assign({}, DEFAULTS);
      this.save();
      this.apply();
    },

    /**
     * Remplace les paramètres par ceux d'un fichier JSON exporté.
     * Par sécurité, on ne garde que les clés connues et dont le type (texte,
     * nombre, booléen...) correspond à celui de DEFAULTS : un fichier bricolé
     * ne peut donc pas casser le jeu. Array.isArray écarte les listes.
     * @param {object} data objet issu de JSON.parse d'un fichier exporté.
     * @returns {boolean} true si l'import a réussi, false si les données sont invalides.
     */
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

    /**
     * Applique les paramètres visuels au document.
     * body.dataset.theme écrit un attribut data-theme, que le CSS utilise.
     * classList.toggle ajoute ou retire une classe selon un booléen.
     * root.style.setProperty fixe une variable CSS (--anim-speed).
     * @returns {void}
     */
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

    /**
     * Inverse le mode d'affichage et retourne le nouveau mode.
     * @returns {string} 'dark' ou 'light'.
     */
    toggleMode() {
      this.set('mode', this.settings.mode === 'light' ? 'dark' : 'light');
      return this.settings.mode;
    }
  };

  // Motif UMD : on publie l'objet dans le navigateur (global.SettingsManager)
  // et on l'exporte aussi pour Node (module.exports).
  global.SettingsManager = SettingsManager;
  if (typeof module !== 'undefined' && module.exports) module.exports = SettingsManager;
})(typeof globalThis !== 'undefined' ? globalThis : this);
