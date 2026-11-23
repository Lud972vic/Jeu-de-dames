/**
 * CHECKERS LEGEND 2026 — Contrôleur principal
 * --------------------------------------------
 * Orchestre l'interface, le moteur de jeu, l'IA (Web Worker), les
 * animations, les sons, les paramètres, les statistiques et les
 * sauvegardes locales. Aucune dépendance réseau.
 */
(function (global) {
  'use strict';

  const CFG = global.GameConfig;
  const Rules = global.CheckersRules;
  const WHITE = CFG.WHITE;
  const BLACK = CFG.BLACK;

  const $ = (selector, root) => (root || global.document).querySelector(selector);
  const $$ = (selector, root) => Array.prototype.slice.call(
    (root || global.document).querySelectorAll(selector)
  );

  const REASON_LABELS = {
    'no-pieces': 'Toutes les pièces adverses ont été capturées.',
    'no-moves': 'L’adversaire n’a plus aucun coup légal.',
    'repetition': 'Trois répétitions de la même position : match nul.',
    'no-progress': '25 coups sans capture ni mouvement de pion : match nul.',
    'timeout': 'Le temps de réflexion est écoulé.'
  };

  class CheckersApp {
    constructor() {
      this.engine = new global.GameEngine();
      this.renderer = null;
      this.settings = null;
      this.stats = null;

      this.gameActive = false;
      this.gameOverShown = false;
      this.gameToken = 0;
      this.busy = false;
      this.selected = null;
      this.paused = false;

      this.clocks = { white: 0, black: 0 };
      this.unlimited = false;
      this.clockRunningSince = null;
      this.clockTimer = null;
      this.timeoutHandled = false;
      this.lastAutoSave = 0;

      this.aiWorker = null;
      this.aiTimeout = null;
      this.aiThinking = false;
      this.aiRequestId = 0;
      this.coachRequestId = 0;
      this.coachWorker = null;
      this.coachPending = false;
      this.coachAnalysis = null;
      this.aiToken = 0;
      this.pendingAI = false;
      this.lastAIStats = null;

      this.currentConfig = {
        mode: 'ai',
        difficulty: 'normal',
        playerColor: WHITE,
        timerMinutes: CFG.TIMER.DEFAULT_MINUTES
      };

      this.pending = {
        color: WHITE,
        minutes: CFG.TIMER.DEFAULT_MINUTES
      };

      this.confirmResolve = null;
      this.lastFocus = null;
      this._toastId = 0;
    }

    /* ============================================================
     * Initialisation
     * ============================================================ */

    init() {
      this.cacheDom();

      if (!global.StorageManager.isAvailable()) {
        this.toast('Stockage local indisponible : la progression ne sera pas conservée.', 'error', 5200);
      }

      this.settings = global.SettingsManager.load();
      this.updateThemeUI();
      this.updateCoachUI();
      this.stats = global.Statistics.load();

      global.AudioManager.configure(this.settings);
      global.AudioManager.init();
      global.Animations.init(this.dom.fxCanvas);

      this.renderer = new global.BoardRenderer(this.dom.board, this.dom.piecesLayer);
      this.renderer.onSquareClick = (square) => this.onSquareClick(square);

      this.bindEvents();
      this.bindSettings();
      this.bindModalSystem();
      this.updateHome();
      this.updateSoundUI();
      this.refreshResumeButton();
      this.showScreen('home');

      // Déverrouille l'audio à la première interaction (politique navigateur).
      const unlock = () => {
        global.AudioManager.unlock();
        global.document.removeEventListener('pointerdown', unlock);
        global.document.removeEventListener('keydown', unlock);
      };
      global.document.addEventListener('pointerdown', unlock, { once: true });
      global.document.addEventListener('keydown', unlock, { once: true });

      this.clockTimer = global.setInterval(() => this.tickClock(), 250);
      this.registerServiceWorker();
      this.bindPersistence();
    }

    cacheDom() {
      this.dom = {
        screens: {
          home: $('#screen-home'),
          mode: $('#screen-mode'),
          game: $('#screen-game')
        },
        board: $('#board'),
        piecesLayer: $('#pieces-layer'),
        fxCanvas: $('#fx-canvas'),

        playerLevel: $('#player-level'),
        xpFill: $('#xp-fill'),
        xpCurrent: $('#xp-current'),
        xpNext: $('#xp-next'),
        statWins: $('#stat-wins'),
        statLosses: $('#stat-losses'),
        statDraws: $('#stat-draws'),
        statBest: $('#stat-best'),
        btnResume: $('#btn-resume'),

        gameModeLabel: $('#game-mode-label'),
        gameStatus: $('#game-status'),
        opponentAvatar: $('#opponent-avatar'),
        opponentName: $('#opponent-name'),
        opponentMen: $('#opponent-men'),
        opponentKings: $('#opponent-kings'),
        opponentCaptures: $('#opponent-captures'),
        opponentTimer: $('#opponent-timer'),
        opponentTurn: $('#opponent-turn'),
        panelTop: $('#panel-top'),

        playerAvatar: $('#player-avatar'),
        playerPanelName: $('#player-panel-name'),
        playerMen: $('#player-men'),
        playerKings: $('#player-kings'),
        playerCaptures: $('#player-captures'),
        playerTimer: $('#player-timer'),
        playerTurn: $('#player-turn'),
        panelBottom: $('#panel-bottom'),

        historyList: $('#history-list'),
        savesList: $('#saves-list'),
        copyNotation: $('#btn-copy-notation'),
        aiStatsPanel: $('#ai-stats-panel'),
        aiDepth: $('#ai-depth'),
        aiNodes: $('#ai-nodes'),
        aiTime: $('#ai-time'),

        thinkingOverlay: $('#thinking-overlay'),
        thinkingStats: $('#thinking-stats'),
        pauseOverlay: $('#pause-overlay'),
        btnUndo: $('#btn-undo'),
        btnRestart: $('#btn-restart'),
        btnPause: $('#btn-pause'),
        btnQuit: $('#btn-quit'),

        playerName: $('#player-name'),
        homeAvatarIcon: $('#home-avatar-icon'),
        setPlayerName: $('#set-player-name'),
        setCoach: $('#set-coach'),
        coachBar: $('#coach-bar'),
        evalFill: $('#eval-fill'),
        coachScore: $('#coach-score'),
        btnCoachHint: $('#btn-coach-hint'),
        modalSettings: $('#modal-settings'),
        modalAchievements: $('#modal-achievements'),
        achievementsGrid: $('#achievements-grid'),
        achievementsSummary: $('#achievements-summary'),
        modalReplay: $('#modal-replay'),
        replayBoard: $('#replay-board'),
        replayPieces: $('#replay-pieces'),
        replayPly: $('#replay-ply'),
        replayMoveLabel: $('#replay-move-label'),
        replayMoves: $('#replay-moves'),
        replaySlider: $('#replay-slider'),
        replaySpeed: $('#replay-speed'),
        btnReplayPlay: $('#btn-replay-play'),
        modalPuzzles: $('#modal-puzzles'),
        puzzleBoard: $('#puzzle-board'),
        puzzlePieces: $('#puzzle-pieces'),
        puzzleLevel: $('#puzzle-level'),
        puzzleProgress: $('#puzzle-progress'),
        puzzleTitle: $('#puzzle-title'),
        puzzleDesc: $('#puzzle-desc'),
        puzzleFeedback: $('#puzzle-feedback'),
        puzzleSelect: $('#puzzle-select'),
        modalHowto: $('#modal-howto'),
        modalHistory: $('#modal-history'),
        modalSaves: $('#modal-saves'),
        modalGameover: $('#modal-gameover'),
        modalConfirm: $('#modal-confirm'),
        confirmMessage: $('#confirm-message'),
        btnConfirmOk: $('#btn-confirm-ok'),
        btnConfirmCancel: $('#btn-confirm-cancel'),

        btnThemeHome: $('#btn-theme-home'),
        btnThemeGame: $('#btn-theme-game'),
        previewBoard: $('#preview-board'),
        btnPreviewPromotion: $('#btn-preview-promotion'),

        setTheme: $('#set-theme'),
        setPieces: $('#set-pieces'),
        setDifficulty: $('#set-difficulty'),
        setTimer: $('#set-timer'),
        setAnimSpeed: $('#set-anim-speed'),
        setAiTime: $('#set-ai-time'),
        setVolume: $('#set-volume'),
        volumeValue: $('#volume-value'),
        setSounds: $('#set-sounds'),
        setAnimations: $('#set-animations'),
        setHints: $('#set-hints'),
        setCapturesOptional: $('#set-captures-optional'),
        setChainCaptures: $('#set-chain-captures'),

        difficultyGrid: $('#difficulty-grid'),
        colorChoice: $('#color-choice'),
        timerChoice: $('#timer-choice'),

        gameoverIcon: $('#gameover-icon'),
        gameoverTitle: $('#gameover-title'),
        gameoverSub: $('#gameover-sub'),
        goMoves: $('#go-moves'),
        goDuration: $('#go-duration'),
        goCaptures: $('#go-captures'),
        goXp: $('#go-xp'),

        historyStatsRow: $('#history-stats-row'),
        historyTable: $('#history-table'),
        historyEmpty: $('#history-empty'),

        toasts: $('#toasts'),
        btnSoundHome: $('#btn-sound-home'),
        btnSoundGame: $('#btn-sound-game'),
        btnExportData: $('#btn-export-data'),
        btnImportData: $('#btn-import-data'),
        importDataFile: $('#import-data-file')
      };
    }

    /* ============================================================
     * Navigation et événements
     * ============================================================ */

    bindEvents() {
      const on = (selector, event, handler) => {
        const el = $(selector);
        if (el) el.addEventListener(event, handler);
      };

      // Accueil
      on('#btn-play-ai', 'click', () => this.openModeScreen());
      on('#btn-play-quick', 'click', () => this.startGame({
        mode: 'ai',
        difficulty: this.settings.difficulty,
        playerColor: WHITE,
        timerMinutes: this.settings.timerMinutes
      }));
      on('#btn-play-pvp', 'click', () => this.startGame({
        mode: 'pvp',
        timerMinutes: this.settings.timerMinutes
      }));
      on('#btn-howto', 'click', () => this.openModal('modal-howto'));
      on('#btn-settings', 'click', () => this.openSettings());
      on('#btn-settings-home', 'click', () => this.openSettings());
      on('#btn-puzzles', 'click', () => this.openPuzzles());
      on('#btn-achievements', 'click', () => this.openAchievements());
      on('#btn-history', 'click', () => this.openHistory());
      on('#btn-saves', 'click', () => this.openSaves());
      on('#btn-saves-game', 'click', () => this.openSaves());
      on('#btn-copy-notation', 'click', () => this.copyNotation());
      on('#btn-resume', 'click', () => this.resumeGame());

      // Mode de jeu
      on('#btn-mode-back', 'click', () => this.showScreen('home'));
      on('#mode-pvp', 'click', () => this.startGame({
        mode: 'pvp',
        timerMinutes: this.pending.minutes
      }));
      $$('#difficulty-grid .difficulty-card').forEach((card) => {
        card.addEventListener('click', () => {
          this.startGame({
            mode: 'ai',
            difficulty: card.dataset.difficulty,
            playerColor: this.pending.color,
            timerMinutes: this.pending.minutes
          });
        });
      });
      $$('#color-choice .seg-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          this.pending.color = btn.dataset.color === BLACK ? BLACK : WHITE;
          this.setSegmentedActive('#color-choice', btn);
        });
      });
      $$('#timer-choice .seg-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          this.pending.minutes = Number(btn.dataset.minutes);
          this.setSegmentedActive('#timer-choice', btn);
        });
      });

      // Partie
      on('#btn-quit', 'click', () => this.confirmQuit());
      on('#btn-undo', 'click', () => this.undoMove());
      on('#btn-restart', 'click', () => this.confirmRestart());
      on('#btn-pause', 'click', () => this.togglePause());
      on('#btn-resume-game', 'click', () => this.togglePause());
      on('#btn-pause-quit', 'click', () => this.confirmQuit());
      on('#btn-play-again', 'click', () => this.replay());
      on('#btn-gameover-replay', 'click', () => this.openGameReplay(0));
      on('#btn-gameover-menu', 'click', () => this.goHome());

      // Puzzles
      on('#btn-puzzle-hint', 'click', () => this.showPuzzleHint());
      on('#btn-puzzle-reset', 'click', () => this.resetPuzzle());
      on('#btn-puzzle-daily', 'click', () => {
        if (global.CheckersPuzzles) this.loadPuzzle(global.CheckersPuzzles.daily(), true);
      });
      this.dom.puzzleSelect.addEventListener('change', (event) => {
        if (!global.CheckersPuzzles) return;
        const puzzle = global.CheckersPuzzles.getById(event.target.value);
        if (puzzle) this.loadPuzzle(puzzle);
      });

      // Replay
      on('#btn-replay-first', 'click', () => this.setReplayPly(0));
      on('#btn-replay-prev', 'click', () => this.stepReplay(-1));
      on('#btn-replay-next', 'click', () => this.stepReplay(1));
      on('#btn-replay-last', 'click', () => {
        this.setReplayPly(this.replayData ? this.replayData.moves.length : 0);
      });
      on('#btn-replay-play', 'click', () => this.toggleReplayPlay());
      on('#btn-coach-hint', 'click', () => this.showCoachHint());
      this.dom.replaySlider.addEventListener('input', (event) => {
        this.stopReplayPlay();
        this.setReplayPly(Number(event.target.value));
      });
      on('#btn-modal-resume', 'click', () => this.togglePause());
      on('#btn-modal-restart', 'click', () => this.confirmRestart());
      on('#btn-modal-quit', 'click', () => this.confirmQuit());

      // Actions globales
      on('#btn-sound-home', 'click', () => this.toggleSound());
      on('#btn-sound-game', 'click', () => this.toggleSound());
      on('#btn-fullscreen-home', 'click', () => this.toggleFullscreen());
      on('#btn-fullscreen-game', 'click', () => this.toggleFullscreen());
      on('#btn-fullscreen-settings', 'click', () => this.toggleFullscreen());
      on('#btn-reset-settings', 'click', () => this.resetSettings());
      on('#btn-theme-home', 'click', () => this.toggleMode());
      on('#btn-theme-game', 'click', () => this.toggleMode());
      on('#btn-preview-promotion', 'click', () => this.playPreviewPromotion());

      // Export / import JSON
      on('#btn-export-data', 'click', () => this.exportData());
      on('#btn-import-data', 'click', () => {
        if (this.dom.importDataFile) this.dom.importDataFile.click();
      });
      on('#import-data-file', 'change', (event) => {
        const file = event.target.files && event.target.files[0];
        if (file) this.importDataFile(file);
        event.target.value = '';
      });

      // Fin de partie / confirmation
      this.dom.btnConfirmOk.addEventListener('click', () => this.resolveConfirm(true));
      this.dom.btnConfirmCancel.addEventListener('click', () => this.resolveConfirm(false));

      // Raccourcis clavier
      global.document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
          const open = $('.modal-layer:not(.hidden)');
          if (open) {
            event.preventDefault();
            this.closeModal(open.id);
          } else if (this.gameActive && !this.paused) {
            this.togglePause();
          }
        }
      });

      global.addEventListener('online', () => this.toast('Connexion rétablie.', 'success'));
      global.addEventListener('offline', () => this.toast('Mode hors ligne : le jeu reste disponible.', 'info'));
    }

    bindModalSystem() {
      global.document.addEventListener('click', (event) => {
        const closer = event.target.closest('[data-close]');
        if (closer) {
          event.preventDefault();
          this.closeModal(closer.dataset.close);
          return;
        }
        if (event.target.classList && event.target.classList.contains('modal-layer')) {
          this.closeModal(event.target.id);
        }
      });
    }

    bindSettings() {
      const set = (key, value) => {
        global.SettingsManager.set(key, value);
        this.settings = global.SettingsManager.settings;
        this.updateThemeUI();
        this.renderSettingsPreview();
        this.updateProfileUI();
      };

      this.dom.setPlayerName.addEventListener('input', (event) => {
        const name = event.target.value.trim().slice(0, 18) || 'Joueur';
        set('playerName', name);
      });
      $$('#modal-settings [data-avatar]').forEach((btn) => {
        btn.addEventListener('click', () => {
          set('playerAvatar', btn.dataset.avatar);
          this.setAvatarActive(btn);
        });
      });
      this.dom.setCoach.addEventListener('change', (event) => {
        set('coachMode', event.target.checked);
        this.updateCoachUI();
        this.maybeCoachAnalysis();
      });

      this.dom.setTheme.addEventListener('change', (event) => {
        set('theme', event.target.value);
        this.toast('Thème appliqué.', 'success', 1800);
      });
      this.dom.setPieces.addEventListener('change', (event) => set('pieceStyle', event.target.value));
      this.dom.setDifficulty.addEventListener('change', (event) => set('difficulty', event.target.value));
      this.dom.setTimer.addEventListener('change', (event) => set('timerMinutes', Number(event.target.value)));
      this.dom.setAnimSpeed.addEventListener('change', (event) => set('animationSpeed', Number(event.target.value)));
      this.dom.setAiTime.addEventListener('change', (event) => set('aiThinkMs', Number(event.target.value)));
      this.dom.setVolume.addEventListener('input', (event) => {
        const volume = Number(event.target.value);
        this.dom.volumeValue.textContent = volume + ' %';
        set('volume', volume / 100);
        global.AudioManager.configure(this.settings);
      });
      this.dom.setSounds.addEventListener('change', (event) => {
        set('soundsEnabled', event.target.checked);
        global.AudioManager.configure(this.settings);
        this.updateSoundUI();
      });
      this.dom.setAnimations.addEventListener('change', (event) => set('animationsEnabled', event.target.checked));
      this.dom.setHints.addEventListener('change', (event) => {
        set('showLegalMoves', event.target.checked);
        if (this.gameActive && this.selected !== null) {
          this.selectSquare(this.selected);
        }
      });

      // Options de jeu non réglementaires : appliquées immédiatement à la partie en cours.
      const applyRuleOptions = () => {
        this.engine.setRuleOptions({
          capturesOptional: !!this.settings.capturesOptional,
          chainCaptures: !!this.settings.chainCaptures
        });
        if (this.currentConfig) {
          this.currentConfig.capturesOptional = !!this.settings.capturesOptional;
          this.currentConfig.chainCaptures = !!this.settings.chainCaptures;
        }
        this.selected = null;
        this.renderer.clearHighlights();
        this.saveGame();
        this.updateAll();
      };
      this.dom.setCapturesOptional.addEventListener('change', (event) => {
        set('capturesOptional', event.target.checked);
        applyRuleOptions();
        this.toast(event.target.checked
          ? 'Prise facultative activée.'
          : 'Prise obligatoire activée.', 'info', 1800);
      });
      this.dom.setChainCaptures.addEventListener('change', (event) => {
        set('chainCaptures', event.target.checked);
        applyRuleOptions();
        this.toast(event.target.checked
          ? 'Captures enchaînées : un coup mangeur donne un tour bonus.'
          : 'Captures enchaînées désactivées.', 'info', 2200);
      });

      $$('#modal-settings [data-flip]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const flipped = btn.dataset.flip === 'true';
          set('boardFlipped', flipped);
          this.setFlipActive(btn);
          if (this.gameActive) {
            this.selected = null;
            this.renderer.setFlipped(this.getFlipped());
            this.renderer.render(this.engine.board);
            this.syncPanels();
          }
        });
      });

      $$('#modal-settings [data-mode-value]').forEach((btn) => {
        btn.addEventListener('click', () => {
          set('mode', btn.dataset.modeValue === 'light' ? 'light' : 'dark');
          this.setModeActive(btn);
        });
      });

      this.buildSettingsPreview();
    }

    setSegmentedActive(selector, activeButton) {
      $$(selector + ' .seg-btn').forEach((btn) => {
        btn.classList.toggle('is-active', btn === activeButton);
      });
    }

    setFlipActive(activeButton) {
      $$('#modal-settings [data-flip]').forEach((btn) => {
        btn.classList.toggle('is-active', btn === activeButton);
      });
    }

    setModeActive(activeButton) {
      $$('#modal-settings [data-mode-value]').forEach((btn) => {
        btn.classList.toggle('is-active', btn === activeButton);
      });
    }

    setAvatarActive(activeButton) {
      $$('#modal-settings [data-avatar]').forEach((btn) => {
        btn.classList.toggle('is-active', btn === activeButton);
      });
    }

    /** Applique le nom et l'avatar choisis partout dans l'interface. */
    updateProfileUI() {
      const name = (this.settings && this.settings.playerName) || 'Joueur';
      const avatar = (this.settings && this.settings.playerAvatar) || 'user';
      if (this.dom.playerName) this.dom.playerName.textContent = name;
      if (this.dom.homeAvatarIcon) this.dom.homeAvatarIcon.className = 'icon i-' + avatar;
      if (this.gameActive) this.syncPanels();
    }

    /** Affiche la liste des succès débloqués et verrouillés. */
    openAchievements() {
      this.closeModal('modal-puzzles');
      this.closeModal('modal-replay');
      this.stats = global.Statistics.load();
      const list = global.Statistics.badgeList();
      const unlocked = list.filter((b) => b.unlocked).length;
      this.dom.achievementsSummary.textContent = unlocked + ' / ' + list.length +
        ' succès débloqués · ' + this.stats.xp + ' XP au total.';
      this.dom.achievementsGrid.innerHTML = '';
      list.forEach((badge) => {
        const card = global.document.createElement('div');
        card.className = 'achievement-card ' + (badge.unlocked ? 'unlocked' : 'locked');
        card.innerHTML =
          '<span class="achievement-icon"><span class="icon i-' + badge.icon + '"></span></span>' +
          '<span class="achievement-info"><b></b><small></small><em></em></span>';
        card.querySelector('b').textContent = badge.label;
        card.querySelector('small').textContent = badge.desc;
        card.querySelector('em').textContent = badge.unlocked ? 'DÉBLOQUÉ · +' + badge.xp + ' XP' : 'Verrouillé';
        this.dom.achievementsGrid.appendChild(card);
      });
      this.openModal('modal-achievements');
    }

    /** Met à jour les libellés des boutons Sombre / Clair. */
    updateThemeUI() {
      const light = this.settings && this.settings.mode === 'light';
      const label = light ? 'Activer le mode sombre' : 'Activer le mode clair';
      const title = light ? 'Mode sombre' : 'Mode clair';
      [this.dom.btnThemeHome, this.dom.btnThemeGame].forEach((btn) => {
        if (!btn) return;
        btn.setAttribute('aria-label', label);
        btn.setAttribute('title', title);
      });
      const active = $('#modal-settings [data-mode-value="' + (light ? 'light' : 'dark') + '"]');
      if (active) this.setModeActive(active);
    }

    /** Bascule le mode d'affichage depuis n'importe quel écran. */
    toggleMode() {
      const mode = global.SettingsManager.toggleMode();
      this.settings = global.SettingsManager.settings;
      this.updateThemeUI();
      this.renderSettingsPreview();
      this.toast(mode === 'light' ? 'Mode clair activé.' : 'Mode sombre activé.', 'info', 1600);
    }

    /** Construit le mini-plateau d'aperçu (une seule fois). */
    buildSettingsPreview() {
      const board = this.dom.previewBoard;
      if (!board || board.childElementCount) return;
      for (let r = 0; r < 10; r++) {
        for (let c = 0; c < 10; c++) {
          const sq = global.document.createElement('div');
          sq.className = 'square ' + ((r + c) % 2 === 1 ? 'dark' : 'light');
          board.appendChild(sq);
        }
      }
      const defs = [
        { r: 1, c: 0, cls: 'piece-white man' },
        { r: 2, c: 1, cls: 'piece-white man', demo: true },
        { r: 3, c: 2, cls: 'piece-white king' },
        { r: 6, c: 3, cls: 'piece-black man' },
        { r: 7, c: 4, cls: 'piece-black man' },
        { r: 8, c: 5, cls: 'piece-black king' }
      ];
      this.previewPieces = defs.map((def) => {
        const el = global.document.createElement('div');
        el.className = 'piece ' + def.cls;
        const isKing = def.cls.indexOf('king') !== -1;
        el.innerHTML =
          '<span class="piece-inner piece-inner-bottom"></span>' +
          (isKing ? '<span class="piece-inner piece-inner-top"></span>' : '') +
          '<span class="piece-crown"></span>';
        board.appendChild(el);
        return { el: el, r: def.r, c: def.c, demo: !!def.demo };
      });
      this.renderSettingsPreview();
    }

    /** Applique l'orientation choisie à l'aperçu. */
    renderSettingsPreview() {
      const flipped = !!(this.settings && this.settings.boardFlipped);
      (this.previewPieces || []).forEach((p) => {
        p.el.style.left = ((flipped ? 9 - p.c : p.c) * 10) + '%';
        p.el.style.top = ((flipped ? 9 - p.r : p.r) * 10) + '%';
      });
    }

    /** Rejoue l'animation de promotion dans l'aperçu. */
    playPreviewPromotion() {
      const demo = (this.previewPieces || []).find((p) => p.demo);
      if (!demo) return;
      const el = demo.el;
      if (!el.querySelector('.piece-inner-top')) {
        const topDisc = global.document.createElement('span');
        topDisc.className = 'piece-inner piece-inner-top';
        const crown = el.querySelector('.piece-crown');
        if (crown) el.insertBefore(topDisc, crown);
        else el.appendChild(topDisc);
      }
      el.classList.remove('king', 'promoting');
      void el.offsetWidth; // force le redémarrage des animations CSS
      el.classList.add('king', 'promoting');
      global.setTimeout(() => el.classList.remove('promoting'), 900);
      if (this.settings && this.settings.soundsEnabled) {
        global.AudioManager.play('promote');
      }
    }

    /* ============================================================
     * Écrans et parties
     * ============================================================ */

    showScreen(name) {
      Object.keys(this.dom.screens).forEach((key) => {
        const screen = this.dom.screens[key];
        if (screen) screen.classList.toggle('is-active', key === name);
      });
      if (name === 'home') {
        this.updateHome();
        this.refreshResumeButton();
      }
      if (name === 'game' && global.Animations) {
        // Le canvas était masqué au chargement : recalculer sa taille réelle.
        global.requestAnimationFrame(() => global.Animations.resize());
      }
    }

    openModeScreen() {
      this.pending.color = WHITE;
      this.pending.minutes = this.settings.timerMinutes;
      $$('#difficulty-grid .difficulty-card').forEach((card) => {
        card.classList.toggle('is-active', card.dataset.difficulty === this.settings.difficulty);
      });
      const colorBtn = $('#color-choice .seg-btn[data-color="white"]');
      if (colorBtn) this.setSegmentedActive('#color-choice', colorBtn);
      const timerBtn = $('#timer-choice .seg-btn[data-minutes="' + this.settings.timerMinutes + '"]');
      if (timerBtn) this.setSegmentedActive('#timer-choice', timerBtn);
      this.showScreen('mode');
    }

    startGame(options) {
      options = options || {};
      const mode = options.mode === 'pvp' ? 'pvp' : 'ai';
      const difficulty = CFG.DIFFICULTIES[options.difficulty] ? options.difficulty : this.settings.difficulty;
      const playerColor = options.playerColor === BLACK ? BLACK : WHITE;
      const timerMinutes = options.timerMinutes !== undefined
        ? Number(options.timerMinutes)
        : this.settings.timerMinutes;

      this.cancelAI();
      this.closeAllModals();
      this.gameToken++;
      this.gameActive = false;
      this.gameOverShown = false;
      this.busy = false;
      this.selected = null;
      this.paused = false;
      this.pendingAI = false;
      this.lastAIStats = null;

      this.engine.newGame({
        mode: mode,
        difficulty: difficulty,
        playerColor: playerColor,
        capturesOptional: !!this.settings.capturesOptional,
        chainCaptures: !!this.settings.chainCaptures
      });
      this.currentConfig = {
        mode: mode,
        difficulty: difficulty,
        playerColor: playerColor,
        timerMinutes: timerMinutes,
        capturesOptional: !!this.engine.ruleOptions.capturesOptional,
        chainCaptures: !!this.engine.ruleOptions.chainCaptures
      };

      this.initClocks(timerMinutes);
      this.showScreen('game');
      this.renderer.setFlipped(this.getFlipped());
      this.renderer.render(this.engine.board);
      this.syncLastMove();
      this.renderer.setInteractive(false);

      this.gameActive = true;
      this.timeoutHandled = false;
      this.clockRunningSince = this.unlimited ? null : this.now();
      this.lastAutoSave = this.now();

      // Mémorise les préférences de la dernière partie.
      global.SettingsManager.set('difficulty', difficulty);
      global.SettingsManager.set('timerMinutes', timerMinutes);
      this.settings = global.SettingsManager.settings;

      this.updateAll();
      this.saveGame();
      this.maybeAITurn();
    }

    resumeGame() {
      const key = CFG.STORAGE.KEYS.SAVE;
      const save = global.StorageManager.get(key, null);
      if (!this.loadSavePayload(save, { key: key })) {
        this.toast('Aucune partie valide à reprendre.', 'error');
        this.refreshResumeButton();
      }
    }

    /** Charge une sauvegarde (automatique ou manuelle) et restaure l'interface. */
    loadSavePayload(save, options) {
      options = options || {};
      const invalid = () => {
        if (options.key) global.StorageManager.remove(options.key);
        return false;
      };
      if (!save || !save.engine || !Array.isArray(save.engine.board) || save.engine.board.length !== 100) {
        return invalid();
      }
      if (!this.engine.loadState(save.engine) || this.engine.status.over) return invalid();

      this.cancelAI();
      this.closeAllModals();
      this.gameToken++;
      this.gameOverShown = false;
      this.busy = false;
      this.selected = null;
      this.paused = false;
      this.pendingAI = false;
      this.lastAIStats = null;
      this.timeoutHandled = false;

      const config = save.config || {};
      this.currentConfig = {
        mode: this.engine.mode,
        difficulty: this.engine.difficulty,
        playerColor: this.engine.playerColor,
        timerMinutes: config.timerMinutes !== undefined
          ? Number(config.timerMinutes)
          : this.settings.timerMinutes,
        capturesOptional: !!this.engine.ruleOptions.capturesOptional,
        chainCaptures: !!this.engine.ruleOptions.chainCaptures
      };

      this.unlimited = !!save.unlimited;
      if (this.unlimited) {
        this.clocks = { white: Infinity, black: Infinity };
      } else {
        const white = Number(save.clocks && save.clocks.white);
        const black = Number(save.clocks && save.clocks.black);
        if (!Number.isFinite(white) || !Number.isFinite(black) || white <= 0 || black <= 0) {
          return invalid();
        }
        this.clocks = { white: white, black: black };
      }

      this.gameActive = true;
      this.showScreen('game');
      this.renderer.setFlipped(this.getFlipped());
      this.renderer.render(this.engine.board);
      this.syncLastMove();
      this.clockRunningSince = this.unlimited ? null : this.now();
      this.lastAutoSave = this.now();
      this.updateAll();
      this.toast(options.manual ? 'Partie chargée.' : 'Partie reprise.', 'success', 2200);
      this.maybeAITurn();
      return true;
    }

    replay() {
      const config = Object.assign({}, this.currentConfig);
      this.closeModal('modal-gameover');
      this.startGame(config);
    }

    goHome() {
      this.cancelAI();
      this.closeAllModals();
      this.gameActive = false;
      this.paused = false;
      this.clockRunningSince = null;
      this.showScreen('home');
    }

    confirmQuit() {
      if (!this.gameActive) {
        this.goHome();
        return;
      }
      const hasProgress = this.engine.history.length > 0 && !this.engine.status.over;
      const message = hasProgress
        ? 'Quitter la partie ? Votre progression sera sauvegardée et vous pourrez la reprendre depuis l’accueil.'
        : 'Quitter la partie en cours ?';
      this.askConfirm(message, 'QUITTER').then((ok) => {
        if (!ok) return;
        if (hasProgress) this.saveGame();
        else global.StorageManager.remove(CFG.STORAGE.KEYS.SAVE);
        this.gameActive = false;
        this.cancelAI();
        this.paused = false;
        this.clockRunningSince = null;
        this.closeAllModals();
        this.showScreen('home');
        if (hasProgress) this.toast('Partie sauvegardée. Reprenez-la depuis l’accueil.', 'success', 3400);
      });
    }

    confirmRestart() {
      if (!this.gameActive) return;
      this.askConfirm('Recommencer une nouvelle partie ? La partie actuelle sera abandonnée.', 'RECOMMENCER')
        .then((ok) => {
          if (ok) this.startGame(this.currentConfig);
        });
    }

    /* ============================================================
     * Interaction plateau
     * ============================================================ */

    canHumanInteract() {
      if (!this.gameActive || this.paused || this.busy || this.aiThinking || this.engine.status.over) {
        return false;
      }
      if (this.engine.mode === 'ai') return this.engine.currentPlayer === this.engine.playerColor;
      return true;
    }

    onSquareClick(square) {
      if (!this.canHumanInteract()) return;
      const player = this.engine.currentPlayer;
      const piece = this.engine.board[square];

      if (this.selected !== null) {
        const selectedMoves = this.engine.getMovesForSquare(this.selected);
        const targetMoves = selectedMoves.filter((move) => move.to === square);
        if (targetMoves.length > 0) {
          this.executeMove(targetMoves[0]);
          return;
        }
        if (square === this.selected) {
          this.selected = null;
          this.renderer.clearHighlights();
          return;
        }
      }

      if (Rules.pieceBelongsTo(piece, player)) {
        this.selectSquare(square);
      } else {
        this.selected = null;
        this.renderer.clearHighlights();
      }
    }

    selectSquare(square) {
      const moves = this.engine.getMovesForSquare(square);
      if (moves.length === 0) {
        this.selected = null;
        this.renderer.clearHighlights();
        if (!this.engine.ruleOptions.capturesOptional &&
            this.engine.getLegalMoves().some((move) => move.isCapture)) {
          this.toast('Prise obligatoire : choisissez une pièce qui peut capturer.', 'error', 2600);
        }
        global.AudioManager.play('invalid');
        return;
      }
      this.selected = square;
      this.renderer.showMoves(square, moves, this.settings.showLegalMoves);
      global.AudioManager.play('click');
    }

    async executeMove(move, options) {
      options = options || {};
      if (!this.gameActive || this.busy || this.engine.status.over) return;
      if (!this.engine.isLegalMove(move)) {
        this.toast('Coup illégal refusé par le moteur.', 'error');
        return;
      }

      const token = this.gameToken;
      this.busy = true;
      this.selected = null;
      this.renderer.clearHighlights();
      this.renderer.setInteractive(false);
      this.settleClock();

      const wasCapture = !!move.isCapture;
      if (!wasCapture) global.AudioManager.play('move');

      const result = this.engine.playMove(move);
      if (!result.ok) {
        this.busy = false;
        this.clockRunningSince = this.paused || this.unlimited ? null : this.now();
        this.renderer.setInteractive(this.canHumanInteract());
        this.updateControls();
        this.toast(result.error || 'Coup impossible.', 'error');
        return;
      }

      if (options.ai && options.stats) {
        this.lastAIStats = options.stats;
      }

      const reducedMotion = global.matchMedia &&
        global.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (this.settings.animationsEnabled && !reducedMotion) {
        await this.renderer.animateMove(move, {
          speed: this.settings.animationSpeed,
          onCapture: (square) => this.onCaptureEffect(square)
        });
      } else if (wasCapture) {
        global.AudioManager.play('capture');
      }

      if (token !== this.gameToken) {
        this.busy = false;
        return;
      }

      if (move.promotes) global.AudioManager.play('promote');
      this.renderer.render(this.engine.board);
      this.renderer.showLastMove(move);
      this.busy = false;
      this.updateAll();

      if (this.engine.status.over) {
        this.finishGame();
        return;
      }

      this.clockRunningSince = this.paused || this.unlimited ? null : this.now();
      this.saveGame();
      this.lastAutoSave = this.now();

      if (this.engine.mode === 'ai' && this.engine.currentPlayer !== this.engine.playerColor) {
        this.maybeAITurn();
      } else {
        this.renderer.setInteractive(this.canHumanInteract());
      }
    }

    onCaptureEffect(square) {
      global.AudioManager.play('capture');
      if (global.navigator && typeof global.navigator.vibrate === 'function') {
        try { global.navigator.vibrate(18); } catch (e) { /* ignoré */ }
      }
      if (!this.renderer || !this.dom.fxCanvas) return;
      const center = this.renderer.squareCenter(square);
      const boardRect = this.dom.board.getBoundingClientRect();
      const canvasRect = this.dom.fxCanvas.getBoundingClientRect();
      const x = center.x + (boardRect.left - canvasRect.left);
      const y = center.y + (boardRect.top - canvasRect.top);
      global.Animations.burst(x, y, '#f87171', 18);
    }

    undoMove() {
      if (!this.gameActive || this.busy || this.aiThinking || !this.engine.canUndo()) return;
      if (this.engine.mode === 'ai') {
        const humanMoved = this.engine.history.some((h) => h.player === this.engine.playerColor);
        if (!humanMoved) return;
      }

      this.settleClock();
      const targetColor = this.engine.mode === 'ai' ? this.engine.playerColor : null;
      let undone = null;
      let undoneHuman = false;
      let guard = 0;

      while (this.engine.canUndo() && guard < 4) {
        guard++;
        const last = this.engine.undo();
        if (!last) break;
        undone = last;
        if (last.player === targetColor) undoneHuman = true;
        if (this.engine.mode === 'pvp') break;
        if (undoneHuman && this.engine.currentPlayer === targetColor) break;
        if (!undoneHuman && this.engine.currentPlayer === targetColor) break;
      }

      this.selected = null;
      this.renderer.render(this.engine.board);
      this.syncLastMove();
      this.clockRunningSince = this.unlimited ? null : this.now();
      this.updateAll();
      if (this.engine.history.length > 0) this.saveGame();
      else global.StorageManager.remove(CFG.STORAGE.KEYS.SAVE);
      this.toast('Coup annulé.', 'info', 1600);
      global.AudioManager.play('click');
      if (undone && this.engine.mode === 'ai' && this.engine.currentPlayer !== this.engine.playerColor) {
        this.maybeAITurn();
      }
    }

    /* ============================================================
     * Mode coach
     * ============================================================ */

    updateCoachUI() {
      if (!this.dom.coachBar) return;
      const enabled = !!(this.settings && this.settings.coachMode);
      this.dom.coachBar.classList.toggle('hidden', !enabled);
      if (!enabled) {
        this.coachAnalysis = null;
        if (this.dom.evalFill) this.dom.evalFill.style.width = '0%';
        if (this.dom.coachScore) this.dom.coachScore.textContent = '0.0';
      }
    }

    /** Lance une analyse rapide de la position du joueur (sans jouer le coup). */
    maybeCoachAnalysis() {
      if (!this.settings || !this.settings.coachMode || !this.gameActive ||
          this.paused || this.busy || this.aiThinking || this.coachPending ||
          this.engine.status.over) return;
      if (this.engine.mode === 'ai' && this.engine.currentPlayer !== this.engine.playerColor) return;
      if (!global.Worker || !global.CheckersAI) return;

      const token = this.gameToken;
      const requestId = ++this.coachRequestId;
      const board = this.engine.board.slice();
      const player = this.engine.currentPlayer;
      const boardKey = board.join(',');
      this.coachPending = true;

      const finish = (result) => {
        if (!this.coachPending || token !== this.gameToken || !result || !result.move) return;
        this.coachPending = false;
        this.coachAnalysis = {
          move: result.move,
          score: Number(result.score) || 0,
          player: player,
          boardKey: boardKey
        };
        this.updateEvalBar(this.coachAnalysis.score, player);
      };
      const fallback = () => {
        try {
          const result = global.CheckersAI.search(board, player, {
            difficulty: 'normal', timeMs: 250, randomness: 0,
            capturesOptional: !!this.engine.ruleOptions.capturesOptional,
            chainCaptures: !!this.engine.ruleOptions.chainCaptures
          });
          finish(result);
        } catch (error) {
          this.coachPending = false;
        }
      };

      try {
        if (this.coachWorker) this.coachWorker.terminate();
        const worker = new global.Worker('js/ai-worker.js');
        this.coachWorker = worker;
        const cleanup = () => {
          worker.terminate();
          if (this.coachWorker === worker) this.coachWorker = null;
        };
        worker.onmessage = (event) => {
          const data = event.data || {};
          if (data.id !== requestId || token !== this.gameToken) return;
          cleanup();
          if (data.type === 'result') finish(data);
          else if (data.type === 'error') fallback();
        };
        worker.onerror = () => { cleanup(); fallback(); };
        worker.postMessage({
          type: 'search', id: requestId, board: board,
          player: player, difficulty: 'normal', timeMs: 500,
          capturesOptional: !!this.engine.ruleOptions.capturesOptional,
          chainCaptures: !!this.engine.ruleOptions.chainCaptures
        });
        global.setTimeout(() => {
          if (this.coachPending && requestId === this.coachRequestId) {
            cleanup();
            fallback();
          }
        }, 1800);
      } catch (error) {
        fallback();
      }
    }

    /** Met à jour la barre d'évaluation (score du point de vue des Blancs). */
    updateEvalBar(score, player) {
      if (!this.dom.evalFill || !this.dom.coachScore) return;
      const whiteScore = player === WHITE ? score : -score;
      const pawns = Math.max(-6, Math.min(6, (Number(whiteScore) || 0) / 100));
      const pct = (Math.abs(pawns) / 6) * 50;
      this.dom.evalFill.style.left = (pawns >= 0 ? 50 : 50 - pct) + '%';
      this.dom.evalFill.style.width = pct + '%';
      this.dom.evalFill.style.background = pawns >= 0 ? 'var(--cyan)' : 'var(--rose)';
      this.dom.coachScore.textContent = (pawns >= 0 ? '+' : '') + pawns.toFixed(1);
    }

    /** Met en évidence le meilleur coup trouvé par l'analyse. */
    showCoachHint() {
      if (!this.settings || !this.settings.coachMode) return;
      const analysis = this.coachAnalysis;
      if (!analysis || !analysis.move || analysis.boardKey !== this.engine.board.join(',') ||
          (this.engine.mode === 'ai' && this.engine.currentPlayer !== this.engine.playerColor)) {
        this.toast('Analyse en cours…', 'info', 1400);
        this.maybeCoachAnalysis();
        return;
      }
      this.renderer.showMoves(analysis.move.from, [analysis.move], true);
      this.dom.gameStatus.textContent = 'Conseil : ' + Rules.moveNotation(analysis.move);
      global.AudioManager.play('click');
    }

    /* ============================================================
     * Intelligence artificielle (Web Worker)
     * ============================================================ */

    maybeAITurn() {
      if (!this.gameActive || this.paused || this.engine.status.over || !this.engine.isAITurn()) return;
      if (this.aiThinking) return;

      const difficulty = this.engine.difficulty;
      const diffConfig = CFG.DIFFICULTIES[difficulty] || CFG.DIFFICULTIES.normal;
      let timeMs = Number(this.settings.aiThinkMs) > 0
        ? Number(this.settings.aiThinkMs)
        : diffConfig.timeMs;

      if (!this.unlimited) {
        const remaining = this.clocks[this.engine.currentPlayer];
        if (remaining <= 0) {
          this.handleTimeout(this.engine.currentPlayer);
          return;
        }
        timeMs = Math.min(timeMs, Math.max(200, remaining - 350));
      }

      this.aiThinking = true;
      this.aiRequestId++;
      const requestId = this.aiRequestId;
      const token = this.gameToken;
      const player = this.engine.currentPlayer;
      const board = this.engine.board.slice();
      const startedAt = this.now();

      this.dom.thinkingOverlay.classList.remove('hidden');
      this.dom.thinkingStats.textContent = 'Initialisation de la recherche…';
      this.renderer.setInteractive(false);
      this.updateStatus();
      this.updateControls();

      let settled = false;
      const cleanup = () => {
        if (this.aiTimeout) {
          global.clearTimeout(this.aiTimeout);
          this.aiTimeout = null;
        }
        if (this.aiWorker) {
          this.aiWorker.terminate();
          this.aiWorker = null;
        }
      };

      const fail = (reason) => {
        if (settled) return;
        settled = true;
        cleanup();
        if (token !== this.gameToken || !this.gameActive) return;
        console.warn('[IA] Worker indisponible (' + reason + ') : bascule sur le thread principal.');
        this.runAIFallback(board, player, difficulty, timeMs, token, startedAt);
      };

      try {
        const worker = new global.Worker('js/ai-worker.js');
        this.aiWorker = worker;

        worker.onmessage = (event) => {
          const data = event.data || {};
          if (data.id !== requestId || token !== this.gameToken) return;
          if (data.type === 'progress') {
            this.updateThinkingProgress(data);
            return;
          }
          if (data.type === 'result') {
            settled = true;
            cleanup();
            this.handleAIResult(data, token);
            return;
          }
          if (data.type === 'error') {
            fail(data.message || 'erreur worker');
          }
        };

        worker.onerror = (event) => {
          if (event && typeof event.preventDefault === 'function') event.preventDefault();
          fail('chargement du worker');
        };

        this.aiTimeout = global.setTimeout(() => fail('délai dépassé'), timeMs + 5000);
        worker.postMessage({
          type: 'search',
          id: requestId,
          board: board,
          player: player,
          difficulty: difficulty,
          timeMs: timeMs,
          capturesOptional: !!this.engine.ruleOptions.capturesOptional,
          chainCaptures: !!this.engine.ruleOptions.chainCaptures
        });
      } catch (error) {
        fail(error && error.message ? error.message : 'création impossible');
      }
    }

    runAIFallback(board, player, difficulty, timeMs, token, startedAt) {
      if (!global.CheckersAI) {
        this.handleAIError('Le module IA local est introuvable.');
        return;
      }
      this.dom.thinkingStats.textContent = 'Recherche locale (mode de secours)…';
      global.setTimeout(() => {
        if (token !== this.gameToken || !this.gameActive || this.paused) return;
        try {
          const result = global.CheckersAI.search(board, player, {
            difficulty: difficulty,
            timeMs: timeMs,
            capturesOptional: !!this.engine.ruleOptions.capturesOptional,
            chainCaptures: !!this.engine.ruleOptions.chainCaptures,
            onProgress: (progress) => {
              if (token === this.gameToken) this.updateThinkingProgress(progress);
            }
          });
          this.handleAIResult({
            move: result.move,
            score: result.score,
            depth: result.depth,
            nodes: result.nodes,
            timeMs: this.now() - startedAt
          }, token);
        } catch (error) {
          console.error('[IA] Erreur de recherche :', error);
          this.handleAIError(error && error.message ? error.message : 'Erreur de recherche IA.');
        }
      }, 40);
    }

    updateThinkingProgress(progress) {
      const nodes = this.formatNumber(progress.nodes || 0);
      const seconds = ((progress.timeMs || 0) / 1000).toFixed(1);
      const depth = progress.depth || 0;
      let comment = 'Exploration des coups immédiats…';
      if (depth >= 6) comment = 'Analyse tactique approfondie…';
      else if (depth >= 4) comment = 'Anticipation des réponses…';
      else if (depth >= 2) comment = 'Évaluation des menaces…';
      this.dom.thinkingStats.textContent =
        comment + ' Profondeur ' + depth + ' · ' + nodes + ' positions · ' + seconds + ' s';
    }

    handleAIResult(data, token) {
      if (token !== this.gameToken || !this.gameActive) return;
      if (this.paused) {
        this.pendingAI = true;
        return;
      }

      this.aiThinking = false;
      this.dom.thinkingOverlay.classList.add('hidden');
      this.lastAIStats = {
        depth: data.depth || 0,
        nodes: data.nodes || 0,
        timeMs: data.timeMs || 0
      };
      this.updateAIStats();

      if (!this.unlimited && this.clocks[this.engine.currentPlayer] <= 0) {
        this.handleTimeout(this.engine.currentPlayer);
        return;
      }

      let move = data.move;
      if (!move || !this.engine.isLegalMove(move)) {
        const legal = this.engine.getLegalMoves();
        if (legal.length === 0) {
          this.engine.status = {
            over: true,
            result: Rules.otherPlayer(this.engine.currentPlayer),
            reason: 'no-moves'
          };
          this.finishGame();
          return;
        }
        console.warn('[IA] Coup invalide reçu, repli sur un coup légal.', move);
        move = legal[0];
        this.toast('L’IA a produit un coup invalide : un coup légal de secours a été joué.', 'error', 4200);
      }

      this.executeMove(move, { ai: true, stats: this.lastAIStats });
    }

    handleAIError(message) {
      this.aiThinking = false;
      this.dom.thinkingOverlay.classList.add('hidden');
      this.renderer.setInteractive(this.canHumanInteract());
      this.updateStatus();
      this.updateControls();
      this.toast('Erreur IA : ' + message, 'error', 5000);
    }

    cancelAI() {
      this.aiToken++;
      this.aiRequestId++;
      if (this.aiTimeout) {
        global.clearTimeout(this.aiTimeout);
        this.aiTimeout = null;
      }
      if (this.aiWorker) {
        this.aiWorker.terminate();
        this.aiWorker = null;
      }
      if (this.coachWorker) {
        this.coachWorker.terminate();
        this.coachWorker = null;
      }
      this.coachPending = false;
      this.coachAnalysis = null;
      this.aiThinking = false;
      if (this.dom && this.dom.thinkingOverlay) {
        this.dom.thinkingOverlay.classList.add('hidden');
      }
    }

    /* ============================================================
     * Chronomètre
     * ============================================================ */

    now() {
      return global.performance && typeof global.performance.now === 'function'
        ? global.performance.now()
        : Date.now();
    }

    initClocks(minutes) {
      this.unlimited = !(Number(minutes) > 0);
      if (this.unlimited) {
        this.clocks = { white: Infinity, black: Infinity };
      } else {
        const ms = Number(minutes) * 60000;
        this.clocks = { white: ms, black: ms };
      }
      this.clockRunningSince = null;
    }

    tickClock() {
      if (!this.gameActive || this.paused || this.engine.status.over) return;
      if (!this.clockRunningSince) {
        this.clockRunningSince = this.now();
        return;
      }

      const now = this.now();
      const elapsed = now - this.clockRunningSince;
      this.clockRunningSince = now;

      if (!this.unlimited) {
        const player = this.engine.currentPlayer;
        this.clocks[player] = Math.max(0, this.clocks[player] - elapsed);
        this.updateClockUI();
        if (this.clocks[player] <= 0) {
          this.handleTimeout(player);
          return;
        }
      }

      if (now - this.lastAutoSave > 5000) {
        this.lastAutoSave = now;
        this.saveGame();
      }
    }

    settleClock() {
      if (!this.clockRunningSince || this.unlimited) {
        this.clockRunningSince = null;
        return;
      }
      const now = this.now();
      const elapsed = now - this.clockRunningSince;
      const player = this.engine.currentPlayer;
      this.clocks[player] = Math.max(0, this.clocks[player] - elapsed);
      this.clockRunningSince = null;
      this.updateClockUI();
    }

    handleTimeout(player) {
      if (!this.gameActive || this.engine.status.over || this.timeoutHandled) return;
      this.timeoutHandled = true;
      this.cancelAI();
      this.clocks[player] = 0;
      this.clockRunningSince = null;
      this.engine.status = {
        over: true,
        result: Rules.otherPlayer(player),
        reason: 'timeout'
      };
      this.finishGame();
    }

    /* ============================================================
     * Pause
     * ============================================================ */

    togglePause(force) {
      if (!this.gameActive || this.busy || this.engine.status.over) return;
      const next = typeof force === 'boolean' ? force : !this.paused;
      if (next === this.paused) return;

      if (next) {
        this.paused = true;
        this.settleClock();
        this.pendingAI = this.aiThinking;
        this.cancelAI();
        this.dom.pauseOverlay.classList.remove('hidden');
        this.saveGame();
      } else {
        this.paused = false;
        this.dom.pauseOverlay.classList.add('hidden');
        this.clockRunningSince = this.unlimited ? null : this.now();
        if (this.pendingAI) {
          this.pendingAI = false;
          this.maybeAITurn();
        }
      }
      this.updateStatus();
      this.updateControls();
      this.renderer.setInteractive(this.canHumanInteract());
    }

    /* ============================================================
     * Fin de partie
     * ============================================================ */

    finishGame() {
      if (this.gameOverShown) return;
      this.gameOverShown = true;
      this.settleClock();
      this.clockRunningSince = null;
      this.cancelAI();
      this.renderer.setInteractive(false);
      this.gameActive = false;
      global.StorageManager.remove(CFG.STORAGE.KEYS.SAVE);

      const status = this.engine.status;
      const mode = this.engine.mode;
      const playerColor = this.engine.playerColor;
      const duration = Math.max(0, Math.floor((Date.now() - this.engine.startedAt) / 1000));
      const captures = this.engine.getCaptureCounts();
      const playerCaptures = mode === 'ai' ? captures[playerColor] : captures.white + captures.black;
      const moves = this.engine.history.length;
      const moveData = {
        notation: this.engine.history.map((h) => h.notation),
        replay: this.engine.history.map((h) => ({
          from: h.move.from, to: h.move.to,
          path: h.move.path.slice(), captures: h.move.captures.slice(),
          isCapture: h.move.isCapture, promotes: h.move.promotes
        }))
      };

      let outcome = 'draw';
      let xpGain = 0;
      if (status.result !== 'draw') {
        if (mode === 'ai') outcome = status.result === playerColor ? 'win' : 'loss';
        else outcome = status.result === WHITE ? 'white' : 'black';
      }

      if (mode === 'ai') {
        const record = global.Statistics.recordGame({
          result: outcome,
          difficulty: this.engine.difficulty,
          mode: 'ai',
          moves: moves,
          duration: duration,
          captures: playerCaptures,
          notation: moveData.notation,
          replay: moveData.replay
        });
        xpGain = record.xp + (record.bonusXp || 0);
        this.announceBadges(record.badges);
      } else {
        global.Statistics.recordGame({
          casual: true,
          result: outcome,
          moves: moves,
          duration: duration,
          captures: playerCaptures,
          notation: moveData.notation,
          replay: moveData.replay
        });
      }

      this.stats = global.Statistics.data;
      this.updateHome();

      let title = 'MATCH NUL';
      let subtitle = REASON_LABELS[status.reason] || 'La partie est terminée.';
      let iconClass = 'i-info';
      let iconTheme = 'draw';

      if (mode === 'ai') {
        if (outcome === 'win') {
          title = 'VICTOIRE';
          iconClass = 'i-trophy';
          iconTheme = '';
          subtitle = REASON_LABELS[status.reason] || 'Vous avez gagné la partie.';
        } else if (outcome === 'loss') {
          title = 'DÉFAITE';
          iconClass = 'i-x-circle';
          iconTheme = 'loss';
          subtitle = REASON_LABELS[status.reason] || 'L’IA remporte la partie.';
        }
      } else if (outcome === 'white') {
        title = 'LES BLANCS GAGNENT';
        iconClass = 'i-trophy';
        iconTheme = '';
      } else if (outcome === 'black') {
        title = 'LES NOIRS GAGNENT';
        iconClass = 'i-trophy';
        iconTheme = '';
      }

      this.dom.gameoverIcon.className = 'gameover-icon ' + iconTheme;
      this.dom.gameoverIcon.innerHTML = '<span class="icon ' + iconClass + '"></span>';
      this.dom.gameoverTitle.textContent = title;
      this.dom.gameoverSub.textContent = subtitle;
      this.dom.goMoves.textContent = String(moves);
      this.dom.goDuration.textContent = this.formatDuration(duration);
      this.dom.goCaptures.textContent = String(playerCaptures);
      this.dom.goXp.textContent = mode === 'ai' ? '+' + xpGain : '—';

      this.updateAll();
      this.openModal('modal-gameover');

      if (outcome === 'win' || outcome === 'white' || outcome === 'black') {
        global.AudioManager.play('victory');
        global.Animations.celebrate();
      } else if (outcome === 'draw') {
        global.AudioManager.play('draw');
      } else {
        global.AudioManager.play('invalid');
      }

      this.toast(mode === 'ai'
        ? (outcome === 'win' ? 'Victoire ! +' + xpGain + ' XP' : outcome === 'loss' ? 'Défaite. +' + xpGain + ' XP' : 'Match nul. +' + xpGain + ' XP')
        : 'Partie terminée.', outcome === 'loss' ? 'info' : 'success', 4200);
    }

    /* ============================================================
     * Interface de jeu
     * ============================================================ */

    getFlipped() {
      if (this.engine.mode === 'ai' && this.engine.playerColor === BLACK) return true;
      return !!this.settings.boardFlipped;
    }

    getBottomColor() {
      return this.getFlipped() ? BLACK : WHITE;
    }

    /** Met en évidence le dernier coup connu du moteur. */
    syncLastMove() {
      if (!this.renderer) return;
      const last = this.engine.history[this.engine.history.length - 1];
      this.renderer.showLastMove(last ? last.move : null);
    }

    updateAll() {
      this.syncPanels();
      this.updateHistory();
      this.updateClockUI();
      this.updateStatus();
      this.updateAIStats();
      this.updateControls();
      if (this.settings && this.settings.coachMode) {
        global.setTimeout(() => this.maybeCoachAnalysis(), 80);
      }
    }

    syncPanels() {
      if (!this.gameActive && !this.engine.history.length) return;
      const bottomColor = this.getBottomColor();
      const topColor = Rules.otherPlayer(bottomColor);
      const counts = this.engine.getCounts();
      const captures = this.engine.getCaptureCounts();
      const current = this.engine.currentPlayer;
      const mode = this.engine.mode;
      const human = this.engine.playerColor;
      const diff = CFG.DIFFICULTIES[this.engine.difficulty] || CFG.DIFFICULTIES.normal;
      const humanName = (this.settings && this.settings.playerName) || 'Vous';
      const humanAvatar = (this.settings && this.settings.playerAvatar) || 'user';

      const topName = mode === 'ai'
        ? (topColor === human ? humanName : 'IA · ' + diff.label)
        : (topColor === WHITE ? humanName : 'Joueur 2');
      const bottomName = mode === 'ai'
        ? (bottomColor === human ? humanName : 'IA · ' + diff.label)
        : (bottomColor === WHITE ? humanName : 'Joueur 2');

      this.dom.opponentName.textContent = topName;
      this.dom.playerPanelName.textContent = bottomName;
      this.dom.opponentMen.textContent = String(counts[topColor].men);
      this.dom.opponentKings.textContent = String(counts[topColor].kings);
      this.dom.opponentCaptures.textContent = String(captures[topColor]);
      this.dom.playerMen.textContent = String(counts[bottomColor].men);
      this.dom.playerKings.textContent = String(counts[bottomColor].kings);
      this.dom.playerCaptures.textContent = String(captures[bottomColor]);

      const topIsHuman = mode === 'ai' && topColor === human;
      const bottomIsHuman = mode === 'ai' && bottomColor === human;
      this.dom.opponentAvatar.innerHTML = '<span class="icon ' +
        (topIsHuman ? 'i-' + humanAvatar : mode === 'ai' ? 'i-cpu' : 'i-users') + '"></span>';
      this.dom.playerAvatar.innerHTML = '<span class="icon ' +
        (bottomIsHuman ? 'i-' + humanAvatar : mode === 'ai' ? 'i-cpu' : 'i-users') + '"></span>';

      const active = !this.engine.status.over && !this.paused;
      this.dom.panelTop.classList.toggle('is-active', active && current === topColor);
      this.dom.panelBottom.classList.toggle('is-active', active && current === bottomColor);

      this.dom.opponentTurn.textContent = this.turnLabel(topColor, current, mode, human);
      this.dom.playerTurn.textContent = this.turnLabel(bottomColor, current, mode, human);

      this.dom.gameModeLabel.textContent = mode === 'ai'
        ? 'VS IA · ' + diff.label.toUpperCase()
        : '2 JOUEURS · LOCAL';
    }

    turnLabel(color, current, mode, human) {
      if (this.engine.status.over) return 'TERMINÉ';
      if (this.paused) return 'PAUSE';
      if (current !== color) return 'EN ATTENTE';
      if (mode === 'ai') return color === human ? 'À VOUS' : 'IA RÉFLÉCHIT';
      return 'À VOUS';
    }

    updateStatus() {
      let text;
      if (this.engine.status.over) {
        text = 'Partie terminée';
      } else if (this.paused) {
        text = 'Partie en pause';
      } else if (this.aiThinking) {
        text = 'L’IA réfléchit…';
      } else {
        const label = CFG.PLAYER_LABELS[this.engine.currentPlayer];
        text = this.engine.mode === 'ai' && this.engine.currentPlayer === this.engine.playerColor
          ? 'À vous de jouer (' + label + ')'
          : 'Aux ' + label + ' de jouer';
      }
      this.dom.gameStatus.textContent = text;
    }

    updateHistory() {
      const list = this.dom.historyList;
      if (!list) return;
      list.innerHTML = '';
      const history = this.engine.history;
      for (let i = 0; i < history.length; i += 2) {
        const li = global.document.createElement('li');
        const number = global.document.createElement('span');
        number.className = 'move-num';
        number.textContent = (Math.floor(i / 2) + 1) + '.';
        li.appendChild(number);

        for (let j = 0; j < 2; j++) {
          const entry = history[i + j];
          const span = global.document.createElement('span');
          if (!entry) {
            span.className = 'move-white';
            span.textContent = '—';
          } else {
            span.className = entry.player === WHITE ? 'move-white' : 'move-black';
            span.textContent = entry.notation;
            if (entry.move.isCapture) span.classList.add('move-capture');
          }
          li.appendChild(span);
        }
        list.appendChild(li);
      }
      list.scrollTop = list.scrollHeight;
    }

    updateClockUI() {
      const bottomColor = this.getBottomColor();
      const topColor = Rules.otherPlayer(bottomColor);
      this.dom.playerTimer.textContent = this.formatClock(this.clocks[bottomColor]);
      this.dom.opponentTimer.textContent = this.formatClock(this.clocks[topColor]);
      this.dom.playerTimer.classList.toggle('low', !this.unlimited && this.clocks[bottomColor] <= 30000);
      this.dom.opponentTimer.classList.toggle('low', !this.unlimited && this.clocks[topColor] <= 30000);
    }

    updateAIStats() {
      if (!this.dom.aiStatsPanel) return;
      if (this.engine.mode !== 'ai' || !this.lastAIStats) {
        this.dom.aiStatsPanel.classList.add('hidden');
        return;
      }
      this.dom.aiStatsPanel.classList.remove('hidden');
      this.dom.aiDepth.textContent = String(this.lastAIStats.depth || '—');
      this.dom.aiNodes.textContent = this.formatNumber(this.lastAIStats.nodes || 0);
      this.dom.aiTime.textContent = ((this.lastAIStats.timeMs || 0) / 1000).toFixed(2) + ' s';
    }

    updateControls() {
      const canAct = this.gameActive && !this.busy && !this.aiThinking && !this.engine.status.over;
      const humanMoved = this.engine.history.some((h) => h.player === this.engine.playerColor);
      const canUndo = canAct && this.engine.canUndo() &&
        (this.engine.mode !== 'ai' || humanMoved);
      this.dom.btnUndo.disabled = !canUndo;
      this.dom.btnPause.disabled = !canAct;
      this.dom.btnRestart.disabled = !this.gameActive;
      this.dom.btnQuit.disabled = !this.gameActive;
    }

    /* ============================================================
     * Accueil, statistiques et historique
     * ============================================================ */

    updateHome() {
      if (!this.dom || !this.dom.playerLevel) return;
      this.updateProfileUI();
      const level = global.Statistics.level();
      const progress = global.Statistics.xpProgress();
      const percent = Math.max(0, Math.min(100, (progress.current / progress.next) * 100));
      this.dom.playerLevel.textContent = String(level);
      this.dom.xpCurrent.textContent = String(progress.current);
      this.dom.xpNext.textContent = String(progress.next);
      this.dom.xpFill.style.width = percent + '%';
      this.dom.statWins.textContent = String(this.stats.wins);
      this.dom.statLosses.textContent = String(this.stats.losses);
      this.dom.statDraws.textContent = String(this.stats.draws);
      this.dom.statBest.textContent = String(this.stats.bestScore);
    }

    refreshResumeButton() {
      if (!this.dom || !this.dom.btnResume) return;
      const save = global.StorageManager.get(CFG.STORAGE.KEYS.SAVE, null);
      const valid = !!(save && save.engine && Array.isArray(save.engine.board) &&
        save.engine.board.length === 100 && save.engine.status && !save.engine.status.over);
      this.dom.btnResume.classList.toggle('hidden', !valid);
    }

    openHistory() {
      this.stats = global.Statistics.load();
      const wins = this.stats.wins;
      const losses = this.stats.losses;
      const draws = this.stats.draws;
      const total = wins + losses + draws;
      const ratio = total > 0 ? Math.round((wins / total) * 100) : 0;

      this.dom.historyStatsRow.innerHTML =
        '<div><b>' + wins + '</b><small>Victoires</small></div>' +
        '<div><b>' + losses + '</b><small>Défaites</small></div>' +
        '<div><b>' + draws + '</b><small>Nuls</small></div>' +
        '<div><b>' + ratio + ' %</b><small>Taux de victoire</small></div>' +
        '<div><b>' + (this.stats.bestStreak || 0) + '</b><small>Meilleure série</small></div>' +
        '<div><b>' + (this.stats.badges || []).length + '/' + global.Statistics.ACHIEVEMENTS.length + '</b><small>Succès</small></div>';

      const games = this.stats.games || [];
      this.dom.historyTable.innerHTML = '';
      this.dom.historyEmpty.classList.toggle('hidden', games.length > 0);

      games.forEach((game, gameIndex) => {
        const li = global.document.createElement('li');
        const date = global.document.createElement('span');
        date.className = 'h-date';
        date.textContent = this.formatDate(game.date);

        const mode = global.document.createElement('span');
        mode.className = 'h-mode';
        mode.textContent = game.mode === 'pvp'
          ? '2 joueurs'
          : 'VS IA · ' + ((CFG.DIFFICULTIES[game.difficulty] || {}).label || 'Normal');

        const result = global.document.createElement('span');
        const resultMap = {
          win: ['VICTOIRE', 'win'],
          loss: ['DÉFAITE', 'loss'],
          draw: ['NUL', 'draw'],
          white: ['BLANCS', 'pvp'],
          black: ['NOIRS', 'pvp']
        };
        const pair = resultMap[game.result] || ['NUL', 'draw'];
        result.className = 'h-result ' + pair[1];
        result.textContent = pair[0];

        const meta = global.document.createElement('span');
        meta.className = 'h-meta';
        meta.textContent = game.moves + ' coups · ' + this.formatDuration(game.duration);

        const xp = global.document.createElement('span');
        xp.className = 'h-xp';
        xp.textContent = game.xp > 0 ? '+' + game.xp + ' XP' : '—';

        li.appendChild(date);
        li.appendChild(mode);
        li.appendChild(result);
        li.appendChild(meta);
        li.appendChild(xp);

        const replayBtn = global.document.createElement('button');
        replayBtn.className = 'h-replay';
        replayBtn.type = 'button';
        replayBtn.title = 'Revoir cette partie';
        replayBtn.setAttribute('aria-label', 'Revoir cette partie');
        replayBtn.innerHTML = '<span class="icon i-play"></span>';
        const hasReplay = Array.isArray(game.replay) && game.replay.length > 0;
        replayBtn.disabled = !hasReplay;
        if (hasReplay) {
          replayBtn.addEventListener('click', () => this.openGameReplay(gameIndex));
        }
        li.appendChild(replayBtn);
        this.dom.historyTable.appendChild(li);
      });

      this.openModal('modal-history');
    }

    /* ============================================================
     * Puzzles tactiques
     * ============================================================ */

    openPuzzles() {
      const Puzzles = global.CheckersPuzzles;
      if (!Puzzles) return;
      this.closeModal('modal-achievements');
      this.closeModal('modal-replay');
      this.dom.puzzleSelect.innerHTML = '';
      Puzzles.list.forEach((puzzle) => {
        const option = global.document.createElement('option');
        option.value = puzzle.id;
        option.textContent = puzzle.title + ' · ' + puzzle.level;
        this.dom.puzzleSelect.appendChild(option);
      });
      if (!this.puzzleRenderer) {
        this.puzzleRenderer = new global.BoardRenderer(this.dom.puzzleBoard, this.dom.puzzlePieces);
        this.puzzleRenderer.onSquareClick = (square) => this.onPuzzleSquareClick(square);
      }
      this.loadPuzzle(Puzzles.daily());
      this.openModal('modal-puzzles');
    }

    loadPuzzle(puzzle) {
      if (!puzzle || !this.puzzleRenderer) return;
      this.puzzleState = {
        puzzle: puzzle,
        board: Rules.boardFromPieces(puzzle.spec),
        step: 0,
        selected: null,
        solved: false
      };
      this.puzzleRenderer.setFlipped(false);
      this.puzzleRenderer.render(this.puzzleState.board);
      this.dom.puzzleSelect.value = puzzle.id;
      this.dom.puzzleLevel.textContent = String(puzzle.level).toUpperCase();
      this.dom.puzzleTitle.textContent = puzzle.title;
      this.dom.puzzleDesc.textContent = 'Trouvez la séquence qui capture les bonnes pièces.';
      this.dom.puzzleProgress.textContent = '0 / ' + puzzle.solution.length + ' coups';
      this.setPuzzleFeedback('À vous de jouer : choisissez une pièce blanche.');
    }

    setPuzzleFeedback(message, kind) {
      this.dom.puzzleFeedback.className = 'puzzle-feedback' + (kind ? ' ' + kind : '');
      this.dom.puzzleFeedback.textContent = message;
    }

    onPuzzleSquareClick(square) {
      const state = this.puzzleState;
      if (!state || state.solved) return;
      const puzzle = state.puzzle;
      const piece = state.board[square];
      const allMoves = Rules.getLegalMoves(state.board, puzzle.player);

      if (state.selected === null) {
        if (piece && Rules.pieceBelongsTo(piece, puzzle.player)) {
          state.selected = square;
          this.puzzleRenderer.showMoves(square, allMoves.filter((m) => m.from === square), true);
          this.setPuzzleFeedback('Pièce sélectionnée : choisissez une case cible.');
        } else {
          this.setPuzzleFeedback('Choisissez une pièce blanche.', 'error');
        }
        return;
      }

      const move = allMoves.find((m) => m.from === state.selected && m.to === square);
      if (!move) {
        if (piece && Rules.pieceBelongsTo(piece, puzzle.player)) {
          state.selected = square;
          this.puzzleRenderer.showMoves(square, allMoves.filter((m) => m.from === square), true);
          this.setPuzzleFeedback('Pièce sélectionnée : choisissez une case cible.');
        } else {
          state.selected = null;
          this.puzzleRenderer.clearHighlights();
          this.setPuzzleFeedback('Choisissez une case de destination valide.');
        }
        return;
      }

      const wanted = puzzle.solution[state.step];
      const capturesOf = (m) => m.captures.slice().sort((a, b) => a - b).join(',');
      const expected = wanted.captures.slice().sort((a, b) => a - b).join(',');
      const correct = move.from === wanted.from && capturesOf(move) === expected &&
        (!wanted.to || move.to === wanted.to);

      if (!correct) {
        global.AudioManager.play('invalid');
        this.setPuzzleFeedback('Ce coup ne résout pas le puzzle. Réessayez !', 'error');
        return;
      }

      state.board = Rules.applyMove(state.board, move);
      state.step++;
      state.selected = null;
      this.puzzleRenderer.render(state.board);
      this.puzzleRenderer.showLastMove(move);
      this.dom.puzzleProgress.textContent = state.step + ' / ' + puzzle.solution.length + ' coups';

      if (state.step < puzzle.solution.length) {
        global.AudioManager.play('capture');
        this.setPuzzleFeedback('Bon coup ! Continuez la rafle.', 'success');
        return;
      }

      state.solved = true;
      const reward = global.Statistics.awardPuzzle(puzzle.id);
      this.stats = global.Statistics.data;
      this.updateHome();
      global.AudioManager.play('victory');
      this.setPuzzleFeedback('Bravo, puzzle résolu !' +
        (reward.xp > 0 ? ' +' + reward.xp + ' XP' : ' (déjà résolu)'), 'success');
      this.toast(reward.xp > 0 ? 'Puzzle résolu : +' + reward.xp + ' XP' : 'Puzzle résolu !', 'success');
      this.announceBadges(reward.unlocked);
    }

    showPuzzleHint() {
      const state = this.puzzleState;
      if (!state || state.solved) return;
      const wanted = state.puzzle.solution[state.step];
      const capturesOf = (m) => m.captures.slice().sort((a, b) => a - b).join(',');
      const expected = wanted.captures.slice().sort((a, b) => a - b).join(',');
      const moves = Rules.getLegalMoves(state.board, state.puzzle.player)
        .filter((m) => m.from === wanted.from && capturesOf(m) === expected);
      if (!moves.length) return;
      const move = moves[0];
      this.puzzleRenderer.showMoves(move.from, [move], true);
      this.setPuzzleFeedback(state.puzzle.hint + ' → case ' + Rules.squareNumber(move.from) +
        ' vers ' + Rules.squareNumber(move.to) + '.');
    }

    resetPuzzle() {
      if (this.puzzleState) this.loadPuzzle(this.puzzleState.puzzle);
    }

    /* ============================================================
     * Replay des parties
     * ============================================================ */

    openGameReplay(gameIndex) {
      const games = (this.stats && this.stats.games) || [];
      const game = games[gameIndex];
      if (!game) {
        this.toast('Partie introuvable.', 'error');
        return;
      }
      if (!Array.isArray(game.replay) || game.replay.length === 0) {
        this.toast('Le replay n’est pas disponible pour cette partie.', 'error');
        return;
      }

      const boards = [Rules.createInitialBoard()];
      let board = boards[0].slice();
      for (const move of game.replay) {
        board = Rules.applyMove(board, move);
        boards.push(board.slice());
      }

      this.replayData = {
        boards: boards,
        moves: game.replay,
        notations: Array.isArray(game.notation)
          ? game.notation.slice()
          : game.replay.map((move) => Rules.moveNotation(move)),
        ply: 0
      };

      if (!this.replayRenderer) {
        this.replayRenderer = new global.BoardRenderer(this.dom.replayBoard, this.dom.replayPieces);
      }
      this.replayRenderer.setFlipped(this.getFlipped());
      this.buildReplayMoveList();
      this.setReplayPly(0);
      this.closeModal('modal-history');
      this.closeModal('modal-gameover');
      this.closeModal('modal-puzzles');
      this.closeModal('modal-achievements');
      this.openModal('modal-replay');
    }

    buildReplayMoveList() {
      const data = this.replayData;
      if (!data) return;
      this.dom.replayMoves.innerHTML = '';
      data.moves.forEach((move, index) => {
        const li = global.document.createElement('li');
        li.dataset.ply = String(index + 1);
        const num = global.document.createElement('span');
        num.className = 'r-num';
        num.textContent = (Math.floor(index / 2) + 1) + '.';
        const notation = global.document.createElement('span');
        notation.className = index % 2 === 0 ? 'r-white' : 'r-black';
        notation.textContent = data.notations[index] || Rules.moveNotation(move);
        li.appendChild(num);
        li.appendChild(notation);
        li.addEventListener('click', () => {
          this.stopReplayPlay();
          this.setReplayPly(index + 1);
        });
        this.dom.replayMoves.appendChild(li);
      });
    }

    setReplayPly(ply) {
      const data = this.replayData;
      if (!data) return;
      data.ply = Math.max(0, Math.min(data.moves.length, Number(ply) || 0));
      this.replayRenderer.render(data.boards[data.ply]);
      this.replayRenderer.showLastMove(data.ply > 0 ? data.moves[data.ply - 1] : null);
      this.dom.replaySlider.max = String(data.moves.length);
      this.dom.replaySlider.value = String(data.ply);
      this.dom.replayPly.textContent = data.ply + ' / ' + data.moves.length;
      if (data.ply === 0) {
        this.dom.replayMoveLabel.textContent = 'Position initiale';
      } else {
        const side = data.ply % 2 === 1 ? 'Blancs' : 'Noirs';
        this.dom.replayMoveLabel.textContent = side + ' · ' +
          (data.notations[data.ply - 1] || Rules.moveNotation(data.moves[data.ply - 1]));
      }
      $$('.replay-moves li', this.dom.replayMoves).forEach((li) => {
        li.classList.toggle('is-current', Number(li.dataset.ply) === data.ply);
      });
    }

    stepReplay(delta) {
      if (!this.replayData) return;
      this.stopReplayPlay();
      this.setReplayPly(this.replayData.ply + delta);
    }

    toggleReplayPlay() {
      if (this.replayTimer) {
        this.stopReplayPlay();
        return;
      }
      if (!this.replayData || !this.replayData.moves.length) return;
      if (this.replayData.ply >= this.replayData.moves.length) this.setReplayPly(0);
      this.dom.btnReplayPlay.innerHTML = '<span class="icon i-pause"></span> PAUSE';
      this.replayTimer = global.setInterval(() => {
        if (!this.replayData || this.replayData.ply >= this.replayData.moves.length) {
          this.stopReplayPlay();
          return;
        }
        this.setReplayPly(this.replayData.ply + 1);
      }, Number(this.dom.replaySpeed.value) || 550);
    }

    stopReplayPlay() {
      if (this.replayTimer) {
        global.clearInterval(this.replayTimer);
        this.replayTimer = null;
      }
      if (this.dom.btnReplayPlay) {
        this.dom.btnReplayPlay.innerHTML = '<span class="icon i-play"></span> LECTURE';
      }
    }

    /* ============================================================
     * Paramètres
     * ============================================================ */

    openSettings() {
      this.settings = global.SettingsManager.load();
      this.dom.setTheme.value = this.settings.theme;
      this.dom.setPieces.value = this.settings.pieceStyle;
      this.dom.setDifficulty.value = this.settings.difficulty;
      this.dom.setTimer.value = String(this.settings.timerMinutes);
      this.dom.setAnimSpeed.value = String(this.settings.animationSpeed);
      this.dom.setAiTime.value = String(this.settings.aiThinkMs);
      this.dom.setVolume.value = String(Math.round(this.settings.volume * 100));
      this.dom.volumeValue.textContent = Math.round(this.settings.volume * 100) + ' %';
      this.dom.setSounds.checked = !!this.settings.soundsEnabled;
      this.dom.setAnimations.checked = !!this.settings.animationsEnabled;
      this.dom.setHints.checked = !!this.settings.showLegalMoves;
      this.dom.setCoach.checked = !!this.settings.coachMode;
      this.dom.setCapturesOptional.checked = !!this.settings.capturesOptional;
      this.dom.setChainCaptures.checked = !!this.settings.chainCaptures;
      this.dom.setPlayerName.value = this.settings.playerName || 'Joueur';
      const avatarBtn = $('#modal-settings [data-avatar="' + (this.settings.playerAvatar || 'user') + '"]');
      if (avatarBtn) this.setAvatarActive(avatarBtn);

      const flipBtn = $('#modal-settings [data-flip="' + (this.settings.boardFlipped ? 'true' : 'false') + '"]');
      if (flipBtn) this.setFlipActive(flipBtn);
      this.updateThemeUI();
      this.updateProfileUI();
      this.updateCoachUI();
      this.buildSettingsPreview();
      this.renderSettingsPreview();

      this.openModal('modal-settings');
    }

    resetSettings() {
      global.SettingsManager.reset();
      this.settings = global.SettingsManager.settings;
      global.AudioManager.configure(this.settings);
      this.openSettings();
      this.updateSoundUI();
      this.toast('Paramètres réinitialisés.', 'success');
    }

    /** Télécharge les paramètres et les scores dans un fichier JSON. */
    exportData() {
      const payload = {
        format: 'checkers-legend-2026',
        version: 1,
        exportedAt: new Date().toISOString(),
        settings: Object.assign({}, global.SettingsManager.settings),
        stats: Object.assign({}, global.Statistics.data)
      };
      try {
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = global.document.createElement('a');
        link.href = url;
        link.download = 'checkers-legend-' + new Date().toISOString().slice(0, 10) + '.json';
        global.document.body.appendChild(link);
        link.click();
        link.remove();
        global.setTimeout(() => URL.revokeObjectURL(url), 1000);
        this.toast('Données exportées en JSON.', 'success');
      } catch (error) {
        this.toast('Export impossible : ' + error.message, 'error');
      }
    }

    /** Restaure les paramètres et les scores depuis un fichier JSON exporté. */
    async importDataFile(file) {
      try {
        const payload = JSON.parse(await file.text());
        if (!payload || payload.format !== 'checkers-legend-2026' ||
            !payload.settings || !payload.stats) {
          throw new Error('Format de fichier invalide.');
        }
        const settingsOk = global.SettingsManager.importData(payload.settings);
        const statsOk = global.Statistics.importData(payload.stats);
        if (!settingsOk || !statsOk) throw new Error('Données invalides dans le fichier.');

        this.settings = global.SettingsManager.settings;
        this.stats = global.Statistics.data;
        global.AudioManager.configure(this.settings);
        this.updateSoundUI();
        this.updateThemeUI();
        this.updateProfileUI();
        this.updateCoachUI();
        this.updateHome();
        this.renderSettingsPreview();
        this.toast('Données importées avec succès.', 'success');
      } catch (error) {
        this.toast('Import impossible : ' + error.message, 'error');
      }
    }

    /* ============================================================
     * Modales et confirmations
     * ============================================================ */

    openModal(id) {
      const modal = global.document.getElementById(id);
      if (!modal) return;
      this.lastFocus = global.document.activeElement;
      modal.classList.remove('hidden');
      global.document.body.style.overflow = 'hidden';
      const close = modal.querySelector('.modal-close');
      if (close) global.setTimeout(() => close.focus(), 40);
    }

    closeModal(id) {
      const modal = global.document.getElementById(id);
      if (!modal) return;
      if (id === 'modal-replay') this.stopReplayPlay();
      modal.classList.add('hidden');
      if (!document.querySelector('.modal-layer:not(.hidden)')) {
        global.document.body.style.overflow = '';
      }
      if (id === 'modal-confirm' && this.confirmResolve) {
        const resolve = this.confirmResolve;
        this.confirmResolve = null;
        resolve(false);
      }
      if (this.lastFocus && typeof this.lastFocus.focus === 'function') {
        try { this.lastFocus.focus(); } catch (e) { /* ignoré */ }
      }
    }

    closeAllModals() {
      $$('.modal-layer:not(.hidden)').forEach((modal) => this.closeModal(modal.id));
      this.dom.pauseOverlay.classList.add('hidden');
    }

    askConfirm(message, okLabel) {
      return new Promise((resolve) => {
        this.confirmResolve = resolve;
        this.dom.confirmMessage.textContent = message;
        this.dom.btnConfirmOk.innerHTML = '<span class="icon i-check"></span> ' + (okLabel || 'CONFIRMER');
        this.openModal('modal-confirm');
      });
    }

    resolveConfirm(value) {
      const resolve = this.confirmResolve;
      this.confirmResolve = null;
      this.closeModal('modal-confirm');
      if (resolve) resolve(value);
    }

    /* ============================================================
     * Audio, plein écran, notifications
     * ============================================================ */

    toggleSound() {
      const enabled = !this.settings.soundsEnabled;
      global.SettingsManager.set('soundsEnabled', enabled);
      this.settings = global.SettingsManager.settings;
      global.AudioManager.configure(this.settings);
      this.updateSoundUI();
      if (enabled) {
        global.AudioManager.unlock();
        global.AudioManager.play('click');
        this.toast('Sons activés.', 'success', 1600);
      } else {
        this.toast('Sons coupés.', 'info', 1600);
      }
    }

    updateSoundUI() {
      const enabled = this.settings.soundsEnabled;
      [this.dom.btnSoundHome, this.dom.btnSoundGame].forEach((btn) => {
        if (!btn) return;
        btn.innerHTML = '<span class="icon ' + (enabled ? 'i-volume' : 'i-volume-off') + '"></span>';
        btn.setAttribute('aria-label', enabled ? 'Couper le son' : 'Activer le son');
        btn.setAttribute('title', enabled ? 'Couper le son' : 'Activer le son');
      });
      const settingIcon = $('#sound-setting-icon');
      if (settingIcon) settingIcon.className = 'icon ' + (enabled ? 'i-volume' : 'i-volume-off');
    }

    async toggleFullscreen() {
      try {
        if (!global.document.fullscreenElement) {
          await global.document.documentElement.requestFullscreen();
          this.toast('Mode plein écran activé.', 'info', 1800);
        } else {
          await global.document.exitFullscreen();
        }
      } catch (error) {
        this.toast('Le plein écran n’est pas disponible sur cet appareil.', 'error', 3200);
      }
    }

    /** Notifie les succès nouvellement débloqués. */
    announceBadges(badges) {
      (badges || []).forEach((badge, index) => {
        global.setTimeout(() => {
          this.toast('Succès débloqué : ' + badge.label + ' (+' + badge.xp + ' XP)', 'success', 3600);
          global.AudioManager.play('victory');
        }, 500 + index * 700);
      });
    }

    toast(message, type, duration) {
      if (!this.dom || !this.dom.toasts) return;
      const el = global.document.createElement('div');
      el.className = 'toast ' + (type || 'info');
      const icon = type === 'error' ? 'i-x-circle' : type === 'success' ? 'i-check' : 'i-info';
      el.innerHTML = '<span class="icon ' + icon + '"></span><span></span>';
      el.lastElementChild.textContent = message;
      this.dom.toasts.appendChild(el);
      const timeout = duration || 2800;
      global.setTimeout(() => {
        el.classList.add('out');
        global.setTimeout(() => el.remove(), 320);
      }, timeout);
    }

    /* ============================================================
     * Sauvegarde / persistance
     * ============================================================ */

    bindPersistence() {
      global.addEventListener('pagehide', () => this.saveGame());
      global.addEventListener('beforeunload', () => this.saveGame());
      global.document.addEventListener('visibilitychange', () => {
        if (global.document.hidden) {
          if (this.gameActive && !this.paused) this.togglePause(true);
          this.saveGame();
        }
      });
    }

    /** Construit le payload de sauvegarde complet (auto-save et emplacements). */
    buildSavePayload() {
      return {
        engine: this.engine.serialize(),
        clocks: this.unlimited ? { white: 0, black: 0 } : {
          white: this.clocks.white,
          black: this.clocks.black
        },
        unlimited: this.unlimited,
        config: this.currentConfig,
        savedAt: Date.now()
      };
    }

    saveGame() {
      if (!this.gameActive || this.engine.status.over || this.engine.history.length === 0) return;
      global.StorageManager.set(CFG.STORAGE.KEYS.SAVE, this.buildSavePayload());
    }

    /** Copie la notation des coups de la partie en cours. */
    copyNotation() {
      if (!this.engine || this.engine.history.length === 0) {
        this.toast('Aucun coup à copier.', 'error');
        return;
      }
      const lines = ['CHECKERS LEGEND 2026 — ' + new Date().toLocaleString()];
      this.engine.history.forEach((h, i) => {
        const prefix = i % 2 === 0 ? (Math.floor(i / 2) + 1) + '. ' : '    ';
        lines.push(prefix + (h.player === WHITE ? 'Blancs' : 'Noirs') + ' ' + h.notation);
      });
      const text = lines.join('\n');
      const done = () => this.toast('Notation copiée.', 'success', 1800);
      const fallback = () => {
        const ta = global.document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        global.document.body.appendChild(ta);
        ta.select();
        try {
          global.document.execCommand('copy');
          done();
        } catch (error) {
          this.toast('Copie impossible.', 'error');
        }
        ta.remove();
      };
      if (global.navigator && global.navigator.clipboard && global.navigator.clipboard.writeText) {
        global.navigator.clipboard.writeText(text).then(done).catch(fallback);
      } else {
        fallback();
      }
    }

    /* ---------- Sauvegardes manuelles (3 emplacements) ---------- */

    saveSlotKey(slot) {
      return CFG.STORAGE.KEYS.SAVE + ':slot' + slot;
    }

    openSaves() {
      this.renderSaveSlots();
      this.openModal('modal-saves');
    }

    renderSaveSlots() {
      if (!this.dom.savesList) return;
      this.dom.savesList.innerHTML = '';
      for (let slot = 1; slot <= 3; slot++) {
        const save = global.StorageManager.get(this.saveSlotKey(slot), null);
        const li = global.document.createElement('li');
        li.className = 'save-slot';

        const info = global.document.createElement('div');
        info.className = 'save-slot-info';
        const title = global.document.createElement('span');
        title.className = 'save-slot-title';
        title.textContent = 'EMPLACEMENT ' + slot;
        const meta = global.document.createElement('span');
        meta.className = 'save-slot-meta';
        if (save && save.engine && Array.isArray(save.engine.history)) {
          const modeText = save.config && save.config.mode === 'pvp' ? '2 joueurs' : 'VS IA';
          const when = save.savedAt ? new Date(save.savedAt).toLocaleString() : '—';
          meta.textContent = modeText + ' · ' + save.engine.history.length + ' coups · ' + when;
        } else {
          meta.textContent = 'Vide';
        }
        info.appendChild(title);
        info.appendChild(meta);

        const actions = global.document.createElement('div');
        actions.className = 'save-slot-actions';
        const hasSave = !!(save && save.engine && Array.isArray(save.engine.history));
        const mkBtn = (label, icon, handler, disabled) => {
          const btn = global.document.createElement('button');
          btn.type = 'button';
          btn.className = 'ctrl-btn';
          btn.disabled = !!disabled;
          btn.innerHTML = '<span class="icon ' + icon + '"></span><span>' + label + '</span>';
          btn.addEventListener('click', handler);
          return btn;
        };
        actions.appendChild(mkBtn('Charger', 'i-play', () => this.loadFromSlot(slot), !hasSave));
        actions.appendChild(mkBtn('Écraser', 'i-download', async () => {
          if (await this.askConfirm('Écraser l’emplacement ' + slot + ' ?', 'ÉCRASER')) {
            this.saveToSlot(slot);
          }
        }));
        actions.appendChild(mkBtn('Supprimer', 'i-close', async () => {
          if (await this.askConfirm('Supprimer l’emplacement ' + slot + ' ?', 'SUPPRIMER')) {
            this.deleteSlot(slot);
          }
        }, !hasSave));

        li.appendChild(info);
        li.appendChild(actions);
        this.dom.savesList.appendChild(li);
      }
    }

    saveToSlot(slot) {
      if (!this.gameActive || this.engine.status.over || this.engine.history.length === 0) {
        this.toast('Aucune partie en cours à enregistrer.', 'error');
        return;
      }
      global.StorageManager.set(this.saveSlotKey(slot), this.buildSavePayload());
      this.toast('Partie enregistrée dans l’emplacement ' + slot + '.', 'success');
      if (this.dom.modalSaves && !this.dom.modalSaves.classList.contains('hidden')) this.renderSaveSlots();
    }

    deleteSlot(slot) {
      global.StorageManager.remove(this.saveSlotKey(slot));
      this.toast('Emplacement ' + slot + ' supprimé.', 'info');
      this.renderSaveSlots();
    }

    loadFromSlot(slot) {
      const key = this.saveSlotKey(slot);
      const save = global.StorageManager.get(key, null);
      if (!this.loadSavePayload(save, { key: key, manual: true })) {
        this.toast('Emplacement ' + slot + ' vide ou invalide.', 'error');
      }
    }

    /* ============================================================
     * Service Worker / PWA
     * ============================================================ */

    registerServiceWorker() {
      if (!('serviceWorker' in global.navigator)) return;
      if (!/^https?:$/.test(global.location.protocol)) return;

      global.navigator.serviceWorker.register('service-worker.js')
        .then((registration) => {
          if (registration.waiting) {
            this.toast('Mise à jour disponible : rechargez pour l’appliquer.', 'info', 5000);
          }
          registration.addEventListener('updatefound', () => {
            const worker = registration.installing;
            if (!worker) return;
            worker.addEventListener('statechange', () => {
              if (worker.state === 'installed' && global.navigator.serviceWorker.controller) {
                this.toast('Mise à jour disponible : rechargez pour l’appliquer.', 'info', 5000);
              }
            });
          });
          return global.navigator.serviceWorker.ready;
        })
        .then(() => {
          if (!global.sessionStorage.getItem('cl2026:offline-toast')) {
            global.sessionStorage.setItem('cl2026:offline-toast', '1');
            this.toast('Mode hors ligne prêt : le jeu fonctionne sans Internet.', 'success', 4200);
          }
        })
        .catch((error) => {
          console.warn('[PWA] Service Worker non enregistré :', error);
        });
    }

    /* ============================================================
     * Utilitaires
     * ============================================================ */

    formatClock(ms) {
      if (!Number.isFinite(ms)) return '∞';
      const total = Math.max(0, Math.ceil(ms / 1000));
      const minutes = Math.floor(total / 60);
      const seconds = total % 60;
      return String(minutes).padStart(2, '0') + ':' + String(seconds).padStart(2, '0');
    }

    formatDuration(seconds) {
      const total = Math.max(0, Math.floor(seconds || 0));
      const minutes = Math.floor(total / 60);
      const rest = total % 60;
      return minutes + ':' + String(rest).padStart(2, '0');
    }

    formatNumber(value) {
      try {
        return Number(value || 0).toLocaleString('fr-FR');
      } catch (e) {
        return String(value || 0);
      }
    }

    formatDate(timestamp) {
      if (!timestamp) return '—';
      try {
        return new Date(timestamp).toLocaleDateString('fr-FR', {
          day: '2-digit',
          month: '2-digit'
        }) + ' ' + new Date(timestamp).toLocaleTimeString('fr-FR', {
          hour: '2-digit',
          minute: '2-digit'
        });
      } catch (e) {
        return '—';
      }
    }
  }

  function boot() {
    const app = new CheckersApp();
    global.checkersApp = app;
    app.init();
  }

  if (global.document.readyState === 'loading') {
    global.document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})(typeof window !== 'undefined' ? window : globalThis);
