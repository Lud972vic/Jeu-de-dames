/**
 * CHECKERS LEGEND 2026 — Statistiques, XP, niveaux et succès
 * -----------------------------------------------------------
 * Données conservées localement : victoires, défaites, nuls,
 * XP cumulée, meilleur score, historique des 50 dernières parties,
 * succès débloqués et puzzles résolus.
 */
(function (global) {
  'use strict';

  const CFG = global.GameConfig;

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

  const ACHIEVEMENTS = [
    { id: 'first-win',     label: 'Première victoire', desc: 'Gagnez votre première partie.',        icon: 'trophy',   xp: 25 },
    { id: 'win-10',        label: 'Dix victoires',     desc: 'Remportez 10 parties contre l’IA.',     icon: 'medal',    xp: 60 },
    { id: 'expert-slayer', label: 'Tueur d’expert',    desc: 'Battez l’IA au niveau Expert.',         icon: 'crown',    xp: 80 },
    { id: 'streak-3',      label: 'Série en cours',    desc: 'Enchaînez 3 victoires.',                icon: 'star',     xp: 50 },
    { id: 'captor',        label: 'Précision',         desc: 'Capturez 10 pièces en une partie.',     icon: 'x-circle', xp: 40 },
    { id: 'puzzle-3',      label: 'Tacticien',         desc: 'Résolvez 3 puzzles.',                   icon: 'sparkles', xp: 50 }
  ];

  const Statistics = {
    ACHIEVEMENTS: ACHIEVEMENTS,
    data: Object.assign({}, EMPTY),

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

    save() {
      if (global.StorageManager) {
        global.StorageManager.set(CFG.STORAGE.KEYS.STATS, this.data);
      }
    },

    /** Remplace les statistiques par celles d'un fichier JSON exporté. */
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

    level() {
      return Math.floor(this.data.xp / CFG.XP.LEVEL_STEP) + 1;
    },

    xpProgress() {
      const step = CFG.XP.LEVEL_STEP;
      return {
        current: this.data.xp % step,
        next: step,
        total: this.data.xp,
        level: this.level()
      };
    },

    /** Liste des succès avec leur état de déblocage. */
    badgeList() {
      return ACHIEVEMENTS.map((a) => Object.assign({}, a, {
        unlocked: this.data.badges.indexOf(a.id) !== -1
      }));
    },

    /** Débloque un succès et retourne sa définition, ou null. */
    unlockBadge(id) {
      if (this.data.badges.indexOf(id) !== -1) return null;
      const def = ACHIEVEMENTS.find((a) => a.id === id);
      if (!def) return null;
      this.data.badges.push(id);
      this.data.xp += def.xp;
      this.save();
      return def;
    },

    /** Évalue les conditions de succès après un événement. */
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

    /** Enregistre la résolution d'un puzzle (une seule fois par puzzle). */
    awardPuzzle(id) {
      if (this.data.solvedPuzzles.indexOf(id) !== -1) {
        return { xp: 0, unlocked: [] };
      }
      this.data.solvedPuzzles.push(id);
      this.data.xp += 15;
      this.save();
      return { xp: 15, unlocked: this.checkAchievements({}) };
    },

    /** Enregistre une partie terminée et retourne le gain d'XP. */
    recordGame(info) {
      const result = info.result; // 'win' | 'loss' | 'draw' (ou couleur en mode 2 joueurs)
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

  global.Statistics = Statistics;
  if (typeof module !== 'undefined' && module.exports) module.exports = Statistics;
})(typeof globalThis !== 'undefined' ? globalThis : this);
