/**
 * CHECKERS LEGEND 2026 — Contrôleur principal
 * --------------------------------------------
 * Orchestre l'interface, le moteur de jeu, l'IA (Web Worker), les
 * animations, les sons, les paramètres, les statistiques et les
 * sauvegardes locales. Aucune dépendance réseau.
 */
/**
 * GUIDE DE LECTURE DU CONTRÔLEUR (à lire avant de modifier le fichier)
 * -------------------------------------------------------------------
 * Rôle : ce fichier est le « chef d'orchestre » de l'application. Il relie le
 * moteur des règles, le plateau affiché, l'IA, les animations, les sons, les
 * réglages, les statistiques et les sauvegardes. Les règles du jeu elles-mêmes
 * ne sont pas ici : elles vivent dans les autres modules du dossier.
 *
 * Les concepts JavaScript rencontrés :
 * - IIFE : tout le code est enfermé dans une fonction appelée immédiatement,
 *   afin de ne pas encombrer l'espace global. `global` désigne la fenêtre.
 * - class et constructor : `CheckersApp` est un modèle d'objet. Le `constructor`
 *   prépare les propriétés au moment où l'on écrit `new CheckersApp()`.
 * - `this` : dans une méthode, `this` est l'objet CheckersApp en cours de travail.
 * - callback : une fonction passée à une autre, que le navigateur rappellera
 *   plus tard (par exemple un gestionnaire de clic).
 * - flèche `=>` : écriture courte d'une fonction ; elle conserve le `this` du contexte.
 * - async / await et Promise : une Promise est un résultat disponible plus tard.
 *   `await` attend ce résultat sans figer le navigateur (import de fichier, plein écran).
 * - événements DOM : `addEventListener` abonne une callback à un clic, une saisie,
 *   une touche du clavier ou un changement d'onglet.
 * - tableau (Array) : liste ordonnée, par exemple `history` ou `board`.
 * - objet : ensemble de propriétés nommées, par exemple `settings` ou `clocks`.
 * - stockage local : `StorageManager` garde parties, réglages et profils dans le
 *   navigateur ; ils restent disponibles même sans connexion.
 *
 * Comment naviguer : le fichier est découpé en sections signalées par des bandeaux
 * « ==== ». Dans l'ordre : Initialisation, Navigation et événements, Écrans et
 * parties, Interaction plateau, Mode coach, Intelligence artificielle (Worker),
 * Chronomètre, Pause, Fin de partie, Interface de jeu, Accueil et statistiques,
 * Puzzles tactiques, Replay, Paramètres, Modales, Audio et notifications,
 * Sauvegarde, Profils, Service Worker et Utilitaires. Repérez le bandeau qui
 * correspond à votre question, puis lisez la méthode juste en dessous.
 */

(function (global) {
  'use strict';

  /** Configuration globale : couleurs, difficultés, clés de stockage, limites. */
  const CFG = global.GameConfig;
  /** Module des règles : plateau initial, coups légaux, notation. */
  const Rules = global.CheckersRules;
  /** Raccourci vers la valeur qui représente la couleur blanche. */
  const WHITE = CFG.WHITE;
  /** Raccourci vers la valeur qui représente la couleur noire. */
  const BLACK = CFG.BLACK;

  /** Raccourci : renvoie le premier élément HTML qui correspond au sélecteur. */
  const $ = (selector, root) => (root || global.document).querySelector(selector);
  /** Raccourci : renvoie tous les éléments correspondants sous forme de tableau. */
  const $$ = (selector, root) => Array.prototype.slice.call(
    (root || global.document).querySelectorAll(selector)
  );

  /** Traduction des raisons de fin de partie en phrases lisibles par le joueur. */
  const REASON_LABELS = {
    'no-pieces': 'Toutes les pièces adverses ont été capturées.',
    'no-moves': 'L’adversaire n’a plus aucun coup légal.',
    'repetition': 'Trois répétitions de la même position : match nul.',
    'no-progress': '25 coups sans capture ni mouvement de pion : match nul.',
    'timeout': 'Le temps de réflexion est écoulé.'
  };

  class CheckersApp {
    /**
     * Prépare toutes les mémoires de l'application au moment de sa création.
     * Aucun argument : le constructeur est appelé automatiquement par `new`.
     * @returns {void} Rien : il initialise seulement les propriétés de l'objet.
     * Concept JS : `this.xxx` est une propriété de l'objet ; `gameToken` et `aiToken`
     *   sont des compteurs qui permettent d'ignorer les réponses périmées.
     */
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

    /**
     * Démarre l'application : récupère les éléments HTML, charge les réglages et les
     * scores, installe les écouteurs d'événements puis affiche l'accueil.
     * @returns {void} Rien : l'application est prête à être utilisée.
     * Concept JS : les fonctions fléchées `=>` sont données à `addEventListener` ;
     *   le navigateur les rappellera quand l'événement arrivera.
     */
    init() {
      this.cacheDom();

      if (!global.StorageManager.isAvailable()) {
        this.toast('Stockage local indisponible : la progression ne sera pas conservée.', 'error', 5200);
      }

      if (global.ProfileManager) global.ProfileManager.ensure();
      this.settings = global.SettingsManager.load();
      this.updateThemeUI();
      this.updateCoachUI();
      this.stats = global.Statistics.load();

      global.AudioManager.configure(this.settings);
      global.AudioManager.init();
      global.Animations.init(this.dom.fxCanvas);
      if (global.ParticlesBackground) global.ParticlesBackground.init(this.dom.bgParticles);

      this.renderer = new global.BoardRenderer(this.dom.board, this.dom.piecesLayer);
      this.renderer.onSquareClick = (square) => this.onSquareClick(square);

      this.bindEvents();
      this.bindSettings();
      this.bindModalSystem();
      this.updateHome();
      this.updateSoundUI();
      this.refreshResumeButton();
      this.showScreen('home');
      this.maybeShowGithubPromo();

      // Déverrouille l'audio à la première interaction (politique navigateur).
      const unlock = () => {
        global.AudioManager.unlock();
        global.document.removeEventListener('pointerdown', unlock);
        global.document.removeEventListener('keydown', unlock);
      };
      global.document.addEventListener('pointerdown', unlock, { once: true });
      global.document.addEventListener('keydown', unlock, { once: true });

      // Le chronomètre est relu toutes les 250 ms ; tickClock ignore les pauses.
      this.clockTimer = global.setInterval(() => this.tickClock(), 250);
      this.registerServiceWorker();
      this.bindPersistence();
    }

    /**
     * Enregistre dans `this.dom` les éléments HTML utilisés très souvent.
     * @returns {void} Rien : l'objet `dom` est rempli de références aux éléments.
     * Concept JS : un objet regroupe des valeurs sous forme de paires nom/valeur.
     */
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
        bgParticles: $('#bg-particles'),
        boardFrame: $('.board-frame'),

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
        namedSavesList: $('#named-saves-list'),
        namedSaveName: $('#named-save-name'),
        modalProfiles: $('#modal-profiles'),
        profilesList: $('#profiles-list'),
        newProfileName: $('#new-profile-name'),
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
        setGithubPromo: $('#set-github-promo'),
        modalGithubPromo: $('#modal-github-promo'),
        btnPromoDisable: $('#btn-promo-disable'),
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
        puzzleNext: $('#btn-puzzle-next'),
        puzzleAnalysis: $('#btn-puzzle-analysis'),
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
        setParticles: $('#set-particles'),
        setParticleDensity: $('#set-particle-density'),
        setHints: $('#set-hints'),
        setCapturesOptional: $('#set-captures-optional'),
        setChainCaptures: $('#set-chain-captures'),
        setGoreMode: $('#set-gore-mode'),
        setDecapitationMode: $('#set-decapitation-mode'),

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

    /**
     * Installe tous les gestionnaires d'événements : clics, saisies, touches,
     * touche Échap et changements de connexion.
     * @returns {void} Rien : les écouteurs restent actifs pendant toute la session.
     * Concept JS : une callback est une fonction confiée au navigateur, qui la
     *   rappellera au moment du clic ou de la saisie.
     */
    bindEvents() {
      // Petit outil local : on n'attache un écouteur que si l'élément existe.
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
      on('#btn-save-named', 'click', () => this.saveNamedGame());
      on('#btn-profiles', 'click', () => this.openProfiles());
      on('#btn-create-profile', 'click', () => this.createProfile());
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
      on('#btn-puzzle-analysis', 'click', () => this.analyzePuzzle());
      on('#btn-puzzle-reset', 'click', () => this.resetPuzzle());
      on('#btn-puzzle-next', 'click', () => this.nextPuzzle());
      on('#btn-puzzle-daily', 'click', () => {
        if (global.CheckersPuzzles) {
          this.loadPuzzle(global.CheckersPuzzles.daily(), true);
          this.renderPuzzleOptions();
          this.dom.puzzleSelect.value = global.CheckersPuzzles.daily().id;
        }
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
      on('#btn-promo-disable', 'click', () => {
        global.SettingsManager.set('githubPromo', false);
        this.settings = global.SettingsManager.settings;
        if (this.dom.setGithubPromo) this.dom.setGithubPromo.checked = false;
        this.closeModal('modal-github-promo');
        this.toast('Message GitHub désactivé.', 'success', 2200);
      });
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

    /**
     * Ferme les fenêtres modales lors d'un clic sur un bouton data-close ou à l'extérieur.
     * @returns {void} Rien : un écouteur est placé sur tout le document.
     * Concept JS : on écoute le document entier plutôt que chaque bouton (délégation).
     */
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

    /**
     * Relie chaque champ du panneau de réglages au module SettingsManager.
     * @returns {void} Rien : les réglages sont sauvegardés au fur et à mesure des changements.
     * Concept JS : la petite fonction locale `set` évite de répéter les mêmes mises à jour.
     */
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
      this.dom.setParticles.addEventListener('change', (event) => {
        set('particlesEnabled', event.target.checked);
        if (global.ParticlesBackground) global.ParticlesBackground.sync();
      });
      this.dom.setParticleDensity.addEventListener('change', (event) => {
        set('particleDensity', event.target.value);
        if (global.ParticlesBackground) global.ParticlesBackground.sync();
      });
      if (this.dom.setGithubPromo) {
        this.dom.setGithubPromo.addEventListener('change', (event) => {
          set('githubPromo', event.target.checked);
          this.toast(event.target.checked
            ? 'Message GitHub activé au lancement.'
            : 'Message GitHub désactivé.', 'info', 1800);
        });
      }
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

      // Ambiance uniquement : aucun impact sur les règles ni sur l'IA.
      if (this.dom.setGoreMode) {
        this.dom.setGoreMode.addEventListener('change', (event) => {
          set('goreMode', event.target.checked);
          this.toast(event.target.checked
            ? '🩸 Mode carnage activé : prévenez le coroner.'
            : 'Mode carnage désactivé : on range les balances.', 'info', 2400);
        });
      }
      if (this.dom.setDecapitationMode) {
        this.dom.setDecapitationMode.addEventListener('change', (event) => {
          set('decapitationMode', event.target.checked);
          this.toast(event.target.checked
            ? '👑🪓 Décapitation activée : « Qu’on leur coupe la tête ! »'
            : 'Décapitation désactivée : les dames gardent leur couronne.', 'info', 2400);
        });
      }

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

    /**
     * Marque un seul bouton comme actif dans un groupe de boutons segmentés.
     * @param {string} selector - Sélecteur CSS du groupe de boutons.
     * @param {Element} activeButton - Bouton à mettre en évidence.
     * @returns {void} Rien : les classes CSS des boutons sont ajustées.
     * Concept JS : `classList.toggle` ajoute ou retire une classe CSS selon le booléen.
     */
    setSegmentedActive(selector, activeButton) {
      $$(selector + ' .seg-btn').forEach((btn) => {
        btn.classList.toggle('is-active', btn === activeButton);
      });
    }

    /**
     * Marque le bouton d'orientation du plateau choisi comme actif.
     * @param {Element} activeButton - Bouton à mettre en évidence.
     * @returns {void} Rien : les classes CSS sont ajustées.
     * Concept JS : les boutons sont comparés avec `===` pour trouver le bon.
     */
    setFlipActive(activeButton) {
      $$('#modal-settings [data-flip]').forEach((btn) => {
        btn.classList.toggle('is-active', btn === activeButton);
      });
    }

    /**
     * Marque le bouton de thème clair ou sombre choisi comme actif.
     * @param {Element} activeButton - Bouton à mettre en évidence.
     * @returns {void} Rien : les classes CSS sont ajustées.
     * Concept JS : la même logique que setSegmentedActive, sur un autre groupe.
     */
    setModeActive(activeButton) {
      $$('#modal-settings [data-mode-value]').forEach((btn) => {
        btn.classList.toggle('is-active', btn === activeButton);
      });
    }

    /**
     * Marque l'avatar choisi comme actif dans les réglages.
     * @param {Element} activeButton - Bouton d'avatar à mettre en évidence.
     * @returns {void} Rien : les classes CSS sont ajustées.
     * Concept JS : `forEach` parcourt tous les boutons du groupe.
     */
    setAvatarActive(activeButton) {
      $$('#modal-settings [data-avatar]').forEach((btn) => {
        btn.classList.toggle('is-active', btn === activeButton);
      });
    }

    /**
     * Affiche le nom et l'avatar choisis partout où ils apparaissent.
     * @returns {void} Rien : textes et classes CSS sont remplacés.
     * Concept JS : `|| 'Joueur'` fournit une valeur par défaut si le réglage manque.
     */
    updateProfileUI() {
      const name = (this.settings && this.settings.playerName) || 'Joueur';
      const avatar = (this.settings && this.settings.playerAvatar) || 'user';
      if (this.dom.playerName) this.dom.playerName.textContent = name;
      if (this.dom.homeAvatarIcon) this.dom.homeAvatarIcon.className = 'icon i-' + avatar;
      if (this.gameActive) this.syncPanels();
    }

    /**
     * Affiche une petite modale GitHub au premier lancement de la session.
     * @returns {void} Rien : la modale s'ouvre après un court délai si l'option est active.
     * Concept JS : `setTimeout` exécute une fonction plus tard, sans bloquer le jeu.
     *   `sessionStorage` mémorise le fait que le message a déjà été vu pendant
     *   cette session du navigateur (contrairement à `localStorage`, il est
     *   oublié à la fermeture de l'onglet).
     */
    maybeShowGithubPromo() {
      if (!this.dom.modalGithubPromo) return;
      if (this.settings && this.settings.githubPromo === false) return;
      let alreadyShown = false;
      try {
        alreadyShown = global.sessionStorage.getItem('cl2026:github-promo') === '1';
      } catch (error) {
        alreadyShown = false;
      }
      if (alreadyShown) return;
      global.setTimeout(() => {
        if (this.settings && this.settings.githubPromo === false) return;
        if (!this.dom.modalGithubPromo.classList.contains('hidden')) return;
        this.openModal('modal-github-promo');
        try { global.sessionStorage.setItem('cl2026:github-promo', '1'); } catch (error) { /* ignoré */ }
      }, 900);
    }

    /**
     * Recharge les statistiques puis affiche la grille des succès, débloqués ou non.
     * @returns {void} Rien : la modale des succès est ouverte.
     * Concept JS : `filter` garde seulement les succès dont la propriété `unlocked` est vraie.
     */
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

    /**
     * Met à jour les libellés des boutons de thème et le bouton actif du panneau.
     * @returns {void} Rien : attributs HTML et classes sont modifiés.
     * Concept JS : `setAttribute` change un attribut comme `title` ou `aria-label`.
     */
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

    /**
     * Bascule du thème clair au thème sombre et rafraîchit l'aperçu.
     * @returns {void} Rien : un court message confirme le changement.
     * Concept JS : SettingsManager conserve le choix pour la prochaine ouverture.
     */
    toggleMode() {
      const mode = global.SettingsManager.toggleMode();
      this.settings = global.SettingsManager.settings;
      this.updateThemeUI();
      this.renderSettingsPreview();
      this.toast(mode === 'light' ? 'Mode clair activé.' : 'Mode sombre activé.', 'info', 1600);
    }

    /**
     * Construit une seule fois le mini-plateau visible dans les réglages.
     * @returns {void} Rien : les cases et les pièces d'exemple sont ajoutées au DOM.
     * Concept JS : `map` transforme chaque élément d'un tableau en un autre.
     */
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

    /**
     * Replace les pièces de l'aperçu selon l'orientation choisie du plateau.
     * @returns {void} Rien : les styles CSS de position sont modifiés.
     * Concept JS : `!!` convertit une valeur en booléen vrai ou faux.
     */
    renderSettingsPreview() {
      const flipped = !!(this.settings && this.settings.boardFlipped);
      (this.previewPieces || []).forEach((p) => {
        p.el.style.left = ((flipped ? 9 - p.c : p.c) * 10) + '%';
        p.el.style.top = ((flipped ? 9 - p.r : p.r) * 10) + '%';
      });
    }

    /**
     * Rejoue dans l'aperçu l'animation qui transforme un pion en dame.
     * @returns {void} Rien : l'animation et éventuellement le son sont déclenchés.
     * Concept JS : retirer puis remettre une classe CSS force l'animation à recommencer.
     */
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

    /**
     * N'affiche qu'un écran à la fois : accueil, choix du mode ou partie.
     * @param {string} name - Clé de l'écran : `home`, `mode` ou `game`.
     * @returns {void} Rien : les classes CSS des écrans sont changées.
     * Concept JS : `Object.keys` donne la liste des clés d'un objet.
     */
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

    /**
     * Prépare l'écran de choix du mode avec les réglages en attente.
     * @returns {void} Rien : l'écran `mode` devient visible.
     * Concept JS : `this.pending` est un petit objet qui retient le choix avant le lancement.
     */
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

    /**
     * Lance une nouvelle partie avec les options données et remet tous les états à zéro.
     * @param {Object} options - Peut contenir `mode`, `difficulty`, `playerColor` et `timerMinutes`.
     * @returns {void} Rien : la partie devient active.
     * Concept JS : `options = options || {}` évite une erreur si aucun argument n'est fourni.
     *   `gameToken++` invalide les réponses de l'IA de la partie précédente.
     */
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

    /**
     * Reprend la dernière partie enregistrée automatiquement.
     * @returns {void} Rien : un message d'erreur s'affiche si la sauvegarde est inutilisable.
     * Concept JS : la clé de stockage est lue puis transmise à `loadSavePayload`.
     */
    resumeGame() {
      const key = CFG.STORAGE.KEYS.SAVE;
      const save = global.StorageManager.get(key, null);
      if (!this.loadSavePayload(save, { key: key })) {
        this.toast('Aucune partie valide à reprendre.', 'error');
        this.refreshResumeButton();
      }
    }

    /**
     * Vérifie une sauvegarde puis restaure le plateau, les horloges et l'interface.
     * @param {Object} save - Données lues dans le stockage local.
     * @param {Object} options - Peut contenir `key` (clé à effacer si invalide) et `manual`.
     * @returns {boolean} `true` si le chargement a réussi, `false` sinon.
     * Concept JS : un booléen indique ici le succès de l'opération.
     */
    loadSavePayload(save, options) {
      options = options || {};
      const invalid = () => {
        if (options.key) global.StorageManager.remove(options.key);
        return false;
      };
      if (!this.isValidSave(save)) return invalid();
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

    /**
     * Relance une partie avec exactement la même configuration que la précédente.
     * @returns {void} Rien : `startGame` fait le reste.
     * Concept JS : `Object.assign({}, ...)` copie un objet pour ne pas modifier l'original.
     */
    replay() {
      const config = Object.assign({}, this.currentConfig);
      this.closeModal('modal-gameover');
      this.startGame(config);
    }

    /**
     * Quitte la partie et revient à l'accueil, sans demander de confirmation.
     * @returns {void} Rien : l'écran `home` est affiché.
     * Concept JS : `cancelAI` arrête d'abord les calculs qui pourraient finir trop tard.
     */
    goHome() {
      this.cancelAI();
      this.closeAllModals();
      this.gameActive = false;
      this.paused = false;
      this.clockRunningSince = null;
      this.showScreen('home');
    }

    /**
     * Demande avant de quitter ; sauvegarde la progression si la partie a commencé.
     * @returns {void} Rien : la réponse est traitée plus tard par une callback `.then`.
     * Concept JS : une Promise est un résultat disponible plus tard (ici vrai ou faux).
     */
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

    /**
     * Demande confirmation avant d'abandonner la partie et d'en recommencer une autre.
     * @returns {void} Rien : la décision est traitée dans le `.then`.
     * Concept JS : la modale de confirmation fournit la valeur attendue.
     */
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

    /**
     * Indique si le joueur humain a le droit de cliquer sur le plateau maintenant.
     * @returns {boolean} `true` si l'interaction est autorisée, `false` sinon.
     * Concept JS : plusieurs conditions reliées par `||` signifient « si l'une est vraie ».
     */
    canHumanInteract() {
      if (!this.gameActive || this.paused || this.busy || this.aiThinking || this.engine.status.over) {
        return false;
      }
      if (this.engine.mode === 'ai') return this.engine.currentPlayer === this.engine.playerColor;
      return true;
    }

    /**
     * Traite un clic sur une case : jouer un coup visé ou sélectionner une pièce.
     * @param {number} square - Numéro de la case cliquée (de 0 à 99).
     * @returns {void} Rien : sélection et surlignages sont mis à jour.
     * Concept JS : `filter` garde les coups dont la destination est la case cliquée.
     */
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

    /**
     * Sélectionne une pièce et montre ses coups possibles, ou refuse la sélection.
     * @param {number} square - Numéro de la case de la pièce.
     * @returns {void} Rien : un son, et parfois un message d'erreur, sont émis.
     * Concept JS : `some` vérifie si au moins un coup est une capture.
     */
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

    /**
     * Joue un coup : le valide, anime le déplacement, rafraîchit l'écran puis sauvegarde.
     * @param {Object} move - Coup à jouer : cases de départ/arrivée, captures, promotion.
     * @param {Object} options - Peut contenir `ai` et `stats` quand le coup vient de l'IA.
     * @returns {Promise<void>} Une Promise résolue quand le coup est entièrement traité.
     * Concept JS : `await` met cette fonction en pause jusqu'à la fin de l'animation,
     *   sans bloquer le navigateur. Le `token` sert à ignorer un coup d'une partie finie.
     */
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
      // On lit la pièce AVANT playMove() : le plateau est remplacé juste après.
      // Le renderer sait ainsi que c'est une dame qui effectue la rafle.
      const moverWasKing = !!(Rules && Rules.isKing(this.engine.board[move.from]));

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
          moverIsKing: moverWasKing,
          onCapture: (square, index, total, victimWasKing) =>
            this.onCaptureEffect(square, index, total, victimWasKing, moverWasKing)
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

    /**
     * Déclenche son, vibration et effets visuels au moment d'une capture.
     * @param {number} square - Case où la pièce disparaît.
     * @param {number} index - Numéro de la capture dans une rafle.
     * @param {number} total - Nombre total de captures de la rafle.
     * @param {boolean} [victimWasKing] - true si la victime était une dame.
     * @param {boolean} [moverWasKing] - true si c'est une dame qui capture.
     * @returns {void} Rien : les effets sont lancés.
     * Concept JS : `Math.max` et `Math.min` bornent les valeurs pour éviter les dépassements.
     */
    onCaptureEffect(square, index, total, victimWasKing, moverWasKing) {
      global.AudioManager.play('capture');
      const count = Math.max(1, total || 1);
      const step = Math.max(1, index || 1);
      const level = Math.min(6, count + step - 1);
      const gore = !!this.settings.goreMode;
      const decap = !!victimWasKing && !!this.settings.decapitationMode;
      const royal = !!moverWasKing;

      if (global.navigator && typeof global.navigator.vibrate === 'function') {
        try {
          global.navigator.vibrate(gore
            ? (count > 1 ? [70, 20, 110, 20, 150 + step * 20] : [90, 30, 130])
            : decap ? [110, 40, 110]
              : royal ? [45, 25, 80]
                : (count > 1 ? [35, 25, 60 + step * 15] : 30));
        } catch (e) { /* ignoré */ }
      }
      if (!this.renderer || !this.dom.fxCanvas) return;

      const center = this.renderer.squareCenter(square);
      const boardRect = this.dom.board.getBoundingClientRect();
      const canvasRect = this.dom.fxCanvas.getBoundingClientRect();
      const x = center.x + (boardRect.left - canvasRect.left);
      const y = center.y + (boardRect.top - canvasRect.top);
      const frameRect = this.dom.boardFrame
        ? this.dom.boardFrame.getBoundingClientRect() : boardRect;
      const frameX = center.x + (boardRect.left - frameRect.left);
      const frameY = center.y + (boardRect.top - frameRect.top);

      if (global.Animations && !global.Animations.reducedMotion()) {
        if (gore) {
          // Option carnage : base brutal + geyser, flaques et coulures de sang.
          global.Animations.goreCapture(x, y, level);
          this.shakeBoard(true);
          this.flashScreen(boardRect.left + center.x, boardRect.top + center.y, step, true);
        } else {
          // Éclat rouge « brutal » : cracks, éclaboussures, éclats et flash (rafle = pire).
          global.Animations.brutalCapture(x, y, level);
          this.shakeBoard();
          this.flashScreen(boardRect.left + center.x, boardRect.top + center.y, step);
        }
        // Décapitation : jet de sang supplémentaire, même sans mode carnage.
        if (decap) global.Animations.decapitate(x, y, level);
        // Frappe d'une dame : étincelles dorées, même sans mode carnage.
        if (royal) global.Animations.royalStrike(x, y, level);
      } else {
        global.Animations.burst(x, y, '#f87171', 18);
      }

      // Petit trait d'humour : le pion n'a pas survécu à la rencontre.
      if (decap) this.showDecapitation(frameX, frameY, step);
      this.showCaptureTaunt(frameX, frameY, count, step, gore, decap, royal);
    }

    /**
     * Fait trembler le plateau peu de temps, même pendant une rafle.
     * @param {boolean} [gore] - secousse plus violente en mode carnage.
     * @returns {void} Rien : la classe CSS est ajoutée puis retirée après 360 ou 620 ms.
     * Concept JS : `clearTimeout` annule un timer précédent pour repartir proprement.
     */
    shakeBoard(gore) {
      const frame = this.dom.boardFrame;
      if (!frame) return;
      const cls = gore ? 'impact-gore' : 'impact';
      frame.classList.remove('impact', 'impact-gore');
      void frame.offsetWidth; // force le redémarrage de l'animation CSS
      frame.classList.add(cls);
      global.clearTimeout(this._shakeTimer);
      this._shakeTimer = global.setTimeout(() => frame.classList.remove(cls), gore ? 620 : 360);
    }

    /**
     * Affiche un flash rouge temporaire centré sur la pièce capturée.
     * @param {number} x - Position horizontale en pixels.
     * @param {number} y - Position verticale en pixels.
     * @param {number} step - Numéro de la capture ; au-delà de 1, le flash est plus fort.
     * @param {boolean} [gore] - flash plus rouge et plus long en mode carnage.
     * @returns {void} Rien : l'élément créé est retiré après 520 ou 720 ms.
     * Concept JS : un élément fabriqué par `createElement` est ajouté puis enlevé du DOM.
     */
    flashScreen(x, y, step, gore) {
      if (!global.document.createElement) return;
      const overlay = global.document.createElement('div');
      overlay.className = 'impact-flash' + (step > 1 ? ' is-mega' : '') + (gore ? ' is-gore' : '');
      overlay.style.setProperty('--impact-x', x + 'px');
      overlay.style.setProperty('--impact-y', y + 'px');
      const host = global.document.body || global.document.documentElement;
      host.appendChild(overlay);
      global.setTimeout(() => {
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      }, gore ? 720 : 520);
    }

    /**
     * Affiche un texte humoristique flottant au-dessus de la case capturée.
     * @param {number} x - Position horizontale en pixels.
     * @param {number} y - Position verticale en pixels.
     * @param {number} total - Nombre de captures : change la liste des textes.
     * @param {number} step - Numéro de la capture dans la rafle.
     * @param {boolean} [gore] - texte encore plus macabre en mode carnage.
     * @param {boolean} [decap] - réplique spéciale « reine décapitée ».
     * @param {boolean} [royal] - réplique spéciale « c'est une dame qui attaque ».
     * @returns {void} Rien : le texte disparaît après 900 ms (1250 en carnage).
     * Concept JS : un tableau de chaînes contient tous les textes possibles.
     */
    showCaptureTaunt(x, y, total, step, gore, decap, royal) {
      const frame = this.dom.boardFrame;
      if (!frame || !global.document.createElement) return;
      const single = ['K.O. 💀', 'BOUM 💥', 'RIP 💀', 'ÉCLATÉ !', 'C’EST MORT', '+1 ÂME', 'PAIN !', 'CORONER 📞'];
      const multi = ['K.O. 💀', 'DOUBLE K.O. 💀', 'TRIPLE K.O. 💀', 'QUADRA K.O. 💀', 'MASSACRE 💀', 'BUFFET LIBRE 🍽️'];
      const queenSingle = [
        'OFF WITH HER HEAD! 👑🪓', 'LA REINE A PERDU LA TÊTE 🗡️',
        'DÉCAPITATION ROYALE 👑🩸', 'PLUS DE COURONNE, PLUS DE TÊTE 🪦',
        'SA MAJESTÉ… EN PIÈCES 💀', 'LE BOURREAU TRAVAILLE 🔪',
        'TÊTE COURONNÉE, TÊTE COUPÉE 🪓', 'C’EST PAS TRÈS ROYAL 🩸'
      ];
      const queenMulti = [
        'DOUBLE DÉCAPITATION 🪓', 'TRIPLE ROYALE TRÉPAS 👑🩸',
        'MASSACRE DE LA NOBLESSE 💀', 'QUATRE TÊTES, ZÉRO COURONNE 🪦'
      ];
      const royalSingle = [
        'FRAPPE ROYALE 👑⚔️', 'LA DAME FAIT DES SIENS 🗡️',
        'ELLE A FAIT SON MENU 🍽️👑', 'DAME VOLANTE, COUPES VOLANTES 🪓',
        'SERVICE VIP DE LA MORT 💀', 'COURONNE + LAME = COMBO ⚔️',
        'ELLE NE FERAIT PAS DE CADEAU 🎁', 'REINE : 1, PION : 0 👑'
      ];
      const royalMulti = [
        'DOUBLE FRAPPE ROYALE 👑⚔️', 'TRIPLE COMBO DE DAME 🗡️',
        'QUADRA RASSEMBLEMENT 👑💀', 'LA REINE FAIT LE MENU 🍽️🩸'
      ];
      const goreSingle = [
        'DÉCAPITÉ ! 🩸', 'CERVELLE EN VUE 🧠', 'RIP… ET RIPOSTE 💀',
        'IL EST PARTI EN PIÈCES 🧩', 'ON NOTERA LA DATE 📅',
        'LE CORONER ARRIVE 🚑', 'DERNIÈRE LIGNE DE SON CV 📄',
        'PAIN (AU SANG) 🍞🩸', 'C’ÉTAIT SON DERNIER JOUR 🪦',
        'AUCUN SURVIVANT 🩸'
      ];
      const goreMulti = [
        'DOUBLE MEURTRE 🔪', 'TRIPLE HÉCATOMBE 💀', 'QUADRA CARNAGE 🩸',
        'BUFFET LIBRE 🍽️🩸', 'LA RAFLE A FAIT DES VICTIMES 🪦',
        'EPISODE 4 : LE MASSACRE 🎬', 'Y A PLUS DE MONDE 🩸'
      ];
      const labels = decap
        ? (total > 1 ? queenMulti : queenSingle)
        : royal ? (total > 1 ? royalMulti : royalSingle)
          : gore ? (total > 1 ? goreMulti : goreSingle)
            : (total > 1 ? multi : single);
      const text = labels[Math.min(step - 1, labels.length - 1)];
      const el = global.document.createElement('span');
      el.className = 'capture-taunt' + (total > 1 ? ' is-mega' : '') +
        (gore || decap ? ' is-gore' : royal ? ' is-royal' : '');
      el.textContent = text;
      el.style.left = x + 'px';
      el.style.top = y + 'px';
      frame.appendChild(el);
      global.setTimeout(() => {
        if (el.parentNode) el.parentNode.removeChild(el);
      }, gore ? 1250 : 900);
    }

    /**
     * Fait voler la couronne et la tête de la dame capturée (option décapitation).
     * @param {number} x - Position horizontale dans le cadre du plateau.
     * @param {number} y - Position verticale dans le cadre du plateau.
     * @param {number} step - Numéro de la capture, pour varier la trajectoire.
     * @returns {void} Rien : les deux éléments sont retirés après l'animation.
     * Concept JS : on fixe des variables CSS (--dx, --dy, --rot) que la feuille
     * de style utilise dans sa keyframe, puis on laisse le navigateur animer.
     */
    showDecapitation(x, y, step) {
      const frame = this.dom.boardFrame;
      if (!frame || !global.document.createElement) return;
      if (global.Animations && global.Animations.reducedMotion()) return;

      const dir = (step % 2 === 0) ? 1 : -1;
      const pieces = [
        {
          cls: 'decap-crown',
          dx: dir * (58 + Math.random() * 52),
          dy: -72 - Math.random() * 46,
          rot: dir * (240 + Math.random() * 160),
          delay: 0,
          life: 1150
        },
        {
          cls: 'decap-head',
          dx: -dir * (44 + Math.random() * 46),
          dy: -46 - Math.random() * 34,
          rot: -dir * (280 + Math.random() * 140),
          delay: 70,
          life: 1350
        }
      ];

      for (const part of pieces) {
        const el = global.document.createElement('span');
        el.className = part.cls;
        el.style.left = x + 'px';
        el.style.top = y + 'px';
        el.style.setProperty('--dx', Math.round(part.dx) + 'px');
        el.style.setProperty('--dy', Math.round(part.dy) + 'px');
        el.style.setProperty('--rot', Math.round(part.rot) + 'deg');
        el.style.animationDelay = part.delay + 'ms';
        frame.appendChild(el);
        global.setTimeout(() => {
          if (el.parentNode) el.parentNode.removeChild(el);
        }, part.life + part.delay);
      }
    }

    /**
     * Annule le coup précédent (ou un cycle complet contre l'IA) et remet l'écran à jour.
     * @returns {void} Rien : la sauvegarde est aussi corrigée.
     * Concept JS : `while` boucle tant que la condition est vraie ; `guard` limite les tours.
     *   Contre l'IA, on recule jusqu'au prochain tour du joueur humain.
     */
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

    /**
     * Affiche ou masque la barre du coach selon le réglage choisi.
     * @returns {void} Rien : la barre d'évaluation est remise à zéro si le coach est off.
     * Concept JS : `classList.toggle('hidden', condition)` montre ou cache un élément.
     */
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

    /**
     * Lance une analyse rapide de la position du joueur, sans jouer le coup.
     * Un Worker fait le calcul si possible ; sinon l'IA locale sert de secours.
     * @returns {void} Rien : le résultat est gardé dans `this.coachAnalysis`.
     * Concept JS : un Worker travaille à part ; ses réponses arrivent par la callback
     *   `onmessage`. `requestId` permet d'ignorer une réponse devenue ancienne.
     */
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
      // Ce drapeau empêche de lancer deux analyses du coach en même temps.
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

    /**
     * Remplit la barre d'évaluation avec un score exprimé du point de vue des Blancs.
     * @param {number} score - Score renvoyé par l'analyse pour le joueur qui réfléchit.
     * @param {string} player - Couleur de ce joueur (`WHITE` ou `BLACK`).
     * @returns {void} Rien : largeur, position et couleur de la barre sont modifiées.
     * Concept JS : le score est inversé quand c'était au tour des Noirs.
     */
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

    /**
     * Surligne le meilleur coup de l'analyse, ou lance une analyse si elle manque.
     * @returns {void} Rien : un message ou un surlignage est affiché.
     * Concept JS : `boardKey` est comparé au plateau actuel pour vérifier que le
     *   conseil est encore valable.
     */
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

    /**
     * Déclenche le tour de l'IA : prépare le calcul et envoie la demande au Worker.
     * @returns {void} Rien : `aiThinking` passe à `true` pendant la réflexion.
     * Concept JS : `postMessage` envoie une demande au Worker et `onmessage` en reçoit
     *   la réponse plus tard. Un timer de sécurité (`aiTimeout`) prévoit le secours.
     */
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

      // « settled » évite de traiter deux fois la même réponse de l'IA.
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

    /**
     * Calcule le coup de l'IA dans la page même, quand le Worker n'est pas utilisable.
     * @param {Array} board - Copie du plateau à analyser.
     * @param {string} player - Couleur que l'IA doit jouer.
     * @param {string} difficulty - Difficulté choisie.
     * @param {number} timeMs - Temps de réflexion accordé, en millisecondes.
     * @param {number} token - Jeton de la partie, pour ignorer une réponse tardive.
     * @param {number} startedAt - Date du début de la recherche.
     * @returns {void} Rien : le résultat est transmis à `handleAIResult`.
     * Concept JS : `setTimeout` diffère le calcul de 40 ms pour laisser l'écran se rafraîchir.
     */
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

    /**
     * Met à jour le texte affiché pendant que l'IA réfléchit.
     * @param {Object} progress - Informations : nœuds explorés, temps, profondeur.
     * @returns {void} Rien : le texte de l'overlay de réflexion est remplacé.
     * Concept JS : une suite de `if / else if` choisit un commentaire selon la profondeur.
     */
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

    /**
     * Reçoit le coup calculé, le vérifie et le joue, ou prend un coup légal de secours.
     * @param {Object} data - Résultat : coup, score, profondeur, nœuds, durée.
     * @param {number} token - Jeton de la partie au moment de la demande.
     * @returns {void} Rien : `executeMove` est appelée avec le coup retenu.
     * Concept JS : si la partie est en pause, le résultat est mis dans `pendingAI`
     *   pour être joué au retour.
     */
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

    /**
     * Signale une erreur de l'IA et rend la main au joueur.
     * @param {string} message - Texte de l'erreur à afficher.
     * @returns {void} Rien : les boutons et le statut sont rétablis.
     * Concept JS : on remet l'interface en état avant de montrer le message.
     */
    handleAIError(message) {
      this.aiThinking = false;
      this.dom.thinkingOverlay.classList.add('hidden');
      this.renderer.setInteractive(this.canHumanInteract());
      this.updateStatus();
      this.updateControls();
      this.toast('Erreur IA : ' + message, 'error', 5000);
    }

    /**
     * Annule toute recherche d'IA ou analyse en cours, ainsi que leurs timers.
     * @returns {void} Rien : les jetons sont incrémentés pour invalider les réponses en vol.
     * Concept JS : `terminate()` arrête un Worker ; `clearTimeout` annule un timer.
     */
    cancelAI() {
      // Incrémenter ce jeton rend sans effet toute réponse d'IA déjà en vol.
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

    /**
     * Donne l'heure courante en millisecondes, avec `performance.now` si disponible.
     * @returns {number} Nombre de millisecondes.
     * Concept JS : `typeof` vérifie qu'une méthode existe avant de l'employer.
     */
    now() {
      return global.performance && typeof global.performance.now === 'function'
        ? global.performance.now()
        : Date.now();
    }

    /**
     * Initialise les deux chronomètres ; zéro minute ou moins signifie « sans limite ».
     * @param {number} minutes - Temps accordé à chaque joueur, en minutes.
     * @returns {void} Rien : `this.clocks` est remplacé.
     * Concept JS : `Infinity` représente un temps illimité.
     */
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

    /**
     * Décompte le temps du joueur courant et demande une sauvegarde toutes les 5 secondes.
     * @returns {void} Rien : horloges et affichage sont mis à jour.
     * Concept JS : `setInterval` (voir `init`) appelle cette méthode toutes les 250 ms.
     */
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

    /**
     * Décompte le temps écoulé depuis le dernier battement, puis gèle le chronomètre.
     * @returns {void} Rien : `clockRunningSince` repasse à `null`.
     * Concept JS : `Math.max(0, ...)` garantit qu'on ne descend pas sous zéro.
     */
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

    /**
     * Termine la partie parce que le temps d'un joueur est écoulé.
     * @param {string} player - Couleur du joueur hors temps.
     * @returns {void} Rien : le statut du moteur est modifié puis `finishGame` est appelée.
     * Concept JS : `timeoutHandled` empêche de conclure deux fois la même partie.
     */
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

    /**
     * Met en pause ou reprend la partie, en gelant puis en relançant horloge et IA.
     * @param {boolean} force - État souhaité ; sans argument, inverse l'état actuel.
     * @returns {void} Rien : l'overlay de pause est affiché ou masqué.
     * Concept JS : `typeof force === 'boolean'` distingue un argument fourni d'un absent.
     */
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

    /**
     * Conclut la partie : enregistre le résultat et les points, affiche l'écran final
     * et joue le son correspondant.
     * @returns {void} Rien : la partie devient inactive et la sauvegarde auto est effacée.
     * Concept JS : `gameOverShown` évite d'afficher deux fois la fin de partie.
     */
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

    /**
     * Indique si le plateau doit être affiché à l'envers.
     * @returns {boolean} `true` si le plateau est retourné, `false` sinon.
     * Concept JS : une méthode peut simplement renvoyer un booléen.
     */
    getFlipped() {
      if (this.engine.mode === 'ai' && this.engine.playerColor === BLACK) return true;
      return !!this.settings.boardFlipped;
    }

    /**
     * Donne la couleur des pièces placées en bas de l'écran.
     * @returns {string} `WHITE` ou `BLACK`.
     * Concept JS : cette méthode réutilise `getFlipped()`.
     */
    getBottomColor() {
      return this.getFlipped() ? BLACK : WHITE;
    }

    /**
     * Surligne le dernier coup connu d'après l'historique du moteur.
     * @returns {void} Rien : le surlignage est demandé au renderer.
     * Concept JS : `history[history.length - 1]` prend le dernier élément d'un tableau.
     */
    syncLastMove() {
      if (!this.renderer) return;
      const last = this.engine.history[this.engine.history.length - 1];
      this.renderer.showLastMove(last ? last.move : null);
    }

    /**
     * Rafraîchit en une seule fois tous les éléments de l'écran de jeu.
     * @returns {void} Rien : les méthodes `update...` sont appelées à la chaîne.
     * Concept JS : `setTimeout` retarde l'analyse du coach pour ne pas ralentir l'affichage.
     */
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

    /**
     * Remplit les deux panneaux joueurs : noms, pièces, captures et camp actif.
     * @returns {void} Rien : textes, avatars et classes CSS sont actualisés.
     * Concept JS : les mêmes instructions servent aux deux camps grâce à deux variables.
     */
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

    /**
     * Fabrique le petit texte qui dit à qui c'est au tour de jouer.
     * @param {string} color - Camp auquel le libellé s'adresse.
     * @param {string} current - Camp qui doit jouer.
     * @param {string} mode - `ai` ou `pvp`.
     * @param {string} human - Couleur du joueur humain.
     * @returns {string} Par exemple `À VOUS`, `EN ATTENTE` ou `PAUSE`.
     * Concept JS : une suite de `if` renvoie une seule valeur.
     */
    turnLabel(color, current, mode, human) {
      if (this.engine.status.over) return 'TERMINÉ';
      if (this.paused) return 'PAUSE';
      if (current !== color) return 'EN ATTENTE';
      if (mode === 'ai') return color === human ? 'À VOUS' : 'IA RÉFLÉCHIT';
      return 'À VOUS';
    }

    /**
     * Met à jour la phrase d'état placée au-dessus du plateau.
     * @returns {void} Rien : `gameStatus.textContent` est remplacé.
     * Concept JS : le texte dépend de l'état du jeu (pause, réflexion, fin, tour).
     */
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

    /**
     * Reconstruit la liste des coups joués, deux coups par ligne.
     * @returns {void} Rien : la liste HTML est vidée puis remplie.
     * Concept JS : la boucle avance de deux en deux avec `i += 2`.
     */
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

    /**
     * Affiche les deux chronomètres et met en rouge ceux qui passent sous 30 secondes.
     * @returns {void} Rien : textes et classe `low` sont ajustés.
     * Concept JS : une classe CSS conditionnelle change l'apparence sans toucher au texte.
     */
    updateClockUI() {
      const bottomColor = this.getBottomColor();
      const topColor = Rules.otherPlayer(bottomColor);
      this.dom.playerTimer.textContent = this.formatClock(this.clocks[bottomColor]);
      this.dom.opponentTimer.textContent = this.formatClock(this.clocks[topColor]);
      this.dom.playerTimer.classList.toggle('low', !this.unlimited && this.clocks[bottomColor] <= 30000);
      this.dom.opponentTimer.classList.toggle('low', !this.unlimited && this.clocks[topColor] <= 30000);
    }

    /**
     * Affiche ou cache le panneau de statistiques de l'IA (profondeur, nœuds, durée).
     * @returns {void} Rien : le panneau est rempli ou masqué.
     * Concept JS : la classe `hidden` sert à masquer un élément.
     */
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

    /**
     * Active ou désactive les boutons Annuler, Pause, Recommencer et Quitter.
     * @returns {void} Rien : la propriété `disabled` des boutons est modifiée.
     * Concept JS : `disabled = !canAct` inverse un booléen.
     */
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

    /**
     * Rafraîchit l'accueil : niveau, progression XP, victoires, défaites et nuls.
     * @returns {void} Rien : les champs de l'accueil sont remplis.
     * Concept JS : `Math.max` et `Math.min` bornent le pourcentage entre 0 et 100.
     */
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

    /**
     * Affiche ou cache le bouton « Reprendre » selon la validité de la sauvegarde.
     * @returns {void} Rien : la classe `hidden` est ajustée.
     * Concept JS : `Array.isArray` vérifie qu'une donnée est bien un tableau.
     */
    refreshResumeButton() {
      if (!this.dom || !this.dom.btnResume) return;
      const save = global.StorageManager.get(CFG.STORAGE.KEYS.SAVE, null);
      const valid = !!(save && save.engine && Array.isArray(save.engine.board) &&
        save.engine.board.length === 100 && save.engine.status && !save.engine.status.over);
      this.dom.btnResume.classList.toggle('hidden', !valid);
    }

    /**
     * Construit et ouvre l'historique des parties avec les statistiques globales.
     * @returns {void} Rien : la modale d'historique est ouverte.
     * Concept JS : un objet associe chaque résultat à son libellé et à sa couleur.
     */
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

    /**
     * Ouvre les puzzles : crée le plateau dédié et charge le dernier puzzle ou celui du jour.
     * @returns {void} Rien : la modale des puzzles est ouverte.
     * Concept JS : le renderer est créé une seule fois puis réutilisé.
     */
    openPuzzles() {
      const Puzzles = global.CheckersPuzzles;
      if (!Puzzles) return;
      this.closeModal('modal-achievements');
      this.closeModal('modal-replay');
      if (!this.puzzleRenderer) {
        this.puzzleRenderer = new global.BoardRenderer(this.dom.puzzleBoard, this.dom.puzzlePieces);
        this.puzzleRenderer.onSquareClick = (square) => this.onPuzzleSquareClick(square);
      }
      const savedId = global.StorageManager.get(CFG.STORAGE.KEYS.PUZZLE, null);
      const puzzle = Puzzles.getById(savedId) || Puzzles.daily();
      this.renderPuzzleOptions();
      this.loadPuzzle(puzzle);
      this.openModal('modal-puzzles');
    }

    /**
     * Remplit la liste déroulante des puzzles, avec un symbole pour ceux déjà résolus.
     * @returns {void} Rien : les options HTML sont reconstruites.
     * Concept JS : `for ... of` parcourt tous les éléments d'un tableau.
     */
    renderPuzzleOptions() {
      if (!this.dom.puzzleSelect || !global.CheckersPuzzles) return;
      const solved = (this.stats && this.stats.solvedPuzzles) || [];
      const current = this.dom.puzzleSelect.value;
      this.dom.puzzleSelect.innerHTML = '';
      for (const puzzle of global.CheckersPuzzles.list) {
        const option = global.document.createElement('option');
        option.value = puzzle.id;
        option.textContent = (solved.indexOf(puzzle.id) >= 0 ? '✓ ' : '') +
          puzzle.title + ' · ' + puzzle.level;
        this.dom.puzzleSelect.appendChild(option);
      }
      if (current) this.dom.puzzleSelect.value = current;
    }

    /**
     * Charge un puzzle : construit son plateau, retient son identifiant et remet l'état à zéro.
     * @param {Object} puzzle - Puzzle à charger.
     * @param {boolean} isDaily - Vrai pour le puzzle du jour ; change la description.
     * @returns {void} Rien : `this.puzzleState` est remplacé.
     * Concept JS : un objet `puzzleState` contient tout ce qui change pendant l'exercice.
     */
    loadPuzzle(puzzle, isDaily) {
      if (!puzzle || !this.puzzleRenderer) return;
      this.puzzleState = {
        puzzle: puzzle,
        board: Rules.boardFromPieces(puzzle.spec),
        step: 0,
        selected: null,
        solved: false
      };
      // Le dernier puzzle ouvert est mémorisé pour être retrouvé ensuite.
      global.StorageManager.set(CFG.STORAGE.KEYS.PUZZLE, puzzle.id);
      this.puzzleRenderer.setFlipped(false);
      this.puzzleRenderer.render(this.puzzleState.board);
      this.puzzleRenderer.clearHighlights();
      this.dom.puzzleSelect.value = puzzle.id;
      this.dom.puzzleLevel.textContent = String(puzzle.level).toUpperCase();
      this.dom.puzzleTitle.textContent = puzzle.title;
      this.dom.puzzleDesc.textContent = (isDaily ? 'Coup du jour · ' : '') +
        'Trouvez la séquence qui capture les bonnes pièces.';
      this.dom.puzzleProgress.textContent = '0 / ' + puzzle.solution.length + ' coups';
      this.setPuzzleFeedback('À vous de jouer : choisissez une pièce blanche.');
    }

    /**
     * Écrit un court message de retour sous le plateau de puzzle.
     * @param {string} message - Texte à afficher.
     * @param {string} kind - Type de message, par exemple `error` ou `success`.
     * @returns {void} Rien : le texte et la classe CSS sont modifiés.
     * Concept JS : on concatène des chaînes pour composer le nom de classe.
     */
    setPuzzleFeedback(message, kind) {
      this.dom.puzzleFeedback.className = 'puzzle-feedback' + (kind ? ' ' + kind : '');
      this.dom.puzzleFeedback.textContent = message;
    }

    /**
     * Traite un clic sur le plateau et compare le coup joué à la solution attendue.
     * @param {number} square - Numéro de la case cliquée.
     * @returns {void} Rien : plateau, progression et message sont mis à jour.
     * Concept JS : `find` cherche le premier coup qui correspond à la case visée.
     *   Les captures sont triées avant comparaison pour accepter un autre ordre.
     */
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
      this.renderPuzzleOptions();
      this.dom.puzzleSelect.value = puzzle.id;
    }

    /**
     * Surligne le coup attendu à cette étape et affiche l'indice du puzzle.
     * @returns {void} Rien : un surlignage et un message sont affichés.
     * Concept JS : `filter` garde les coups qui partent de la même case et font les mêmes prises.
     */
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

    /**
     * Analyse le puzzle avec l'IA locale et montre le coup qu'elle recommande.
     * @returns {void} Rien : un message compare ce coup à la solution attendue.
     * Concept JS : ici l'IA tourne directement dans la page, sans Worker.
     */
    analyzePuzzle() {
      const state = this.puzzleState;
      if (!state || state.solved || !global.CheckersAI) return;
      const result = global.CheckersAI.search(state.board, state.puzzle.player, {
        difficulty: 'normal', timeMs: 600, maxDepth: 6, randomness: 0, useTT: true
      });
      if (!result || !result.move) {
        this.setPuzzleFeedback('Aucun coup légal à analyser.', 'error');
        return;
      }
      const move = result.move;
      this.puzzleRenderer.showMoves(move.from, [move], true);
      const expected = state.puzzle.solution[state.step];
      const captures = move.captures.slice().sort((a, b) => a - b).join(',');
      const wanted = (expected.captures || []).slice().sort((a, b) => a - b).join(',');
      const match = move.from === expected.from && captures === wanted &&
        (!expected.to || move.to === expected.to);
      this.setPuzzleFeedback('Analyse IA (prof. ' + result.depth + ') : case ' +
        Rules.squareNumber(move.from) + ' → ' + Rules.squareNumber(move.to) +
        ' · score ' + (result.score > 0 ? '+' : '') + result.score +
        (match ? ' — c’est le coup attendu !' : ' — cherchez une autre prise.'));
    }

    /**
     * Passe au puzzle suivant et recharge la liste déroulante.
     * @returns {void} Rien : le nouveau puzzle est affiché.
     * Concept JS : le module des puzzles fournit l'identifiant suivant.
     */
    nextPuzzle() {
      if (!this.puzzleState || !global.CheckersPuzzles) return;
      const next = global.CheckersPuzzles.next(this.puzzleState.puzzle.id);
      this.renderPuzzleOptions();
      this.loadPuzzle(next);
      this.dom.puzzleSelect.value = next.id;
    }

    /**
     * Recommence le puzzle en cours depuis sa position initiale.
     * @returns {void} Rien : l'état du puzzle est reconstruit.
     * Concept JS : on réutilise l'objet puzzle gardé dans `this.puzzleState`.
     */
    resetPuzzle() {
      if (this.puzzleState) {
        this.loadPuzzle(this.puzzleState.puzzle);
        this.renderPuzzleOptions();
        this.dom.puzzleSelect.value = this.puzzleState.puzzle.id;
      }
    }

    /* ============================================================
     * Replay des parties
     * ============================================================ */

    /**
     * Prépare le replay d'une partie en reconstruisant les plateaux successifs.
     * @param {number} gameIndex - Position de la partie dans l'historique.
     * @returns {void} Rien : la modale de replay s'ouvre si la partie contient des coups.
     * Concept JS : un tableau de plateaux permet d'aller directement à n'importe quel coup.
     */
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

    /**
     * Construit la liste cliquable des coups du replay.
     * @returns {void} Rien : les lignes sont ajoutées à la liste HTML.
     * Concept JS : chaque ligne reçoit une callback pour sauter au coup choisi.
     */
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

    /**
     * Affiche le plateau correspondant à un numéro de coup du replay.
     * @param {number} ply - Numéro du coup ; zéro est la position de départ.
     * @returns {void} Rien : plateau, curseur et libellés sont mis à jour.
     * Concept JS : `Math.min` et `Math.max` gardent la valeur dans les limites du replay.
     */
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

    /**
     * Avance ou recule d'un coup dans le replay et arrête la lecture automatique.
     * @param {number} delta - Nombre de coups à franchir, par exemple -1 ou +1.
     * @returns {void} Rien : le nouveau coup est affiché.
     * Concept JS : `setReplayPly` se charge de borner la valeur calculée.
     */
    stepReplay(delta) {
      if (!this.replayData) return;
      this.stopReplayPlay();
      this.setReplayPly(this.replayData.ply + delta);
    }

    /**
     * Démarre ou arrête la lecture automatique du replay.
     * @returns {void} Rien : un timer est créé ou supprimé.
     * Concept JS : `setInterval` exécute une fonction à intervalles réguliers.
     */
    toggleReplayPlay() {
      if (this.replayTimer) {
        this.stopReplayPlay();
        return;
      }
      if (!this.replayData || !this.replayData.moves.length) return;
      if (this.replayData.ply >= this.replayData.moves.length) this.setReplayPly(0);
      this.dom.btnReplayPlay.innerHTML = '<span class="icon i-pause"></span> PAUSE';
      // Vitesse de Lecture prise dans le curseur de la modale de replay.
      this.replayTimer = global.setInterval(() => {
        if (!this.replayData || this.replayData.ply >= this.replayData.moves.length) {
          this.stopReplayPlay();
          return;
        }
        this.setReplayPly(this.replayData.ply + 1);
      }, Number(this.dom.replaySpeed.value) || 550);
    }

    /**
     * Arrête la lecture automatique et remet le bouton sur « LECTURE ».
     * @returns {void} Rien : le timer est effacé.
     * Concept JS : `clearInterval` annule un timer créé par `setInterval`.
     */
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

    /**
     * Remplit le panneau des réglages avec les valeurs enregistrées, puis l'ouvre.
     * @returns {void} Rien : la modale des réglages est affichée.
     * Concept JS : chaque champ HTML reçoit sa valeur depuis l'objet `settings`.
     */
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
      this.dom.setParticles.checked = this.settings.particlesEnabled !== false;
      this.dom.setParticleDensity.value = this.settings.particleDensity || 'normal';
      this.dom.setHints.checked = !!this.settings.showLegalMoves;
      this.dom.setCoach.checked = !!this.settings.coachMode;
      if (this.dom.setGithubPromo) this.dom.setGithubPromo.checked = this.settings.githubPromo !== false;
      this.dom.setCapturesOptional.checked = !!this.settings.capturesOptional;
      this.dom.setChainCaptures.checked = !!this.settings.chainCaptures;
      if (this.dom.setGoreMode) this.dom.setGoreMode.checked = !!this.settings.goreMode;
      if (this.dom.setDecapitationMode) {
        this.dom.setDecapitationMode.checked = !!this.settings.decapitationMode;
      }
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

    /**
     * Rétablit les réglages par défaut et rafraîchit l'affichage.
     * @returns {void} Rien : un message confirme la remise à zéro.
     * Concept JS : `SettingsManager.reset()` remplace l'objet des réglages.
     */
    resetSettings() {
      global.SettingsManager.reset();
      this.settings = global.SettingsManager.settings;
      global.AudioManager.configure(this.settings);
      this.openSettings();
      this.updateSoundUI();
      this.toast('Paramètres réinitialisés.', 'success');
    }

    /**
     * Prépare puis télécharge un fichier contenant réglages, scores et profils.
     * @returns {void} Rien : un lien temporaire déclenche le téléchargement.
     * Concept JS : `JSON.stringify` transforme un objet en texte et `Blob` crée un fichier en mémoire.
     */
    exportData() {
      if (global.ProfileManager) global.ProfileManager.snapshot();
      const payload = {
        format: 'checkers-legend-2026',
        version: 1,
        exportedAt: new Date().toISOString(),
        settings: Object.assign({}, global.SettingsManager.settings),
        stats: Object.assign({}, global.Statistics.data),
        profiles: global.ProfileManager ? global.ProfileManager.registry : undefined,
        profilesActiveId: global.ProfileManager && global.ProfileManager.registry
          ? global.ProfileManager.registry.activeId
          : undefined
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

    /**
     * Lit un fichier précédemment exporté puis restaure réglages, scores et profils.
     * @param {File} file - Fichier choisi par l'utilisateur.
     * @returns {Promise<void>} Une Promise résolue quand l'import est terminé.
     * Concept JS : `await file.text()` attend la lecture du fichier ; `JSON.parse`
     *   transforme le texte reçu en objet utilisable.
     */
    async importDataFile(file) {
      try {
        const payload = JSON.parse(await file.text());
        if (!payload || payload.format !== 'checkers-legend-2026' ||
            !payload.settings || !payload.stats) {
          throw new Error('Format de fichier invalide.');
        }
        if (global.ProfileManager && Array.isArray(payload.profiles) && payload.profiles.length) {
          const activeId = payload.profiles.some((p) => p && p.id === payload.profilesActiveId)
            ? payload.profilesActiveId
            : payload.profiles[0].id;
          global.StorageManager.set(CFG.STORAGE.KEYS.PROFILES, {
            version: 1, activeId: activeId, profiles: payload.profiles
          });
          global.ProfileManager.registry = null;
          global.ProfileManager.ensure();
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
        if (global.ProfileManager) {
          global.ProfileManager.snapshot();
          this.renderProfiles();
        }
        this.toast('Données importées avec succès.', 'success');
      } catch (error) {
        this.toast('Import impossible : ' + error.message, 'error');
      }
    }

    /* ============================================================
     * Modales et confirmations
     * ============================================================ */

    /**
     * Rend une fenêtre modale visible et retient l'élément qui avait le focus.
     * @param {string} id - Identifiant HTML de la modale.
     * @returns {void} Rien : la classe `hidden` est retirée.
     * Concept JS : `lastFocus` permettra de rendre le focus à l'élément d'origine.
     */
    openModal(id) {
      const modal = global.document.getElementById(id);
      if (!modal) return;
      // On retient l'élément actif pour lui rendre le focus à la fermeture.
      this.lastFocus = global.document.activeElement;
      modal.classList.remove('hidden');
      global.document.body.style.overflow = 'hidden';
      const close = modal.querySelector('.modal-close');
      if (close) global.setTimeout(() => close.focus(), 40);
    }

    /**
     * Masque une modale, restaure le focus et répond « non » à une confirmation en cours.
     * @param {string} id - Identifiant HTML de la modale.
     * @returns {void} Rien : la classe `hidden` est ajoutée.
     * Concept JS : fermer la confirmation sans cliquer revient à répondre faux.
     */
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

    /**
     * Ferme toutes les modales ouvertes ainsi que l'overlay de pause.
     * @returns {void} Rien : l'écran redevient libre.
     * Concept JS : `$$` donne un tableau que l'on parcourt avec `forEach`.
     */
    closeAllModals() {
      $$('.modal-layer:not(.hidden)').forEach((modal) => this.closeModal(modal.id));
      this.dom.pauseOverlay.classList.add('hidden');
    }

    /**
     * Pose une question dans une modale et attend la réponse du joueur.
     * @param {string} message - Question affichée.
     * @param {string} okLabel - Texte du bouton de confirmation.
     * @returns {Promise<boolean>} Une Promise qui vaut vrai ou faux selon la réponse.
     * Concept JS : une Promise représente un résultat disponible plus tard.
     */
    askConfirm(message, okLabel) {
      return new Promise((resolve) => {
        this.confirmResolve = resolve;
        this.dom.confirmMessage.textContent = message;
        this.dom.btnConfirmOk.innerHTML = '<span class="icon i-check"></span> ' + (okLabel || 'CONFIRMER');
        this.openModal('modal-confirm');
      });
    }

    /**
     * Enregistre la réponse à la modale de confirmation, puis la ferme.
     * @param {boolean} value - `true` pour OK, `false` pour annuler.
     * @returns {void} Rien : la Promise créée par `askConfirm` est résolue.
     * Concept JS : résoudre une Promise réveille le code qui l'attendait avec `.then`.
     */
    resolveConfirm(value) {
      const resolve = this.confirmResolve;
      this.confirmResolve = null;
      this.closeModal('modal-confirm');
      if (resolve) resolve(value);
    }

    /* ============================================================
     * Audio, plein écran, notifications
     * ============================================================ */

    /**
     * Active ou coupe les sons et met à jour les boutons correspondants.
     * @returns {void} Rien : un court message est affiché.
     * Concept JS : le réglage est enregistré pour la prochaine ouverture du jeu.
     */
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

    /**
     * Change l'icône et le libellé des boutons de son selon le réglage.
     * @returns {void} Rien : les attributs HTML sont modifiés.
     * Concept JS : `condition ? a : b` choisit une valeur parmi deux.
     */
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

    /**
     * Active ou quitte le mode plein écran.
     * @returns {Promise<void>} Une Promise résolue quand l'opération est terminée.
     * Concept JS : `await` attend une action du navigateur et `try/catch` gère un refus.
     */
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

    /**
     * Annonce successivement les succès nouvellement débloqués.
     * @param {Array} badges - Liste des succès à annoncer.
     * @returns {void} Rien : chaque message est affiché avec un léger délai.
     * Concept JS : `setTimeout` planifie un affichage dans le futur.
     */
    announceBadges(badges) {
      (badges || []).forEach((badge, index) => {
        global.setTimeout(() => {
          this.toast('Succès débloqué : ' + badge.label + ' (+' + badge.xp + ' XP)', 'success', 3600);
          global.AudioManager.play('victory');
        }, 500 + index * 700);
      });
    }

    /**
     * Affiche une petite notification temporaire en haut de l'écran.
     * @param {string} message - Texte du message.
     * @param {string} type - Style : `info`, `success` ou `error`.
     * @param {number} duration - Durée d'affichage en millisecondes.
     * @returns {void} Rien : la notification se retire automatiquement.
     * Concept JS : `duration || 2800` fournit une durée par défaut.
     */
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

    /**
     * Sauvegarde la partie et le profil quand la page se ferme ou devient invisible.
     * @returns {void} Rien : des écouteurs d'événements sont installés.
     * Concept JS : l'événement `visibilitychange` prévient que l'onglet est masqué.
     */
    bindPersistence() {
      const sync = () => {
        this.saveGame();
        if (global.ProfileManager) global.ProfileManager.snapshot();
      };
      // Sauvegarde de sécurité avant que la page ne soit quittée ou masquée.
      global.addEventListener('pagehide', sync);
      global.addEventListener('beforeunload', sync);
      global.document.addEventListener('visibilitychange', () => {
        if (global.document.hidden) {
          if (this.gameActive && !this.paused) this.togglePause(true);
          sync();
        }
      });
    }

    /**
     * Vérifie qu'une sauvegarde contient bien un plateau de cent cases.
     * @param {Object} save - Données à contrôler.
     * @returns {boolean} `true` si la sauvegarde est utilisable, `false` sinon.
     * Concept JS : `!!` force le résultat à être un booléen.
     */
    isValidSave(save) {
      return !!(save && save.engine && Array.isArray(save.engine.board) &&
        save.engine.board.length === 100);
    }

    /**
     * Prépare l'objet complet à enregistrer : moteur, horloges, configuration et date.
     * @returns {Object} L'objet de sauvegarde prêt à être stocké.
     * Concept JS : `Date.now()` donne l'heure actuelle en millisecondes.
     */
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

    /**
     * Enregistre la partie en cours si elle a réellement commencé.
     * @returns {void} Rien : la clé de sauvegarde automatique est écrite.
     * Concept JS : le stockage local garde la donnée même après fermeture de la page.
     */
    saveGame() {
      if (!this.gameActive || this.engine.status.over || this.engine.history.length === 0) return;
      global.StorageManager.set(CFG.STORAGE.KEYS.SAVE, this.buildSavePayload());
    }

    /**
     * Copie la notation des coups de la partie dans le presse-papiers.
     * @returns {void} Rien : un message confirme la copie ou signale un échec.
     * Concept JS : `.then(done).catch(fallback)` traite le succès ou l'échec d'une Promise.
     */
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

    /* ---------- Sauvegardes manuelles et parties nommées ---------- */

    /**
     * Fabrique la clé de stockage d'un emplacement manuel.
     * @param {number} slot - Numéro de l'emplacement, de 1 à 3.
     * @returns {string} Clé utilisée dans le stockage local.
     * Concept JS : on construit la clé en concaténant deux chaînes.
     */
    saveSlotKey(slot) {
      return CFG.STORAGE.KEYS.SAVE + ':slot' + slot;
    }

    /**
     * Affiche la fenêtre des sauvegardes manuelles et des parties nommées.
     * @returns {void} Rien : les deux listes sont reconstruites puis la modale s'ouvre.
     * Concept JS : une méthode appelle deux autres méthodes pour préparer l'affichage.
     */
    openSaves() {
      this.renderSaveSlots();
      this.renderNamedSaves();
      this.openModal('modal-saves');
    }

    /**
     * Fabrique un bouton de sauvegarde avec son icône, son texte et son action.
     * @param {string} label - Texte du bouton.
     * @param {string} icon - Classe de l'icône.
     * @param {Function} handler - Callback appelée lors du clic.
     * @param {boolean} disabled - Vrai pour désactiver le bouton.
     * @returns {Element} Le bouton créé.
     * Concept JS : une fonction peut être passée en argument puis attachée à un événement.
     */
    makeSaveButton(label, icon, handler, disabled) {
      const btn = global.document.createElement('button');
      btn.type = 'button';
      btn.className = 'ctrl-btn';
      btn.disabled = !!disabled;
      btn.innerHTML = '<span class="icon ' + icon + '"></span><span>' + label + '</span>';
      btn.addEventListener('click', handler);
      return btn;
    }

    /**
     * Fabrique le petit texte qui résume une sauvegarde : mode, coups et date.
     * @param {Object} save - Sauvegarde à résumer.
     * @returns {string} Résumé lisible, ou `Vide` si la sauvegarde est invalide.
     * Concept JS : `new Date(timestamp).toLocaleString()` rend la date compréhensible.
     */
    saveMeta(save) {
      if (!this.isValidSave(save)) return 'Vide';
      const modeText = save.config && save.config.mode === 'pvp' ? '2 joueurs' : 'VS IA';
      const when = save.savedAt ? new Date(save.savedAt).toLocaleString() : '—';
      const moves = save.engine.history ? save.engine.history.length : 0;
      return modeText + ' · ' + moves + ' coups · ' + when;
    }

    /**
     * Affiche les trois emplacements manuels avec Charger, Écraser et Supprimer.
     * @returns {void} Rien : la liste HTML est reconstruite.
     * Concept JS : les callbacks `async` attendent la confirmation avant d'agir.
     */
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
        meta.textContent = this.saveMeta(save);
        info.appendChild(title);
        info.appendChild(meta);

        const actions = global.document.createElement('div');
        actions.className = 'save-slot-actions';
        const hasSave = this.isValidSave(save);
        actions.appendChild(this.makeSaveButton('Charger', 'i-play', () => this.loadFromSlot(slot), !hasSave));
        actions.appendChild(this.makeSaveButton('Écraser', 'i-download', async () => {
          if (await this.askConfirm('Écraser l’emplacement ' + slot + ' ?', 'ÉCRASER')) {
            this.saveToSlot(slot);
          }
        }));
        actions.appendChild(this.makeSaveButton('Supprimer', 'i-close', async () => {
          if (await this.askConfirm('Supprimer l’emplacement ' + slot + ' ?', 'SUPPRIMER')) {
            this.deleteSlot(slot);
          }
        }, !hasSave));

        li.appendChild(info);
        li.appendChild(actions);
        this.dom.savesList.appendChild(li);
      }
    }

    /**
     * Affiche les parties nommées enregistrées dans le profil actif.
     * @returns {void} Rien : la liste HTML est reconstruite.
     * Concept JS : `for ... of` parcourt la liste fournie par le gestionnaire de profils.
     */
    renderNamedSaves() {
      if (!this.dom.namedSavesList || !global.ProfileManager) return;
      this.dom.namedSavesList.innerHTML = '';
      for (const entry of global.ProfileManager.listNamed()) {
        const li = global.document.createElement('li');
        li.className = 'save-slot';
        const info = global.document.createElement('div');
        info.className = 'save-slot-info';
        const title = global.document.createElement('span');
        title.className = 'save-slot-title';
        title.textContent = entry.name;
        const meta = global.document.createElement('span');
        meta.className = 'save-slot-meta';
        meta.textContent = this.saveMeta(entry.payload);
        info.appendChild(title);
        info.appendChild(meta);

        const actions = global.document.createElement('div');
        actions.className = 'save-slot-actions';
        const hasSave = this.isValidSave(entry.payload);
        actions.appendChild(this.makeSaveButton('Charger', 'i-play', () => this.loadNamedGame(entry.id), !hasSave));
        actions.appendChild(this.makeSaveButton('Supprimer', 'i-close', async () => {
          if (await this.askConfirm('Supprimer la partie « ' + entry.name + ' » ?', 'SUPPRIMER')) {
            global.ProfileManager.removeNamed(entry.id);
            this.renderNamedSaves();
          }
        }));
        li.appendChild(info);
        li.appendChild(actions);
        this.dom.namedSavesList.appendChild(li);
      }
    }

    /**
     * Enregistre la partie en cours sous le nom saisi par le joueur.
     * @returns {void} Rien : un message confirme l'enregistrement.
     * Concept JS : `.trim()` retire les espaces placés avant et après le texte saisi.
     */
    saveNamedGame() {
      if (!global.ProfileManager) return;
      if (!this.gameActive || this.engine.status.over || this.engine.history.length === 0) {
        this.toast('Aucune partie en cours à enregistrer.', 'error');
        return;
      }
      const name = (this.dom.namedSaveName && this.dom.namedSaveName.value || '').trim();
      const entry = global.ProfileManager.saveNamed(name, this.buildSavePayload());
      if (this.dom.namedSaveName) this.dom.namedSaveName.value = '';
      this.toast('Partie « ' + entry.name + ' » enregistrée.', 'success');
      this.renderNamedSaves();
    }

    /**
     * Charge une partie nommée à partir de son identifiant.
     * @param {string} id - Identifiant de la partie à charger.
     * @returns {void} Rien : un message signale une partie vide ou invalide.
     * Concept JS : `loadSavePayload` sert pour tous les types de sauvegarde.
     */
    loadNamedGame(id) {
      const entry = global.ProfileManager && global.ProfileManager.getNamed(id);
      if (!entry || !this.loadSavePayload(entry.payload, { manual: true })) {
        this.toast('Partie nommée vide ou invalide.', 'error');
      }
    }

    /**
     * Écrit la partie en cours dans un emplacement manuel.
     * @param {number} slot - Numéro de l'emplacement.
     * @returns {void} Rien : la liste est rafraîchie si la fenêtre est ouverte.
     * Concept JS : la clé est construite par `saveSlotKey`.
     */
    saveToSlot(slot) {
      if (!this.gameActive || this.engine.status.over || this.engine.history.length === 0) {
        this.toast('Aucune partie en cours à enregistrer.', 'error');
        return;
      }
      global.StorageManager.set(this.saveSlotKey(slot), this.buildSavePayload());
      this.toast('Partie enregistrée dans l’emplacement ' + slot + '.', 'success');
      if (this.dom.modalSaves && !this.dom.modalSaves.classList.contains('hidden')) this.renderSaveSlots();
    }

    /**
     * Supprime le contenu d'un emplacement de sauvegarde manuelle.
     * @param {number} slot - Numéro de l'emplacement.
     * @returns {void} Rien : la liste est rafraîchie.
     * Concept JS : `StorageManager.remove` efface la donnée stockée.
     */
    deleteSlot(slot) {
      global.StorageManager.remove(this.saveSlotKey(slot));
      this.toast('Emplacement ' + slot + ' supprimé.', 'info');
      this.renderSaveSlots();
    }

    /**
     * Charge la sauvegarde présente dans un emplacement manuel.
     * @param {number} slot - Numéro de l'emplacement.
     * @returns {void} Rien : un message signale un emplacement vide ou invalide.
     * Concept JS : la clé et son contenu sont transmis ensemble à `loadSavePayload`.
     */
    loadFromSlot(slot) {
      const key = this.saveSlotKey(slot);
      const save = global.StorageManager.get(key, null);
      if (!this.loadSavePayload(save, { key: key, manual: true })) {
        this.toast('Emplacement ' + slot + ' vide ou invalide.', 'error');
      }
    }

    /* ---------- Profils de joueurs ---------- */

    /**
     * Ouvre la fenêtre de gestion des profils joueurs.
     * @returns {void} Rien : la liste est reconstruite avant l'ouverture.
     * Concept JS : chaque profil possède un identifiant unique.
     */
    openProfiles() {
      if (!global.ProfileManager) return;
      this.renderProfiles();
      this.openModal('modal-profiles');
    }

    /**
     * Affiche les profils avec leur niveau, leurs victoires et leurs boutons d'action.
     * @returns {void} Rien : la liste HTML est reconstruite.
     * Concept JS : la classe `is-active` distingue le profil courant.
     */
    renderProfiles() {
      if (!this.dom.profilesList || !global.ProfileManager) return;
      this.dom.profilesList.innerHTML = '';
      for (const profile of global.ProfileManager.list()) {
        const li = global.document.createElement('li');
        li.className = 'profile-item' + (profile.active ? ' is-active' : '');

        const avatar = global.document.createElement('span');
        avatar.className = 'profile-avatar';
        avatar.innerHTML = '<span class="icon i-' + (profile.avatar || 'user') + '"></span>';

        const info = global.document.createElement('div');
        info.className = 'profile-info';
        const name = global.document.createElement('span');
        name.className = 'profile-name';
        name.textContent = profile.name + (profile.active ? ' · ACTIF' : '');
        const meta = global.document.createElement('span');
        meta.className = 'profile-meta';
        meta.textContent = 'Niv. ' + (Math.floor(profile.xp / CFG.XP.LEVEL_STEP) + 1) +
          ' · ' + profile.wins + ' victoires · ' + profile.games + ' parties';
        info.appendChild(name);
        info.appendChild(meta);

        const actions = global.document.createElement('div');
        actions.className = 'profile-actions';
        if (!profile.active) {
          actions.appendChild(this.makeSaveButton('Activer', 'i-play', async () => {
            if (await this.askConfirm('Activer le profil « ' + profile.name + ' » ?', 'ACTIVER')) {
              this.selectProfile(profile.id);
            }
          }));
        }
        actions.appendChild(this.makeSaveButton('Renommer', 'i-check', () => this.renameProfile(profile.id)));
        actions.appendChild(this.makeSaveButton('Supprimer', 'i-close', async () => {
          if (await this.askConfirm('Supprimer le profil « ' + profile.name + ' » ?', 'SUPPRIMER')) {
            this.deleteProfile(profile.id);
          }
        }, global.ProfileManager.list().length <= 1));

        li.appendChild(avatar);
        li.appendChild(info);
        li.appendChild(actions);
        this.dom.profilesList.appendChild(li);
      }
    }

    /**
     * Recharge réglages et scores après l'activation d'un autre profil.
     * @param {Object} profile - Profil devenu actif, utilisé pour le message.
     * @param {string} message - Message à afficher, ou absent pour le texte par défaut.
     * @returns {void} Rien : l'application revient à l'accueil.
     * Concept JS : `message || '...'` fournit une valeur de remplacement.
     */
    applyActiveProfile(profile, message) {
      this.cancelAI();
      this.closeAllModals();
      this.gameActive = false;
      this.gameOverShown = false;
      this.busy = false;
      this.selected = null;
      this.paused = false;
      this.pendingAI = false;
      this.settings = global.SettingsManager.load();
      this.stats = global.Statistics.load();
      global.AudioManager.configure(this.settings);
      this.updateThemeUI();
      this.updateSoundUI();
      this.updateProfileUI();
      this.updateCoachUI();
      this.updateHome();
      this.renderSettingsPreview();
      this.refreshResumeButton();
      this.showScreen('home');
      this.toast(message || ('Profil « ' + profile.name + ' » activé.'), 'success');
    }

    /**
     * Crée un nouveau profil avec le nom saisi, puis l'active.
     * @returns {void} Rien : un message confirme la création ou demande un nom.
     * Concept JS : la méthode s'arrête immédiatement si le texte est vide.
     */
    createProfile() {
      if (!global.ProfileManager) return;
      const name = (this.dom.newProfileName && this.dom.newProfileName.value || '').trim();
      if (!name) {
        this.toast('Saisissez un nom pour le nouveau profil.', 'error');
        return;
      }
      const profile = global.ProfileManager.create(name);
      if (this.dom.newProfileName) this.dom.newProfileName.value = '';
      this.applyActiveProfile(profile, 'Profil « ' + profile.name + ' » créé.');
    }

    /**
     * Renomme un profil et actualise son affichage s'il est actif.
     * @param {string} id - Identifiant du profil à renommer.
     * @returns {void} Rien : un message confirme l'opération.
     * Concept JS : `active().id` indique si le profil concerné est le profil courant.
     */
    renameProfile(id) {
      if (!global.ProfileManager) return;
      const name = (this.dom.newProfileName && this.dom.newProfileName.value || '').trim();
      if (!name) {
        this.toast('Saisissez le nouveau nom dans le champ prévu.', 'error');
        return;
      }
      const wasActive = id === global.ProfileManager.active().id;
      if (!global.ProfileManager.rename(id, name)) return;
      if (wasActive) {
        this.settings = global.SettingsManager.load();
        this.updateProfileUI();
      }
      this.renderProfiles();
      this.toast('Profil renommé en « ' + name + ' ».', 'success');
    }

    /**
     * Active un profil existant puis recharge l'interface.
     * @param {string} id - Identifiant du profil.
     * @returns {void} Rien : `applyActiveProfile` termine le travail.
     * Concept JS : le gestionnaire de profils s'occupe de la persistance.
     */
    selectProfile(id) {
      if (!global.ProfileManager) return;
      const profile = global.ProfileManager.select(id);
      if (!profile) return;
      this.applyActiveProfile(profile);
    }

    /**
     * Supprime un profil, sauf s'il ne reste que celui-là.
     * @param {string} id - Identifiant du profil à supprimer.
     * @returns {void} Rien : un message d'erreur s'affiche si la suppression est refusée.
     * Concept JS : on compare la longueur du tableau des profils à un.
     */
    deleteProfile(id) {
      if (!global.ProfileManager) return;
      const wasActive = id === global.ProfileManager.active().id;
      if (!global.ProfileManager.remove(id)) {
        this.toast('Impossible de supprimer le dernier profil.', 'error');
        return;
      }
      if (wasActive) this.applyActiveProfile(global.ProfileManager.active(), 'Profil supprimé.');
      else this.renderProfiles();
    }

    /* ============================================================
     * Service Worker / PWA
     * ============================================================ */

    /**
     * Active le Service Worker pour le mode hors ligne et détecte les mises à jour.
     * @returns {void} Rien : des messages informent l'utilisateur selon le cas.
     * Concept JS : `.then` traite le succès d'une Promise et `.catch` son échec.
     */
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

    /**
     * Transforme un temps en millisecondes en texte lisible `mm:ss`.
     * @param {number} ms - Millisecondes restantes.
     * @returns {string} Par exemple `01:35`, ou le symbole infini si le temps est illimité.
     * Concept JS : `padStart` ajoute un zéro devant les nombres d'un seul chiffre.
     */
    formatClock(ms) {
      if (!Number.isFinite(ms)) return '∞';
      const total = Math.max(0, Math.ceil(ms / 1000));
      const minutes = Math.floor(total / 60);
      const seconds = total % 60;
      return String(minutes).padStart(2, '0') + ':' + String(seconds).padStart(2, '0');
    }

    /**
     * Transforme une durée en secondes en texte `minutes:secondes`.
     * @param {number} seconds - Durée en secondes.
     * @returns {string} Par exemple `3:07`.
     * Concept JS : le reste d'une division (`%`) donne les secondes.
     */
    formatDuration(seconds) {
      const total = Math.max(0, Math.floor(seconds || 0));
      const minutes = Math.floor(total / 60);
      const rest = total % 60;
      return minutes + ':' + String(rest).padStart(2, '0');
    }

    /**
     * Formate un nombre avec les séparateurs de milliers français.
     * @param {number} value - Nombre à rendre lisible.
     * @returns {string} Nombre formaté, ou simple chaîne si le formatage échoue.
     * Concept JS : `try/catch` évite de faire planter l'application.
     */
    formatNumber(value) {
      try {
        return Number(value || 0).toLocaleString('fr-FR');
      } catch (e) {
        return String(value || 0);
      }
    }

    /**
     * Transforme un horodatage en date courte suivie de l'heure.
     * @param {number} timestamp - Horodatage en millisecondes.
     * @returns {string} Date lisible, ou un tiret si elle manque.
     * Concept JS : `new Date(...)` transforme un nombre en objet date.
     */
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

  /**
   * Fabrique l'application, la rend accessible puis lance son initialisation.
   * @returns {void} Rien : l'application est prête à fonctionner.
   * Concept JS : `new CheckersApp()` crée un objet à partir de la classe.
   */
  function boot() {
    const app = new CheckersApp();
    global.checkersApp = app;
    app.init();
  }

  // Si la page charge encore, on attend ; sinon on démarre tout de suite.
  if (global.document.readyState === 'loading') {
    global.document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})(typeof window !== 'undefined' ? window : globalThis);
