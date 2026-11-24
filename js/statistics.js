/**
 * CHECKERS LEGEND 2026 — Statistiques, XP, niveaux et succès
 * -----------------------------------------------------------
 * Données conservées localement : victoires, défaites, nuls,
 * XP cumulée, meilleur score, historique des 50 dernières parties,
 * succès débloqués et puzzles résolus.
 */

/**
 * POUR BIEN DÉBUTER
 * -----------------
 * Ce module conserve le « bilan » du joueur : victoires, XP, badges, historique.
 * Les données forment un objet (voir EMPTY ci-dessous) enregistré dans
 * localStorage grâce à StorageManager, sous forme de JSON.
 *
 * Rappels sur les outils JavaScript utilisés ici :
 * - un tableau ([]) est une liste ordonnée ; unshift() ajoute au début ;
 * - map() fabrique une nouvelle liste en transformant chaque élément ;
 * - find() cherche le premier élément qui correspond, reduce() cumule une somme ;
 * - Object.assign({}, EMPTY, stored) recopie les champs absents depuis EMPTY ;
 * - slice() copie une liste : on évite ainsi de modifier le modèle EMPTY.
 *
 * Le tout est dans une IIFE (fonction immédiatement appelée) : seul Statistics
 * est rendu public. Les try/catch de StorageManager évitent les plantages.
 */
(function (global) {
  'use strict';

  // CFG donne accès aux barèmes d'XP et aux noms de clés du stockage.
  const CFG = global.GameConfig;

  // Schéma (forme) d'un bilan vide : c'est le modèle de départ, jamais modifié.
  // wins / losses / draws = nombres de victoires, défaites, nuls.
  // xp = points d'expérience ; bestScore = meilleur gain d'XP sur une partie.
  // games = liste des 50 dernières parties ; badges = identifiants des succès.
  // streak = série de victoires en cours ; bestStreak = meilleure série.
  // solvedPuzzles = identifiants des puzzles déjà résolus.
  const EMPTY = {
    wins: 0,
    losses: 0,
    draws: 0,
    xp: 0,
    bestScore: 0,
    games: [],
    badges: [],
    streak: 0,
    bestStreak: 0,
    solvedPuzzles: []
  };

  // Schéma d'un succès : id (identifiant unique), label (nom affiché),
  // desc (description), icon (nom d'icône) et xp (points gagnés en le débloquant).
  const ACHIEVEMENTS = [
    { id: 'first-win',     label: 'Première victoire', desc: 'Gagnez votre première partie.',        icon: 'trophy',   xp: 25 },
    { id: 'win-10',        label: 'Dix victoires',     desc: 'Remportez 10 parties contre l’IA.',     icon: 'medal',    xp: 60 },
    { id: 'expert-slayer', label: 'Tueur d’expert',    desc: 'Battez l’IA au niveau Expert.',         icon: 'crown',    xp: 80 },
    { id: 'streak-3',      label: 'Série en cours',    desc: 'Enchaînez 3 victoires.',                icon: 'star',     xp: 50 },
    { id: 'captor',        label: 'Précision',         desc: 'Capturez 10 pièces en une partie.',     icon: 'x-circle', xp: 40 },
    { id: 'puzzle-3',      label: 'Tacticien',         desc: 'Résolvez 3 puzzles.',                   icon: 'sparkles', xp: 50 }
  ];

  // Objet unique utilisé par le reste du jeu. ACHIEVEMENTS et EMPTY sont
  // exposés pour que d'autres modules (profils, interface) les réutilisent.
  // `data` contient les valeurs courantes ; c'est une copie de EMPTY.
  const Statistics = {
    ACHIEVEMENTS: ACHIEVEMENTS,
    EMPTY: EMPTY,
    data: Object.assign({}, EMPTY),

    /**
     * Charge les statistiques et complète les champs absents depuis EMPTY.
     * Les trois listes (games, badges, solvedPuzzles) sont copiées avec slice()
     * pour ne jamais modifier le modèle EMPTY.
     * @returns {object} les statistiques courantes.
     */
    load() {
      const stored = global.StorageManager
        ? global.StorageManager.get(CFG.STORAGE.KEYS.STATS, null)
        : null;
      this.data = Object.assign({}, EMPTY, stored || {});
      // Copie des tableaux : EMPTY ne doit jamais être modifié par une partie.
      this.data.games = Array.isArray(stored && stored.games) ? stored.games.slice() : [];
      this.data.badges = Array.isArray(stored && stored.badges) ? stored.badges.slice() : [];
      this.data.solvedPuzzles = Array.isArray(stored && stored.solvedPuzzles)
        ? stored.solvedPuzzles.slice() : [];
      return this.data;
    },

    /**
     * Enregistre les statistiques courantes dans le stockage local (JSON).
     * @returns {void}
     */
    save() {
      if (global.StorageManager) {
        global.StorageManager.set(CFG.STORAGE.KEYS.STATS, this.data);
      }
    },

    /**
     * Remplace les statistiques par celles d'un fichier JSON exporté.
     * On ne garde que les clés connues avec le bon type ; les listes sont
     * limitées à 50 éléments avec slice(0, 50) pour rester compatibles.
     * @param {object} data objet issu de JSON.parse d'un fichier exporté.
     * @returns {boolean} true si l'import a réussi, false sinon.
     */
    importData(data) {
      if (!data || typeof data !== 'object' || Array.isArray(data)) return false;
      const next = Object.assign({}, EMPTY);
      for (const key of Object.keys(EMPTY)) {
        if (!Object.prototype.hasOwnProperty.call(data, key)) continue;
        const value = data[key];
        if (Array.isArray(EMPTY[key])) {
          next[key] = Array.isArray(value) ? value.slice(0, 50) : [];
        } else if (typeof value === typeof EMPTY[key]) {
          next[key] = value;
        }
      }
      this.data = next;
      this.save();
      return true;
    },

    /**
     * Calcule le niveau à partir de l'XP cumulée.
     * Math.floor() arrondit à l'entier inférieur : 250 XP = niveau 2,
     * 500 XP = niveau 3 (avec LEVEL_STEP = 250).
     * @returns {number} le niveau actuel (commence à 1).
     */
    level() {
      return Math.floor(this.data.xp / CFG.XP.LEVEL_STEP) + 1;
    },

    /**
     * Décrit la progression dans le niveau en cours.
     * Le reste de la division (%) donne l'XP gagnée depuis le dernier niveau.
     * @returns {{current: number, next: number, total: number, level: number}}
     *   XP dans le niveau, XP nécessaire, XP totale et niveau.
     */
    xpProgress() {
      const step = CFG.XP.LEVEL_STEP;
      return {
        current: this.data.xp % step,
        next: step,
        total: this.data.xp,
        level: this.level()
      };
    },

    /**
     * Liste des succès avec leur état de déblocage.
     * map() fabrique une nouvelle liste ; indexOf(id) !== -1 signifie
     * « cet identifiant est présent dans les succès débloqués ».
     * @returns {Array<object>} copies des succès avec le champ unlocked (booléen).
     */
    badgeList() {
      return ACHIEVEMENTS.map((a) => Object.assign({}, a, {
        unlocked: this.data.badges.indexOf(a.id) !== -1
      }));
    },

    /**
     * Débloque un succès et retourne sa définition, ou null.
     * find() recherche le succès dont l'id correspond. S'il est déjà débloqué
     * ou inconnu, on ne fait rien : c'est une sécurité contre les doublons.
     * @param {string} id identifiant du succès.
     * @returns {object|null} la définition du succès, ou null.
     */
    unlockBadge(id) {
      if (this.data.badges.indexOf(id) !== -1) return null;
      const def = ACHIEVEMENTS.find((a) => a.id === id);
      if (!def) return null;
      this.data.badges.push(id);
      this.data.xp += def.xp;
      this.save();
      return def;
    },

    /**
     * Évalue les conditions de succès après un événement.
     * Chaque test appelle tryUnlock(), une petite fonction locale qui débloque
     * le succès et l'ajoute à la liste des nouveautés.
     * @param {object} [context] contexte : result, difficulty, captures.
     * @returns {Array<object>} succès débloqués à cette occasion.
     */
    checkAchievements(context) {
      context = context || {};
      const unlocked = [];
      const tryUnlock = (id) => {
        const def = this.unlockBadge(id);
        if (def) unlocked.push(def);
      };
      if (this.data.wins >= 1) tryUnlock('first-win');
      if (this.data.wins >= 10) tryUnlock('win-10');
      if (context.result === 'win' && context.difficulty === 'expert') tryUnlock('expert-slayer');
      if (this.data.streak >= 3) tryUnlock('streak-3');
      if ((context.captures || 0) >= 10) tryUnlock('captor');
      if (this.data.solvedPuzzles.length >= 3) tryUnlock('puzzle-3');
      return unlocked;
    },

    /**
     * Enregistre la résolution d'un puzzle (une seule fois par puzzle).
     * @param {string} id identifiant du puzzle.
     * @returns {{xp: number, unlocked: Array<object>}} XP gagnée et succès débloqués.
     */
    awardPuzzle(id) {
      if (this.data.solvedPuzzles.indexOf(id) !== -1) {
        return { xp: 0, unlocked: [] };
      }
      this.data.solvedPuzzles.push(id);
      this.data.xp += 15;
      this.save();
      return { xp: 15, unlocked: this.checkAchievements({}) };
    },

    /**
     * Enregistre une partie terminée et retourne le gain d'XP.
     * La partie est ajoutée en tête de l'historique (unshift), lequel est
     * ensuite coupé à 50 entrées maximum.
     *
     * Forme de `info` : { result, difficulty, casual, notation, replay, moves,
     * duration, captures, mode }. `result` vaut 'win' | 'loss' | 'draw'
     * (ou une couleur en mode deux joueurs). `casual` = true pour une partie
     * locale, sans effet sur l'XP personnelle.
     *
     * @param {object} info informations sur la partie (voir forme ci-dessus).
     * @returns {object} xp gagné, niveau, progression, badges et bonus d'XP.
     */
    recordGame(info) {
      const result = info.result; // 'win' | 'loss' | 'draw' (ou couleur en mode 2 joueurs)
      // On recopie le déroulé de chaque coup (cases, chemin, captures...) pour
      // que l'historique ne partage pas les tableaux d'origine de la partie.
      const replay = {
        notation: Array.isArray(info.notation) ? info.notation.slice() : [],
        replay: Array.isArray(info.replay) ? info.replay.map((m) => ({
          from: m.from, to: m.to,
          path: Array.isArray(m.path) ? m.path.slice() : [],
          captures: Array.isArray(m.captures) ? m.captures.slice() : [],
          isCapture: !!m.isCapture,
          promotes: !!m.promotes
        })) : []
      };

      // Partie locale à deux : historisée sans modifier le bilan XP personnel.
      if (info.casual) {
        this.data.games.unshift(Object.assign({
          date: Date.now(),
          mode: 'pvp',
          difficulty: 'pvp',
          result: result,
          moves: info.moves || 0,
          duration: info.duration || 0,
          captures: info.captures || 0,
          xp: 0
        }, replay));
        if (this.data.games.length > 50) this.data.games.length = 50;
        // Réduire la taille du tableau à 50 supprime les parties les plus anciennes.
        this.save();
        return { xp: 0, level: this.level(), progress: this.xpProgress(), badges: [] };
      }

      let xp = 0;

      if (result === 'win') {
        this.data.wins++;
        this.data.streak++;
        if (this.data.streak > this.data.bestStreak) this.data.bestStreak = this.data.streak;
        xp = CFG.XP.WIN[info.difficulty] || CFG.XP.WIN.normal;
      } else if (result === 'loss') {
        this.data.losses++;
        this.data.streak = 0;
        xp = CFG.XP.LOSS;
      } else {
        this.data.draws++;
        xp = CFG.XP.DRAW;
      }

      // Bonus de captures (plafonné) pour récompenser le jeu actif.
      const captureBonus = Math.min(20, (info.captures || 0) * 2);
      xp += captureBonus;

      this.data.xp += xp;
      if (xp > this.data.bestScore) this.data.bestScore = xp;

      this.data.games.unshift(Object.assign({
        date: Date.now(),
        mode: info.mode || 'ai',
        difficulty: info.difficulty || 'normal',
        result: result,
        moves: info.moves || 0,
        duration: info.duration || 0,
        captures: info.captures || 0,
        xp: xp
      }, replay));
      if (this.data.games.length > 50) this.data.games.length = 50;

      const badges = this.checkAchievements({
        result: result,
        difficulty: info.difficulty,
        captures: info.captures || 0
      });
      this.save();
      return {
        xp: xp,
        level: this.level(),
        progress: this.xpProgress(),
        badges: badges,
        bonusXp: badges.reduce((sum, b) => sum + b.xp, 0)
      };
    }
  };

  // Motif UMD : on publie l'objet dans le navigateur (global.Statistics)
  // et on l'exporte aussi pour Node (module.exports).
  global.Statistics = Statistics;
  if (typeof module !== 'undefined' && module.exports) module.exports = Statistics;
})(typeof globalThis !== 'undefined' ? globalThis : this);
