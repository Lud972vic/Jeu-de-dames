/**
 * CHECKERS LEGEND 2026 — Test de fumée navigateur (Edge/Chrome headless)
 * ----------------------------------------------------------------------
 * Lance un serveur local, ouvre le jeu dans un navigateur headless via le
 * protocole CDP, exécute un parcours réel (accueil, partie IA, sauvegarde,
 * reprise, pause, annulation, 2 joueurs, PWA hors ligne) et vérifie qu'aucune
 * exception JavaScript ne survient.
 *
 * Usage : node scripts/browser-smoke-test.js
 * Prérequis : Microsoft Edge ou Google Chrome installé.
 */
'use strict';

const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.TEST_PORT || 8124);
const BASE = 'http://127.0.0.1:' + PORT + '/';
const TEMP = path.join(os.tmpdir(), 'cl2026-browser-' + process.pid);
const SCREENSHOT_DIR = path.join(ROOT, 'docs', 'screenshots');

const EDGE_CANDIDATES = [
  process.env.EDGE_PATH,
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'
].filter(Boolean);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(fn, timeout, label) {
  const started = Date.now();
  let lastError = null;
  while (Date.now() - started < timeout) {
    try {
      const value = await fn();
      if (value) return value;
    } catch (error) {
      lastError = error;
    }
    await sleep(100);
  }
  throw new Error('Délai dépassé : ' + label + (lastError ? ' (' + lastError.message + ')' : ''));
}

class CDP {
  constructor(url) {
    this.url = url;
    this.socket = null;
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Map();
  }

  connect() {
    return new Promise((resolve, reject) => {
      this.socket = new WebSocket(this.url);
      const timer = setTimeout(() => reject(new Error('Connexion CDP impossible')), 10000);
      this.socket.addEventListener('open', () => {
        clearTimeout(timer);
        resolve();
      });
      this.socket.addEventListener('error', (event) => {
        clearTimeout(timer);
        reject(new Error('Erreur WebSocket CDP : ' + event.message));
      });
      this.socket.addEventListener('message', (event) => {
        let message;
        try { message = JSON.parse(event.data); } catch (error) { return; }
        if (message.id) {
          const pending = this.pending.get(message.id);
          if (!pending) return;
          this.pending.delete(message.id);
          if (message.error) pending.reject(new Error(message.error.message));
          else pending.resolve(message.result);
          return;
        }
        const handlers = this.listeners.get(message.method) || [];
        handlers.forEach((handler) => {
          try { handler(message.params); } catch (error) { console.error(error); }
        });
      });
    });
  }

  send(method, params) {
    return new Promise((resolve, reject) => {
      const id = this.nextId++;
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params: params || {} }));
    });
  }

  on(method, handler) {
    if (!this.listeners.has(method)) this.listeners.set(method, []);
    this.listeners.get(method).push(handler);
  }

  close() {
    if (this.socket) this.socket.close();
  }
}

function findBrowser() {
  for (const candidate of EDGE_CANDIDATES) {
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new Error('Aucun navigateur Edge/Chrome trouvé.');
}

async function main() {
  fs.mkdirSync(TEMP, { recursive: true });
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

  const server = spawn(process.execPath, [path.join(ROOT, 'scripts', 'serve.js'), String(PORT)], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let serverLog = '';
  server.stdout.on('data', (chunk) => { serverLog += chunk.toString(); });
  server.stderr.on('data', (chunk) => { serverLog += chunk.toString(); });

  let browser = null;
  let cdp = null;
  const exceptions = [];
  const consoleErrors = [];

  try {
    await waitFor(async () => {
      const response = await fetch(BASE + 'index.html');
      return response.ok;
    }, 10000, 'démarrage du serveur local');

    const browserPath = findBrowser();
    browser = spawn(browserPath, [
      '--headless=new',
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-background-networking',
      '--disable-component-update',
      '--disable-sync',
      '--disable-features=Translate,MediaRouter',
      '--remote-debugging-port=0',
      '--user-data-dir=' + TEMP,
      'about:blank'
    ], { stdio: 'ignore' });

    const portFile = path.join(TEMP, 'DevToolsActivePort');
    const debugPort = await waitFor(() => {
      if (!fs.existsSync(portFile)) return null;
      const lines = fs.readFileSync(portFile, 'utf8').split(/\r?\n/);
      return Number(lines[0]) || null;
    }, 15000, 'ouverture du port CDP');

    const targets = await waitFor(async () => {
      const response = await fetch('http://127.0.0.1:' + debugPort + '/json/list');
      if (!response.ok) return null;
      const list = await response.json();
      return list.find((target) => target.type === 'page') || null;
    }, 15000, 'liste des cibles CDP');

    cdp = new CDP(targets.webSocketDebuggerUrl);
    await cdp.connect();
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Log.enable');
    await cdp.send('Network.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 1440,
      height: 1000,
      deviceScaleFactor: 1,
      mobile: false
    });

    cdp.on('Runtime.exceptionThrown', (params) => {
      exceptions.push(params.exceptionDetails);
    });
    cdp.on('Log.entryAdded', (params) => {
      if (params.entry && params.entry.level === 'error') {
        consoleErrors.push(params.entry.text);
      }
    });

    const evaluate = async (expression, awaitPromise) => {
      const result = await cdp.send('Runtime.evaluate', {
        expression: expression,
        returnByValue: true,
        awaitPromise: !!awaitPromise,
        userGesture: true
      });
      if (result.exceptionDetails) {
        throw new Error('Exception dans le navigateur : ' +
          (result.exceptionDetails.exception && result.exceptionDetails.exception.description ||
            result.exceptionDetails.text));
      }
      return result.result.value;
    };

    const load = async (url) => {
      const loaded = new Promise((resolve) => {
        const handler = () => {
          cdp.listeners.get('Page.loadEventFired').splice(
            cdp.listeners.get('Page.loadEventFired').indexOf(handler), 1
          );
          resolve();
        };
        cdp.on('Page.loadEventFired', handler);
      });
      await cdp.send('Page.navigate', { url: url || BASE });
      await Promise.race([loaded, sleep(12000)]);
      await waitFor(() => evaluate('!!window.checkersApp'), 12000, 'initialisation de l’application');
      await sleep(400);
    };

    const screenshot = async (name) => {
      const result = await cdp.send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.join(SCREENSHOT_DIR, name), Buffer.from(result.data, 'base64'));
    };

    console.log('1. Chargement de l’accueil');
    await load();
    assert.equal(await evaluate('document.title'), 'CHECKERS LEGEND 2026 — Dames internationales');
    assert.equal(await evaluate('document.querySelectorAll(".screen").length'), 3);
    assert.equal(await evaluate('document.querySelector("#screen-home").classList.contains("is-active")'), true);
    assert.equal(await evaluate('document.querySelectorAll("#difficulty-grid .difficulty-card").length'), 4);
    await screenshot('01-accueil-desktop.png');

    console.log('2. Sons et paramètres complets');
    await evaluate('document.querySelector("#btn-sound-home").click()');
    assert.equal(await evaluate('window.SettingsManager.settings.soundsEnabled'), false);
    await evaluate('document.querySelector("#btn-sound-home").click()');
    assert.equal(await evaluate('window.SettingsManager.settings.soundsEnabled'), true);
    await waitFor(() => evaluate('Object.keys(window.AudioManager.buffers).length >= 5'), 7000, 'préchargement des sons locaux');

    await evaluate('document.querySelector("#btn-settings").click()');
    await waitFor(() => evaluate('!document.querySelector("#modal-settings").classList.contains("hidden")'), 3000, 'ouverture paramètres');
    const changed = await evaluate(`
      (() => {
        const change = (selector, value) => {
          const el = document.querySelector(selector);
          if (!el) throw new Error('champ absent : ' + selector);
          el.value = value;
          el.dispatchEvent(new Event('change', { bubbles: true }));
        };
        const input = (selector, value) => {
          const el = document.querySelector(selector);
          if (!el) throw new Error('champ absent : ' + selector);
          el.value = value;
          el.dispatchEvent(new Event('input', { bubbles: true }));
        };
        const toggle = (selector, checked) => {
          const el = document.querySelector(selector);
          el.checked = checked;
          el.dispatchEvent(new Event('change', { bubbles: true }));
        };
        change('#set-theme', 'midnight');
        change('#set-pieces', 'emerald');
        change('#set-difficulty', 'expert');
        change('#set-timer', '5');
        change('#set-anim-speed', '1.5');
        change('#set-ai-time', '2000');
        input('#set-volume', '35');
        toggle('#set-sounds', false);
        toggle('#set-animations', false);
        toggle('#set-particles', false);
        change('#set-particle-density', 'high');
        toggle('#set-hints', false);
        toggle('#set-captures-optional', true);
        toggle('#set-chain-captures', true);
        document.querySelector('#modal-settings [data-flip="true"]').click();
        return {
          theme: document.body.dataset.theme,
          pieces: document.body.dataset.pieces,
          volumeLabel: document.querySelector('#volume-value').textContent,
          noAnimations: document.body.classList.contains('no-animations'),
          settings: Object.assign({}, window.SettingsManager.settings)
        };
      })()
    `);
    assert.equal(changed.theme, 'midnight');
    assert.equal(changed.pieces, 'emerald');
    assert.equal(changed.volumeLabel.trim(), '35 %');
    assert.equal(changed.noAnimations, true);
    assert.equal(changed.settings.theme, 'midnight');
    assert.equal(changed.settings.pieceStyle, 'emerald');
    assert.equal(changed.settings.difficulty, 'expert');
    assert.equal(changed.settings.timerMinutes, 5);
    assert.equal(changed.settings.animationSpeed, 1.5);
    assert.equal(changed.settings.aiThinkMs, 2000);
    assert.equal(changed.settings.volume, 0.35);
    assert.equal(changed.settings.soundsEnabled, false);
    assert.equal(changed.settings.animationsEnabled, false);
    assert.equal(changed.settings.particlesEnabled, false);
    assert.equal(changed.settings.particleDensity, 'high');
    assert.equal(await evaluate('document.querySelector("#bg-particles").style.visibility'), 'hidden');
    assert.equal(changed.settings.showLegalMoves, false);
    assert.equal(changed.settings.boardFlipped, true);
    assert.equal(changed.settings.capturesOptional, true);
    assert.equal(changed.settings.chainCaptures, true);

    await evaluate('document.querySelector("#btn-reset-settings").click()');
    const reset = await evaluate(`
      (() => ({
        theme: document.body.dataset.theme,
        pieces: document.body.dataset.pieces,
        noAnimations: document.body.classList.contains('no-animations'),
        soundIcon: document.querySelector('#btn-sound-home .icon').className,
        settings: Object.assign({}, window.SettingsManager.settings)
      }))()
    `);
    assert.equal(reset.theme, 'neon');
    assert.equal(reset.pieces, 'neon');
    assert.equal(reset.noAnimations, false);
    assert.equal(reset.settings.volume, 0.7);
    assert.equal(reset.settings.difficulty, 'normal');
    assert.equal(reset.settings.timerMinutes, 10);
    assert.equal(reset.settings.animationSpeed, 1);
    assert.equal(reset.settings.aiThinkMs, 0);
    assert.equal(reset.settings.soundsEnabled, true);
    assert.equal(reset.settings.animationsEnabled, true);
    assert.equal(reset.settings.particlesEnabled, true);
    assert.equal(reset.settings.particleDensity, 'normal');
    assert.equal(await evaluate('document.querySelector("#bg-particles").style.visibility'), '');
    assert.equal(reset.settings.showLegalMoves, true);
    assert.equal(reset.settings.boardFlipped, false);
    assert.equal(reset.settings.capturesOptional, false);
    assert.equal(reset.settings.chainCaptures, false);
    assert.ok(reset.soundIcon.indexOf('i-volume-off') === -1 && reset.soundIcon.indexOf('i-volume') !== -1);
    await evaluate('document.querySelector("#modal-settings .modal-close").click()');

    console.log('3. Modales règles et historique');
    await evaluate('document.querySelector("#btn-howto").click()');
    assert.equal(await evaluate('document.querySelectorAll("#modal-howto .howto-card").length'), 7);
    await evaluate('document.querySelector("#modal-howto .modal-close").click()');
    await evaluate('document.querySelector("#btn-history").click()');
    assert.equal(await evaluate('!document.querySelector("#modal-history").classList.contains("hidden")'), true);
    await evaluate('document.querySelector("#modal-history .modal-close").click()');

    console.log('4. Nouvelle partie contre l’IA (facile)');
    await evaluate('document.querySelector("#btn-play-ai").click()');
    assert.equal(await evaluate('document.querySelector("#screen-mode").classList.contains("is-active")'), true);
    await evaluate('document.querySelector("#difficulty-grid .difficulty-card[data-difficulty=\\"easy\\"]").click()');
    await waitFor(() => evaluate('document.querySelector("#screen-game").classList.contains("is-active")'), 4000, 'écran de jeu');
    assert.equal(await evaluate('document.querySelectorAll("#board .square").length'), 100);
    assert.equal(await evaluate('document.querySelectorAll("#pieces-layer .piece").length'), 40);
    assert.equal(await evaluate('window.checkersApp.engine.mode'), 'ai');
    assert.equal(await evaluate('window.checkersApp.engine.difficulty'), 'easy');
    assert.equal(await evaluate('window.checkersApp.engine.currentPlayer'), 'white');
    await screenshot('02-partie-desktop.png');

    console.log('5. Sélection, déplacement humain et réponse de l’IA');
    const move = await evaluate(`
      (() => {
        const app = window.checkersApp;
        const move = app.engine.getLegalMoves()[0];
        window.__testMove = { from: move.from, to: move.to };
        const piece = document.querySelector('.piece[data-square="' + move.from + '"]');
        piece.click();
        return { from: move.from, to: move.to };
      })()
    `);
    await waitFor(() => evaluate('document.querySelectorAll("#board .move-target, #board .capture-target").length > 0'), 3000, 'affichage des coups légaux');
    await evaluate('document.querySelector(".square[data-square=\\"" + ' + JSON.stringify(move.to) + ' + "\\"]").click()');
    await waitFor(() => evaluate('window.checkersApp.engine.history.length >= 1'), 6000, 'coup humain appliqué');
    await waitFor(() => evaluate('window.checkersApp.engine.history.length >= 2 && !window.checkersApp.aiThinking && !window.checkersApp.busy'), 15000, 'réponse de l’IA');
    assert.equal(await evaluate('window.checkersApp.engine.currentPlayer'), 'white');
    assert.ok(await evaluate('window.checkersApp.lastAIStats && window.checkersApp.lastAIStats.nodes > 0'));
    assert.equal(await evaluate('document.querySelector("#ai-stats-panel").classList.contains("hidden")'), false);
    assert.ok(await evaluate('document.querySelectorAll("#history-list li").length >= 1'));

    // Effet de capture « brutal » : secousse, onde de choc et trait d'humour.
    const captureFx = await evaluate(`
      (() => {
        const app = window.checkersApp;
        app.onCaptureEffect(33, 1, 1);
        app.onCaptureEffect(44, 2, 2);
        return {
          taunts: document.querySelectorAll('.capture-taunt').length,
          mega: document.querySelectorAll('.capture-taunt.is-mega').length,
          shaking: document.querySelector('.board-frame').classList.contains('impact'),
          waves: window.Animations.shockwaves.length,
          cracks: window.Animations.cracks.length,
          splats: window.Animations.splats.length,
          flash: document.querySelectorAll('.impact-flash').length
        };
      })()
    `);
    assert.ok(captureFx.taunts >= 2, 'textes de capture absents');
    assert.ok(captureFx.mega >= 1, 'texte de rafle absent');
    assert.equal(captureFx.shaking, true);
    assert.ok(captureFx.waves >= 2, 'ondes de choc absentes');
    assert.ok(captureFx.cracks >= 5, 'fissures absentes');
    assert.ok(captureFx.splats >= 10, 'éclaboussures absentes');
    assert.ok(captureFx.flash >= 2, 'flash plein écran absent');

    const save = await evaluate(`
      (() => {
        const raw = localStorage.getItem('cl2026:savegame');
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        return { version: parsed.version, plies: parsed.data.engine.history.length };
      })()
    `);
    assert.ok(save && save.plies >= 2, 'sauvegarde automatique absente');

    console.log('6. Rechargement et reprise de partie');
    await load();
    assert.equal(await evaluate('!document.querySelector("#btn-resume").classList.contains("hidden")'), true);
    await evaluate('document.querySelector("#btn-resume").click()');
    await waitFor(() => evaluate('document.querySelector("#screen-game").classList.contains("is-active")'), 4000, 'reprise');
    assert.equal(await evaluate('window.checkersApp.engine.history.length >= 2'), true);
    assert.equal(await evaluate('window.checkersApp.gameActive'), true);

    console.log('7. Pause et annulation');
    await evaluate('document.querySelector("#btn-pause").click()');
    assert.equal(await evaluate('window.checkersApp.paused'), true);
    assert.equal(await evaluate('!document.querySelector("#pause-overlay").classList.contains("hidden")'), true);
    await evaluate('document.querySelector("#btn-resume-game").click()');
    assert.equal(await evaluate('window.checkersApp.paused'), false);
    await evaluate('document.querySelector("#btn-undo").click()');
    await waitFor(() => evaluate('window.checkersApp.engine.history.length === 0'), 4000, 'annulation complète');
    assert.equal(await evaluate('window.checkersApp.engine.currentPlayer'), 'white');
    assert.equal(await evaluate('localStorage.getItem("cl2026:savegame")'), null);

    console.log('8. Mode 2 joueurs');
    await evaluate('document.querySelector("#btn-quit").click()');
    await waitFor(() => evaluate('!document.querySelector("#modal-confirm").classList.contains("hidden")'), 3000, 'confirmation quitter');
    await evaluate('document.querySelector("#btn-confirm-ok").click()');
    await waitFor(() => evaluate('document.querySelector("#screen-home").classList.contains("is-active")'), 3000, 'retour accueil');
    await evaluate('document.querySelector("#btn-play-pvp").click()');
    await waitFor(() => evaluate('document.querySelector("#screen-game").classList.contains("is-active")'), 4000, 'partie 2 joueurs');
    assert.equal(await evaluate('window.checkersApp.engine.mode'), 'pvp');
    assert.equal(await evaluate('window.checkersApp.engine.playerColor'), 'white');
    const pvpMove = await evaluate(`
      (() => {
        const move = window.checkersApp.engine.getLegalMoves()[0];
        document.querySelector('.piece[data-square="' + move.from + '"]').click();
        return { from: move.from, to: move.to };
      })()
    `);
    await evaluate('document.querySelector(".square[data-square=\\"" + ' + JSON.stringify(pvpMove.to) + ' + "\\"]").click()');
    await waitFor(() => evaluate('window.checkersApp.engine.history.length === 1 && !window.checkersApp.busy'), 5000, 'coup 2 joueurs');
    assert.equal(await evaluate('window.checkersApp.engine.currentPlayer'), 'black');
    await evaluate('document.querySelector("#btn-undo").click()');
    await waitFor(() => evaluate('window.checkersApp.engine.history.length === 0'), 3000, 'annulation 2 joueurs');
    await evaluate('document.querySelector("#btn-quit").click()');
    await waitFor(() => evaluate('!document.querySelector("#modal-confirm").classList.contains("hidden")'), 3000, 'confirmation quitter 2 joueurs');
    await evaluate('document.querySelector("#btn-confirm-ok").click()');
    await waitFor(() => evaluate('document.querySelector("#screen-home").classList.contains("is-active")'), 3000, 'accueil après 2 joueurs');

    console.log('9. Partie avec les Noirs et orientation automatique');
    await evaluate('document.querySelector("#btn-play-ai").click()');
    await waitFor(() => evaluate('document.querySelector("#screen-mode").classList.contains("is-active")'), 3000, 'écran de mode (Noirs)');
    await evaluate('document.querySelector("#color-choice .seg-btn[data-color=\\"black\\"]").click()');
    assert.equal(await evaluate('window.checkersApp.pending.color'), 'black');
    await evaluate('document.querySelector("#difficulty-grid .difficulty-card[data-difficulty=\\"easy\\"]").click()');
    await waitFor(() => evaluate('document.querySelector("#screen-game").classList.contains("is-active")'), 4000, 'partie avec les Noirs');
    assert.equal(await evaluate('window.checkersApp.engine.playerColor'), 'black');
    assert.equal(await evaluate('window.checkersApp.renderer.flipped'), true);
    assert.equal(await evaluate('document.querySelector("#player-panel-name").textContent'), 'Joueur');
    assert.equal(await evaluate('document.querySelector("#panel-bottom").classList.contains("is-active")'), false);
    await waitFor(() => evaluate('window.checkersApp.engine.history.length >= 1 && !window.checkersApp.aiThinking && !window.checkersApp.busy'), 15000, 'ouverture de l’IA');
    assert.equal(await evaluate('window.checkersApp.engine.currentPlayer'), 'black');
    assert.equal(await evaluate('document.querySelector("#panel-bottom").classList.contains("is-active")'), true);
    await evaluate('document.querySelector("#btn-quit").click()');
    await waitFor(() => evaluate('!document.querySelector("#modal-confirm").classList.contains("hidden")'), 3000, 'confirmation quitter Noirs');
    await evaluate('document.querySelector("#btn-confirm-ok").click()');
    await waitFor(() => evaluate('document.querySelector("#screen-home").classList.contains("is-active")'), 3000, 'accueil après Noirs');

    console.log('10. Responsive mobile');
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 390,
      height: 844,
      deviceScaleFactor: 2,
      mobile: true
    });
    await evaluate('document.querySelector("#btn-play-ai").click()');
    await evaluate('document.querySelector("#difficulty-grid .difficulty-card[data-difficulty=\\"easy\\"]").click()');
    await waitFor(() => evaluate('document.querySelector("#screen-game").classList.contains("is-active")'), 4000, 'jeu mobile');
    await sleep(500);
    const mobile = await evaluate(`
      (() => {
        const board = document.querySelector('#board-wrap').getBoundingClientRect();
        return {
          overflow: document.documentElement.scrollWidth <= window.innerWidth + 1,
          boardWidth: board.width,
          viewport: window.innerWidth
        };
      })()
    `);
    assert.equal(mobile.overflow, true, 'débordement horizontal sur mobile');
    assert.ok(mobile.boardWidth <= mobile.viewport, 'plateau plus large que l’écran');
    await screenshot('03-partie-mobile.png');
    await cdp.send('Emulation.clearDeviceMetricsOverride');

    console.log('11. Service Worker et cache hors ligne');
    const sw = await evaluate(`
      (async () => {
        const registration = await navigator.serviceWorker.ready;
        return {
          scope: registration.scope,
          controller: !!navigator.serviceWorker.controller,
          caches: await caches.keys()
        };
      })()
    `, true);
    assert.ok(sw.caches.some((key) => key.indexOf('checkers-legend-2026-') === 0), 'cache PWA absent');
    await waitFor(() => evaluate('!!navigator.serviceWorker.controller'), 10000, 'contrôle du Service Worker');

    await cdp.send('Network.emulateNetworkConditions', {
      offline: true,
      latency: 0,
      downloadThroughput: 0,
      uploadThroughput: 0
    });
    await load();
    assert.equal(await evaluate('document.title'), 'CHECKERS LEGEND 2026 — Dames internationales');
    assert.equal(await evaluate('!!window.checkersApp'), true);
    assert.equal(await evaluate('document.querySelector("#screen-home").classList.contains("is-active")'), true);

    console.log('12. IA opérationnelle hors ligne');
    await evaluate('document.querySelector("#btn-play-ai").click()');
    await evaluate('document.querySelector("#difficulty-grid .difficulty-card[data-difficulty=\\"easy\\"]").click()');
    await waitFor(() => evaluate('document.querySelector("#screen-game").classList.contains("is-active")'), 4000, 'jeu hors ligne');
    const offlineMove = await evaluate(`
      (() => {
        const move = window.checkersApp.engine.getLegalMoves()[0];
        document.querySelector('.piece[data-square="' + move.from + '"]').click();
        return { from: move.from, to: move.to };
      })()
    `);
    await evaluate('document.querySelector(".square[data-square=\\"" + ' + JSON.stringify(offlineMove.to) + ' + "\\"]").click()');
    await waitFor(() => evaluate('window.checkersApp.engine.history.length >= 2 && !window.checkersApp.aiThinking && !window.checkersApp.busy'), 15000, 'IA hors ligne');
    assert.equal(await evaluate('window.checkersApp.engine.history.length >= 2'), true);
    await screenshot('04-hors-ligne.png');

    console.log('13. Repli IA sans Web Worker');
    await evaluate('window.__realWorker = window.Worker; window.Worker = function () { throw new Error("Worker indisponible (test)"); };');
    const fallbackMove = await evaluate(`
      (() => {
        const move = window.checkersApp.engine.getLegalMoves()[0];
        document.querySelector('.piece[data-square="' + move.from + '"]').click();
        return { from: move.from, to: move.to };
      })()
    `);
    await waitFor(() => evaluate('document.querySelectorAll("#board .move-target, #board .capture-target").length > 0'), 3000, 'cibles en mode de secours');
    await evaluate('document.querySelector(".square[data-square=\\"" + ' + JSON.stringify(fallbackMove.to) + ' + "\\"]").click()');
    await waitFor(() => evaluate('window.checkersApp.engine.history.length >= 4 && !window.checkersApp.aiThinking && !window.checkersApp.busy'), 15000, 'réponse IA en mode de secours');
    // Un coup forcé peut donner nodes = 0 : on vérifie seulement que l'IA a répondu.
    assert.ok(await evaluate('window.checkersApp.lastAIStats && typeof window.checkersApp.lastAIStats.nodes === "number"'));
    await evaluate('window.Worker = window.__realWorker; delete window.__realWorker;');

    console.log('14. Chronomètre, fin de partie et rejouer');
    await evaluate('window.checkersApp.handleTimeout("white")');
    await waitFor(() => evaluate('!document.querySelector("#modal-gameover").classList.contains("hidden")'), 3000, 'modale de fin de partie');
    assert.equal(await evaluate('document.querySelector("#gameover-title").textContent'), 'DÉFAITE');
    assert.equal(await evaluate('window.checkersApp.gameActive'), false);
    assert.equal(await evaluate('localStorage.getItem("cl2026:savegame")'), null);
    assert.ok(await evaluate('document.querySelector("#go-xp").textContent.startsWith("+")'));
    const recorded = await evaluate(`
      (() => ({
        wins: window.Statistics.data.wins,
        losses: window.Statistics.data.losses,
        games: window.Statistics.data.games.length,
        xp: window.Statistics.data.xp
      }))()
    `);
    assert.ok(recorded.losses >= 1, 'défaite non enregistrée');
    assert.ok(recorded.games >= 1, 'partie absente de l’historique');
    assert.ok(recorded.xp > 0, 'XP non attribué');
    await evaluate('document.querySelector("#btn-play-again").click()');
    await waitFor(() => evaluate('window.checkersApp.gameActive && window.checkersApp.engine.history.length === 0'), 4000, 'nouvelle partie après défaite');
    assert.equal(await evaluate('document.querySelector("#modal-gameover").classList.contains("hidden")'), true);

    console.log('15. Clavier, sauvegardes manuelles et notation');
    await waitFor(() => evaluate('window.checkersApp.gameActive && !window.checkersApp.aiThinking && !window.checkersApp.busy'), 6000, 'partie prête pour le clavier');
    await evaluate(`
      (() => {
        const app = window.checkersApp;
        const move = app.engine.getLegalMoves()[0];
        const from = document.querySelector('#board .square[data-square="' + move.from + '"]');
        from.focus();
        from.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        const to = document.querySelector('#board .square[data-square="' + move.to + '"]');
        to.focus();
        to.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      })()
    `);
    await waitFor(() => evaluate('window.checkersApp.engine.history.length >= 1'), 5000, 'coup joué au clavier');
    const focusBefore = await evaluate('document.activeElement.dataset.square');
    await evaluate('document.activeElement.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }))');
    const focusAfter = await evaluate('document.activeElement.dataset.square');
    assert.notEqual(focusBefore, focusAfter, 'flèches de navigation clavier');

    await waitFor(() => evaluate('!window.checkersApp.aiThinking && !window.checkersApp.busy'), 15000, 'IA prête pour sauvegarde');
    await evaluate('document.querySelector("#btn-saves-game").click()');
    assert.equal(await evaluate('document.querySelectorAll("#saves-list .save-slot").length'), 3);
    await evaluate('document.querySelectorAll("#saves-list .save-slot")[0].querySelectorAll("button")[1].click()');
    await evaluate('document.querySelector("#btn-confirm-ok").click()');
    await waitFor(() => evaluate('!!localStorage.getItem("cl2026:savegame:slot1")'), 3000, 'emplacement 1 enregistré');
    const savedPlies = await evaluate('window.checkersApp.engine.history.length');
    await evaluate('document.querySelectorAll("#saves-list .save-slot")[0].querySelectorAll("button")[0].click()');
    await waitFor(() => evaluate('document.querySelector("#modal-saves").classList.contains("hidden")'), 3000, 'chargement de l’emplacement');
    assert.equal(await evaluate('window.checkersApp.engine.history.length'), savedPlies);
    await evaluate('window.checkersApp.copyNotation()');

    await cdp.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: 0,
      downloadThroughput: -1,
      uploadThroughput: -1
    });

    assert.deepEqual(exceptions, [], 'exceptions JavaScript détectées : ' +
      exceptions.map((e) => e.text).join(' | '));
    if (consoleErrors.length) {
      console.log('Avertissements console :');
      consoleErrors.forEach((entry) => console.log(' - ' + entry));
    }

    console.log('\nTests navigateur réussis.');
    console.log('Captures : docs/screenshots/');
  } finally {
    if (cdp) cdp.close();
    if (browser) {
      try { browser.kill(); } catch (error) { /* ignoré */ }
      await sleep(500);
      try {
        if (process.platform === 'win32') {
          spawn('taskkill', ['/PID', String(browser.pid), '/T', '/F'], { stdio: 'ignore' });
        }
      } catch (error) { /* ignoré */ }
    }
    try { server.kill(); } catch (error) { /* ignoré */ }
    await sleep(300);
    try { fs.rmSync(TEMP, { recursive: true, force: true }); } catch (error) { /* ignoré */ }
  }
}

main().catch((error) => {
  console.error('\nÉCHEC DU TEST NAVIGATEUR');
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
