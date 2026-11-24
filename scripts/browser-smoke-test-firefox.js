/**
 * CHECKERS LEGEND 2026 — Parcours navigateur Firefox (WebDriver BiDi)
 * --------------------------------------------------------------------
 * Test headless SANS DEPENDANCE : Firefox 160+ embarque WebDriver BiDi, le
 * WebSocket natif de Node et fetch suffisent (aucun geckodriver, aucun npm).
 *
 * Usage : node scripts/browser-smoke-test-firefox.js
 *         FIREFOX_PATH="..." node scripts/browser-smoke-test-firefox.js
 *
 * Certaines étapes du test Edge/Chromium reposent sur CDP (réseau hors ligne,
 * repli Worker) et ne sont pas reproductibles en BiDi : elles sont documentées
 * dans docs/TEST_REPORT.md plutôt que simulées.
 */
'use strict';

const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.FF_TEST_PORT || 8125);
const BASE = 'http://127.0.0.1:' + PORT + '/';
const SHOTS = path.join(ROOT, 'docs', 'screenshots');
const TEMP = path.join(os.tmpdir(), 'cl2026-firefox-' + process.pid);

const CANDIDATES = [
  process.env.FIREFOX_PATH,
  'C:\\Program Files\\Mozilla Firefox\\firefox.exe',
  'C:\\Program Files (x86)\\Mozilla Firefox\\firefox.exe',
  '/usr/bin/firefox',
  '/Applications/Firefox.app/Contents/MacOS/firefox'
].filter(Boolean);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(fn, timeout, label) {
  const deadline = Date.now() + timeout;
  let last = '';
  while (Date.now() < deadline) {
    try {
      if (await fn()) return;
    } catch (error) {
      last = error && error.message ? error.message : String(error);
    }
    await sleep(100);
  }
  throw new Error('Délai dépassé : ' + label + (last ? ' (' + last + ')' : ''));
}

function findBrowser() {
  const found = CANDIDATES.find((candidate) => fs.existsSync(candidate));
  if (!found) throw new Error('Firefox introuvable (définir FIREFOX_PATH).');
  return found;
}

/** Client WebDriver BiDi minimal, basé sur le WebSocket global de Node. */
class BiDi {
  constructor(ws) {
    this.ws = ws;
    this.nextId = 0;
    this.pending = new Map();
    this.listeners = [];
    ws.addEventListener('message', (event) => {
      let message;
      try { message = JSON.parse(event.data); } catch (error) { return; }
      if (message.id && this.pending.has(message.id)) {
        const resolve = this.pending.get(message.id);
        this.pending.delete(message.id);
        resolve(message);
        return;
      }
      if (message.method) this.listeners.forEach((listener) => listener(message));
    });
  }

  send(method, params) {
    const id = ++this.nextId;
    return new Promise((resolve, reject) => {
      this.pending.set(id, resolve);
      try {
        this.ws.send(JSON.stringify({ id, method, params: params || {} }));
      } catch (error) {
        this.pending.delete(id);
        reject(error);
      }
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error('Réponse BiDi absente pour ' + method));
        }
      }, 30000).unref();
    });
  }

  on(listener) { this.listeners.push(listener); }

  close() {
    try { this.ws.close(); } catch (error) { /* ignoré */ }
  }
}

async function main() {
  const firefox = findBrowser();
  fs.mkdirSync(SHOTS, { recursive: true });
  fs.mkdirSync(TEMP, { recursive: true });

  let browser = null;
  let server = null;
  let bidi = null;

  try {
    server = spawn(process.execPath, [path.join(ROOT, 'scripts', 'serve.js'), String(PORT)], {
      cwd: ROOT, stdio: 'ignore'
    });
    await waitFor(async () => {
      try { return (await fetch(BASE + 'index.html')).ok; } catch (error) { return false; }
    }, 10000, 'serveur local');

    browser = spawn(firefox, [
      '--headless', '--no-remote', '--profile', TEMP,
      '--remote-debugging-port=0', 'about:blank'
    ], { stdio: ['ignore', 'pipe', 'pipe'] });

    let port = 0;
    await waitFor(() => {
      const file = path.join(TEMP, 'WebDriverBiDiServer.json');
      if (!fs.existsSync(file)) return false;
      try { port = JSON.parse(fs.readFileSync(file, 'utf8')).ws_port; } catch (error) { return false; }
      return !!port;
    }, 20000, 'serveur WebDriver BiDi de Firefox');

    const ws = new WebSocket('ws://127.0.0.1:' + port + '/session');
    await new Promise((resolve, reject) => {
      ws.addEventListener('open', resolve, { once: true });
      ws.addEventListener('error', reject, { once: true });
    });
    bidi = new BiDi(ws);

    const opened = await bidi.send('session.new', {
      capabilities: { alwaysMatch: { browserName: 'firefox' } }
    });
    assert.equal(opened.type, 'success', 'session.new a échoué');

    const logs = [];
    bidi.on((message) => {
      if (message.method === 'log.entryAdded' && message.params &&
          message.params.entry && message.params.entry.level === 'error') {
        logs.push(message.params.entry.text);
      }
    });
    await bidi.send('session.subscribe', { events: ['log.entryAdded'] });

    const tree = await bidi.send('browsingContext.getTree', {});
    const context = tree.result.contexts[0].context;

    const evaluate = async (expression) => {
      const response = await bidi.send('script.evaluate', {
        expression: '(async () => { ' + expression + ' })()',
        target: { context },
        awaitPromise: true,
        returnByValue: true,
        userGesture: true
      });
      if (response.type !== 'success' || (response.result && response.result.type === 'exception')) {
        throw new Error('Exception JavaScript : ' + JSON.stringify(response).slice(0, 600));
      }
      return response.result.result.value;
    };

    const load = async () => {
      await bidi.send('browsingContext.navigate', { context, url: BASE, wait: 'complete' });
      await waitFor(() => evaluate('return !!window.checkersApp;'), 10000, 'initialisation du jeu');
      await evaluate(`
        window.__ffErrors = [];
        window.addEventListener('error', (e) => window.__ffErrors.push(String(e.message)));
        window.addEventListener('unhandledrejection', (e) => window.__ffErrors.push(String(e.reason)));
        return true;
      `);
      await sleep(300);
    };

    const screenshot = async (name) => {
      const response = await bidi.send('browsingContext.captureScreenshot', {
        context, format: { type: 'png' }
      });
      assert.equal(response.type, 'success', 'capture impossible');
      fs.writeFileSync(path.join(SHOTS, name), Buffer.from(response.result.data, 'base64'));
    };

    console.log('1. Chargement de l’accueil (Firefox ' +
      opened.result.capabilities.browserVersion + ')');
    await load();
    assert.equal(await evaluate('return document.querySelector("#screen-home").classList.contains("is-active");'), true);
    assert.ok((await evaluate('return document.querySelectorAll(".menu-btn").length;')) >= 8);
    await screenshot('firefox-01-accueil.png');

    console.log('2. Paramètres et thèmes');
    await evaluate('document.querySelector("#btn-settings").click(); return true;');
    assert.equal(await evaluate('return document.querySelector("#modal-settings").classList.contains("hidden");'), false);
    await evaluate('document.querySelector("#set-theme").value = "midnight"; document.querySelector("#set-theme").dispatchEvent(new Event("change", {bubbles:true})); return true;');
    assert.equal(await evaluate('return window.checkersApp.settings.theme;'), 'midnight');
    await evaluate('document.querySelector("#btn-reset-settings").click(); return true;');
    assert.equal(await evaluate('return window.checkersApp.settings.theme;'), 'neon');
    await evaluate('document.querySelector("#modal-settings [data-close]").click(); return true;');

    console.log('3. Modales');
    await evaluate('document.querySelector("#btn-howto").click(); return true;');
    assert.equal(await evaluate('return document.querySelector("#modal-howto").classList.contains("hidden");'), false);
    await evaluate('document.querySelector("#modal-howto [data-close]").click(); return true;');
    await evaluate('document.querySelector("#btn-achievements").click(); return true;');
    assert.ok((await evaluate('return document.querySelectorAll("#achievements-grid > *").length;')) >= 6);
    await evaluate('document.querySelector("#modal-achievements [data-close]").click(); return true;');

    console.log('4. Partie contre l’IA et réponse du Worker');
    await evaluate('window.checkersApp.startGame({mode:"ai",difficulty:"easy",playerColor:"white",timerMinutes:10}); return true;');
    assert.equal(await evaluate('return document.querySelectorAll("#board .square").length;'), 100);
    await evaluate(`
      const app = window.checkersApp;
      const move = app.engine.getLegalMoves()[0];
      app.onSquareClick(move.from);
      app.onSquareClick(move.to);
      return true;
    `);
    await waitFor(() => evaluate('return window.checkersApp.engine.history.length >= 2;'), 15000, 'réponse de l’IA');
    assert.ok((await evaluate('return window.checkersApp.engine.history.length;')) >= 2);
    await screenshot('firefox-02-partie.png');

    console.log('5. Sauvegarde et reprise après rechargement');
    await waitFor(() => evaluate('return !window.checkersApp.aiThinking && !window.checkersApp.busy;'), 10000, 'IA prête');
    await evaluate('window.checkersApp.saveGame(); return true;');
    const before = await evaluate('return window.checkersApp.engine.history.length;');
    await load();
    await evaluate('document.querySelector("#btn-resume").click(); return true;');
    await waitFor(() => evaluate('return window.checkersApp.gameActive;'), 5000, 'reprise');
    assert.equal(await evaluate('return window.checkersApp.engine.history.length;'), before);

    console.log('6. Pause et annulation');
    await evaluate('window.checkersApp.togglePause(true); return true;');
    assert.equal(await evaluate('return window.checkersApp.paused;'), true);
    await evaluate('window.checkersApp.togglePause(false); return true;');
    await evaluate('window.checkersApp.undoMove(); return true;');
    assert.ok((await evaluate('return window.checkersApp.engine.history.length;')) < before);

    console.log('7. Mode deux joueurs et orientation');
    await evaluate('window.checkersApp.startGame({mode:"pvp",timerMinutes:10}); return true;');
    assert.equal(await evaluate('return window.checkersApp.engine.mode;'), 'pvp');
    await evaluate('window.checkersApp.startGame({mode:"ai",difficulty:"easy",playerColor:"black",timerMinutes:10}); return true;');
    assert.equal(await evaluate('return window.checkersApp.getFlipped();'), true);

    console.log('8. Responsive mobile');
    await bidi.send('browsingContext.setViewport', {
      context, viewport: { width: 390, height: 844 }
    });
    await sleep(300);
    assert.equal(await evaluate('return document.documentElement.scrollWidth <= window.innerWidth + 2;'), true);
    await screenshot('firefox-03-mobile.png');
    await bidi.send('browsingContext.setViewport', {
      context, viewport: { width: 1280, height: 900 }
    });

    console.log('9. Service Worker et cache hors ligne');
    await load();
    await waitFor(() => evaluate('return !!navigator.serviceWorker && !!navigator.serviceWorker.controller;'), 10000, 'Service Worker contrôlant la page');
    assert.equal(await evaluate('return !!caches;'), true);

    console.log('10. Profils et parties nommées');
    await evaluate(`
      (() => {
        const app = window.checkersApp;
        app.openProfiles();
        document.querySelector('#new-profile-name').value = 'Firefox';
        app.createProfile();
        return true;
      })()
    `);
    assert.equal(await evaluate('return window.ProfileManager.active().name;'), 'Firefox');
    assert.equal(await evaluate('return window.ProfileManager.listNamed().length;'), 0);

    console.log('11. Puzzles et analyse IA');
    await evaluate('window.checkersApp.openPuzzles(); return true;');
    assert.equal(await evaluate('return document.querySelectorAll("#puzzle-board .square").length;'), 100);
    await evaluate('document.querySelector("#btn-puzzle-analysis").click(); return true;');
    assert.match(await evaluate('return document.querySelector("#puzzle-feedback").textContent;'), /Analyse IA/);
    const current = await evaluate('return document.querySelector("#puzzle-select").value;');
    await evaluate('document.querySelector("#btn-puzzle-next").click(); return true;');
    assert.notEqual(await evaluate('return document.querySelector("#puzzle-select").value;'), current);
    await evaluate('document.querySelector("#modal-puzzles [data-close]").click(); return true;');

    const exceptions = await evaluate('return window.__ffErrors || [];');
    assert.deepEqual(exceptions, [], 'exceptions JavaScript : ' + exceptions.join(' | '));
    assert.deepEqual(logs, [], 'erreurs console : ' + logs.join(' | '));

    console.log('\nTests navigateur Firefox réussis (11 étapes).');
    console.log('Captures : docs/screenshots/firefox-*.png');
  } finally {
    if (bidi) {
      try { await bidi.send('session.end'); } catch (error) { /* ignoré */ }
      bidi.close();
    }
    if (browser) {
      try { browser.kill(); } catch (error) { /* ignoré */ }
      await sleep(500);
      if (process.platform === 'win32') {
        try {
          spawn('taskkill', ['/PID', String(browser.pid), '/T', '/F'], { stdio: 'ignore' });
        } catch (error) { /* ignoré */ }
      }
    }
    if (server) server.kill();
    await sleep(300);
    try { fs.rmSync(TEMP, { recursive: true, force: true }); } catch (error) { /* ignoré */ }
  }
}

main().catch((error) => {
  console.error('\nÉCHEC DU TEST NAVIGATEUR FIREFOX');
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
