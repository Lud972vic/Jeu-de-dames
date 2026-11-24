/**
 * CHECKERS LEGEND 2026 — Profils de joueurs et sauvegardes nommées
 * ----------------------------------------------------------------
 * Les clés historiques (settings, stats, savegame, savegame:slotN) restent le
 * miroir du profil actif : tout le code existant continue à fonctionner tel quel.
 * Ce module ajoute un registre de profils et les sauvegardes nommées, sans
 * migration destructive des données déjà présentes.
 *
 * Aucune dépendance réseau, compatible navigateur (<script>) et Node (require).
 */

/**
 * POUR BIEN DÉBUTER
 * -----------------
 * Ce module ajoute plusieurs profils de joueurs. Il ne remplace pas les clés
 * historiques (settings, stats, savegame...) : elles restent le « miroir » du
 * profil actif, pour que le code existant continue de fonctionner tel quel.
 *
 * Concept clé : la copie profonde via JSON.parse(JSON.stringify(valeur)).
 * JSON.stringify transforme un objet en texte, JSON.parse le reconstruit ;
 * on obtient une copie indépendante, sans lien avec l'original. La fonction
 * clone() ci-dessous fait exactement cela.
 *
 * Le registre (registry) est un objet { version, activeId, profiles } enregistré
 * en JSON dans localStorage. Une « bascule » de profil se fait en deux temps :
 * snapshot() copie les clés historiques vers le profil, puis restore() réécrit
 * ces clés depuis le profil choisi. find()/filter() servent à chercher ou
 * retirer un profil. IIFE (fonction immédiatement appelée) : seul ProfileManager
 * est rendu public.
 */
(function (global) {
  'use strict';

  // CFG = configuration globale ; Store = gestionnaire de stockage ;
  // KEYS = noms courts des clés localStorage (préfixés par cl2026: dans Store).
  const CFG = global.GameConfig;
  const Store = global.StorageManager;
  const KEYS = CFG.STORAGE.KEYS;

  // Nombre d'emplacements de sauvegarde rapide par profil (slot1, slot2, slot3).
  const SLOT_COUNT = 3;

  /**
   * Fait une copie profonde d'une valeur avec JSON.parse/JSON.stringify.
   * Contrairement à une copie simple, les tableaux et objets imbriqués sont
   * aussi recopiés : modifier la copie ne touche pas l'original.
   * @param {*} value valeur à copier.
   * @returns {*} la copie, ou la valeur telle quelle pour null/undefined.
   */
  const clone = (value) => value === undefined || value === null
    ? value
    : JSON.parse(JSON.stringify(value));

  /**
   * Construit la clé localStorage d'un emplacement de sauvegarde rapide.
   * @param {number} slot numéro de l'emplacement (1 à 3).
   * @returns {string} clé courte, par exemple 'savegame:slot1'.
   */
  const slotKey = (slot) => KEYS.SAVE + ':slot' + slot;

  /**
   * Construit la clé des sauvegardes nommées d'un profil.
   * @param {string} profileId identifiant du profil.
   * @returns {string} clé courte, par exemple 'namedsaves:p_...'.
   */
  const namedKey = (profileId) => KEYS.NAMED_SAVES + ':' + profileId;

  /**
   * Fabrique les paramètres de départ d'un nouveau profil.
   * On part des valeurs par défaut de SettingsManager (ou d'un petit secours),
   * puis on y inscrit le nom et l'avatar choisis.
   * @param {string} name nom du joueur.
   * @param {string} [avatar] identifiant de l'avatar.
   * @returns {object} nouvel objet de paramètres (copie indépendante).
   */
  function defaultSettings(name, avatar) {
    const source = global.SettingsManager && global.SettingsManager.DEFAULTS
      ? global.SettingsManager.DEFAULTS
      : { playerName: 'Joueur', playerAvatar: 'user' };
    const settings = clone(source);
    settings.playerName = name;
    settings.playerAvatar = avatar || 'user';
    return settings;
  }

  /**
   * Fabrique un bilan de statistiques vide pour un nouveau profil.
   * Le secours entre parenthèses sert si Statistics n'est pas chargé.
   * @returns {object} statistiques vides (voir le schéma dans statistics.js).
   */
  function defaultStats() {
    return clone((global.Statistics && global.Statistics.EMPTY) || {
      wins: 0, losses: 0, draws: 0, xp: 0, bestScore: 0,
      games: [], badges: [], streak: 0, bestStreak: 0, solvedPuzzles: []
    });
  }

  /**
   * Génère un identifiant unique pour un profil ou une sauvegarde.
   * Date.now() donne l'heure actuelle (écrite en base 36), complétée par un
   * nombre aléatoire : deux identifiants ont très peu de chances d'être pareils.
   * @returns {string} identifiant commençant par 'p_'.
   */
  function newId() {
    return 'p_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
  }

  // Objet public unique. `registry` contient le registre en mémoire.
  // Les méthodes dont le nom commence par _ sont internes à l'objet.
  const ProfileManager = {
    registry: null,

    /**
     * Crée le registre au premier lancement, sans toucher aux données existantes.
     * S'il n'existe pas encore, on fabrique le profil « default » en copiant les
     * clés historiques (snapshot). On vérifie aussi que activeId pointe bien
     * vers un profil existant.
     * @returns {object} le registre { version, activeId, profiles }.
     */
    ensure() {
      let registry = Store.get(KEYS.PROFILES, null);
      if (!registry || !Array.isArray(registry.profiles) || registry.profiles.length === 0) {
        const profile = this._build('default', 'Joueur', 'user');
        this._snapshotInto(profile);
        registry = { version: 1, activeId: profile.id, profiles: [profile] };
        Store.set(KEYS.PROFILES, registry);
      }
      if (!this._find(registry, registry.activeId)) registry.activeId = registry.profiles[0].id;
      this.registry = registry;
      this.persist();
      return registry;
    },

    /**
     * Construit un profil vide.
     * Forme d'un profil : { id, name, avatar, settings, stats, save, slots }.
     * `save` = sauvegarde principale ; `slots` = objet { 1: ..., 2: ..., 3: ... }.
     * @param {string} id identifiant du profil.
     * @param {string} name nom affiché.
     * @param {string} [avatar] identifiant de l'avatar.
     * @returns {object} le nouveau profil.
     */
    _build(id, name, avatar) {
      return {
        id: id,
        name: name,
        avatar: avatar || 'user',
        settings: defaultSettings(name, avatar),
        stats: defaultStats(),
        save: null,
        slots: {}
      };
    },

    /**
     * Cherche un profil par identifiant dans le registre.
     * @param {object} registry registre des profils.
     * @param {string} id identifiant recherché.
     * @returns {object|null} le profil trouvé, ou null.
     */
    _find(registry, id) {
      return (registry.profiles || []).find((profile) => profile.id === id) || null;
    },

    /**
     * Retourne le profil actif (le registre est créé si besoin).
     * @returns {object} le profil actif, ou le premier profil en secours.
     */
    active() {
      if (!this.registry) this.ensure();
      return this._find(this.registry, this.registry.activeId) || this.registry.profiles[0];
    },

    /**
     * Fabrique une liste allégée des profils pour l'affichage.
     * map() transforme chaque profil en petit objet, sans ses données lourdes.
     * @returns {Array<object>} liste de { id, name, avatar, active, xp, wins, games }.
     */
    list() {
      if (!this.registry) this.ensure();
      return this.registry.profiles.map((profile) => ({
        id: profile.id,
        name: profile.name,
        avatar: profile.avatar,
        active: profile.id === this.registry.activeId,
        xp: (profile.stats && profile.stats.xp) || 0,
        wins: (profile.stats && profile.stats.wins) || 0,
        games: (profile.stats && profile.stats.games && profile.stats.games.length) || 0
      }));
    },

    /**
     * Enregistre le registre en mémoire dans le stockage local (JSON).
     * @returns {boolean} true si l'écriture a réussi, false sinon.
     */
    persist() {
      if (!this.registry) return false;
      return Store.set(KEYS.PROFILES, this.registry);
    },

    /**
     * Copie les clés historiques dans le profil actif.
     * @returns {boolean} true si la copie a été enregistrée.
     */
    snapshot() {
      const profile = this.active();
      this._snapshotInto(profile);
      return this.persist();
    },

    /**
     * Copie les clés historiques (settings, stats, savegame, slots) dans un profil.
     * Chaque valeur passe par clone() pour obtenir une copie indépendante.
     * @param {object} profile profil à mettre à jour.
     * @returns {void}
     */
    _snapshotInto(profile) {
      profile.settings = clone(Store.get(KEYS.SETTINGS, null)) || defaultSettings(profile.name, profile.avatar);
      profile.stats = clone(Store.get(KEYS.STATS, null)) || defaultStats();
      profile.save = clone(Store.get(KEYS.SAVE, null));
      profile.slots = {};
      for (let slot = 1; slot <= SLOT_COUNT; slot++) {
        const save = clone(Store.get(slotKey(slot), null));
        if (save) profile.slots[slot] = save;
      }
    },

    /**
     * Réécrit les clés historiques depuis un profil (utilisé lors d'une bascule).
     * Store.remove() supprime la clé quand la sauvegarde n'existe pas, pour ne
     * pas laisser une ancienne partie « fantôme ».
     * @param {object} profile profil source.
     * @returns {boolean} true (ou false si le profil est absent).
     */
    restore(profile) {
      if (!profile) return false;
      if (profile.settings) Store.set(KEYS.SETTINGS, clone(profile.settings));
      if (profile.stats) Store.set(KEYS.STATS, clone(profile.stats));
      if (profile.save) Store.set(KEYS.SAVE, clone(profile.save));
      else Store.remove(KEYS.SAVE);
      for (let slot = 1; slot <= SLOT_COUNT; slot++) {
        const save = profile.slots && profile.slots[slot];
        if (save) Store.set(slotKey(slot), clone(save));
        else Store.remove(slotKey(slot));
      }
      return true;
    },

    /**
     * Crée un nouveau profil et en fait le profil actif.
     * String(...).trim().slice(0, 18) nettoie le nom : on retire les espaces
     * et on coupe à 18 caractères ; 'Joueur' sert de secours si le nom est vide.
     * @param {string} name nom demandé.
     * @param {string} [avatar] identifiant de l'avatar.
     * @returns {object} le profil créé.
     */
    create(name, avatar) {
      const clean = String(name || '').trim().slice(0, 18) || 'Joueur';
      this.snapshot();
      const profile = this._build(newId(), clean, avatar || 'user');
      this.registry.profiles.push(profile);
      this.registry.activeId = profile.id;
      this.persist();
      this.restore(profile);
      return profile;
    },

    /**
     * Renomme un profil et, s'il est actif, met aussi à jour les paramètres visibles.
     * @param {string} id identifiant du profil.
     * @param {string} name nouveau nom.
     * @returns {boolean} true si le profil existe, false sinon.
     */
    rename(id, name) {
      const profile = this._find(this.registry, id);
      if (!profile) return false;
      const clean = String(name || '').trim().slice(0, 18) || 'Joueur';
      profile.name = clean;
      if (profile.settings) profile.settings.playerName = clean;
      this.persist();
      if (id === this.registry.activeId) {
        const settings = clone(Store.get(KEYS.SETTINGS, null)) || defaultSettings(clean, profile.avatar);
        settings.playerName = clean;
        Store.set(KEYS.SETTINGS, settings);
      }
      return true;
    },

    /**
     * Bascule vers un autre profil : on sauvegarde l'actuel puis on restaure le nouveau.
     * @param {string} id identifiant du profil cible.
     * @returns {object|boolean} le profil choisi, ou false si rien n'a changé.
     */
    select(id) {
      const target = this._find(this.registry, id);
      if (!target || id === this.registry.activeId) return false;
      this.snapshot();
      this.registry.activeId = id;
      this.persist();
      this.restore(target);
      return target;
    },

    /**
     * Supprime un profil (impossible s'il n'en reste qu'un).
     * filter() garde tous les profils sauf celui dont l'id est indiqué.
     * @param {string} id identifiant du profil à supprimer.
     * @returns {boolean} true si la suppression a eu lieu, false sinon.
     */
    remove(id) {
      if (!this.registry || this.registry.profiles.length <= 1) return false;
      const target = this._find(this.registry, id);
      if (!target) return false;
      this.snapshot();
      this.registry.profiles = this.registry.profiles.filter((profile) => profile.id !== id);
      Store.remove(namedKey(id));
      if (id === this.registry.activeId) {
        this.registry.activeId = this.registry.profiles[0].id;
        this.restore(this._find(this.registry, this.registry.activeId));
      }
      this.persist();
      return true;
    },

    /* ---------- Sauvegardes nommées (propres au profil actif) ---------- */
    // Une sauvegarde nommée est un objet { id, name, savedAt, payload } rangé
    // dans une liste propre au profil actif. `payload` contient la partie à
    // retrouver plus tard ; il est copié en profondeur avec clone().

    /**
     * Retourne la liste des sauvegardes nommées du profil actif.
     * @returns {Array<object>} la liste, ou une liste vide.
     */
    listNamed() {
      const profile = this.active();
      const list = Store.get(namedKey(profile.id), []);
      return Array.isArray(list) ? list : [];
    },

    /**
     * Cherche une sauvegarde nommée par identifiant.
     * @param {string} id identifiant recherché.
     * @returns {object|null} la sauvegarde trouvée, ou null.
     */
    getNamed(id) {
      return this.listNamed().find((entry) => entry.id === id) || null;
    },

    /**
     * Ajoute une sauvegarde nommée en tête de la liste (20 maximum).
     * @param {string} name nom choisi par le joueur.
     * @param {*} payload données de la partie à conserver (copiées en profondeur).
     * @returns {object} l'entrée créée { id, name, savedAt, payload }.
     */
    saveNamed(name, payload) {
      const profile = this.active();
      const clean = String(name || '').trim().slice(0, 24) || ('Partie ' + this.listNamed().length);
      const list = this.listNamed();
      const entry = { id: newId(), name: clean, savedAt: Date.now(), payload: clone(payload) };
      list.unshift(entry);
      Store.set(namedKey(profile.id), list.slice(0, 20));
      return entry;
    },

    /**
     * Retire une sauvegarde nommée par identifiant.
     * filter() garde toutes les entrées sauf celle à supprimer.
     * @param {string} id identifiant de la sauvegarde à retirer.
     * @returns {boolean} true si l'écriture a réussi.
     */
    removeNamed(id) {
      const profile = this.active();
      const list = this.listNamed().filter((entry) => entry.id !== id);
      return Store.set(namedKey(profile.id), list);
    }
  };

  // Motif UMD : on publie l'objet dans le navigateur (global.ProfileManager)
  // et on l'exporte aussi pour Node (module.exports).
  global.ProfileManager = ProfileManager;
  if (typeof module !== 'undefined' && module.exports) module.exports = ProfileManager;
})(typeof globalThis !== 'undefined' ? globalThis : this);
