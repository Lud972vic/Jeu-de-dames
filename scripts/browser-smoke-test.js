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

/**
 * POUR UN DÉBUTANT — Rôle, concepts et mode d'emploi
 * --------------------------------------------------
 * Rôle : ce script est un « test de fumée navigateur ». Il démarre le serveur
 * local, ouvre le jeu dans un navigateur (Edge ou Chrome) en mode « headless »
 * (sans fenêtre visible), rejoue un parcours complet — accueil, réglages,
 * partie contre l'IA, sauvegarde, reprise, pause, deux joueurs, mobile, mode
 * hors ligne… — et vérifie que tout fonctionne et qu'aucune erreur JavaScript
 * n'apparaît. Il prend aussi des captures d'écran dans docs/screenshots/.
 *
 * Concepts utilisés :
 *  - Modules Node « node: » : « node:assert/strict » compare des valeurs et
 *    s'arrête si ce n'est pas conforme ; « node:child_process » lance d'autres
 *    programmes (le serveur, le navigateur) avec spawn ; « node:fs » gère les
 *    fichiers ; « node:path » les chemins ; « node:os » le dossier temporaire.
 *  - Promesses et async/await : une promesse représente un résultat qui viendra
 *    plus tard ; « async » marque une fonction qui utilise des promesses et
 *    « await » attend le résultat sans bloquer tout le programme. Indispensable
 *    pour parler à un navigateur qui répond quand il veut.
 *  - fetch : envoie une requête réseau (ici vers notre propre serveur local, à
 *    l'adresse 127.0.0.1) pour attendre qu'il soit prêt.
 *  - WebSocket et CDP : le navigateur ouvre un canal WebSocket (connexion
 *    bidirectionnelle) appelé CDP (Chrome DevTools Protocol). Grâce à lui, le
 *    script pilote la page : lire le titre, cliquer, naviguer, prendre une
 *    capture, couper le réseau…
 *  - base64 : une capture d'écran est transmise sous forme de texte base64 ;
 *    Buffer.from(..., 'base64') le retransforme en vrai fichier image (PNG).
 *  - Variables d'environnement : TEST_PORT et EDGE_PATH permettent de changer
 *    le port ou le chemin du navigateur sans toucher au code.
 *
 * Mode d'emploi simple :
 *  1. Installez Microsoft Edge ou Google Chrome.
 *  2. Tapez : node scripts/browser-smoke-test.js
 *  3. Lisez la numérotation 1 à 17 : chaque étape réussie est affichée.
 *  4. Les processus lancés sont arrêtés automatiquement à la fin (bloc finally).
 */
'use strict';

const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

// Dossier racine du projet (parent de scripts/).
const ROOT = path.resolve(__dirname, '..');
// Port du serveur de test : variable d'environnement TEST_PORT sinon 8124.
const PORT = Number(process.env.TEST_PORT || 8124);
// Adresse locale complète du jeu : on garde 127.0.0.1 pour rester sur cette
// machine (aucun accès à un autre ordinateur).
const BASE = 'http://127.0.0.1:' + PORT + '/';
// Dossier temporaire unique (le numéro de processus process.pid évite les
// collisions) : le navigateur y stocke son profil pendant le test.
const TEMP = path.join(os.tmpdir(), 'cl2026-browser-' + process.pid);
// Dossier où seront enregistrées les captures d'écran.
const SCREENSHOT_DIR = path.join(ROOT, 'docs', 'screenshots');

// Emplacements possibles du navigateur, essayés dans cet ordre. Le premier
// fourni par la variable EDGE_PATH (si elle existe) est prioritaire ;
// .filter(Boolean) retire les entrées vides.
const EDGE_CANDIDATES = [
  process.env.EDGE_PATH,
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'
].filter(Boolean);

// Petite fonction utilitaire : « attendre ms millisecondes ». Elle renvoie une
// promesse qui se résout quand le temps est écoulé ; avec await, on peut donc
// écrire « await sleep(500) » pour faire une pause.
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Attend qu'une condition devienne vraie, en réessayant régulièrement.
 * @param {Function} fn - fonction à appeler ; sa valeur de retour est la
 *   condition (si elle est « vraie », on a fini).
 * @param {number} timeout - temps maximum d'attente en millisecondes.
 * @param {string} label - nom de l'étape, utilisé dans le message d'erreur.
 * @returns {Promise<*>} une promesse contenant la valeur qui a réussi.
 * Notion simple : c'est une « boucle d'attente ». On essaie, on dort 100 ms,
 * on réessaie… jusqu'au délai imparti. Cela évite de supposer que le serveur
 * ou le navigateur répond instantanément.
 */
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

/**
 * Client minimal pour le protocole CDP (Chrome DevTools Protocol).
 * C'est une « classe » : un modèle d'objet. Une fois créé avec new CDP(url),
 * l'objet sait se connecter au navigateur et lui envoyer des ordres.
 * Notion simple : chaque message reçoit un numéro (id). On garde la liste des
 * demandes en attente dans « pending » ; quand la réponse arrive avec ce
 * numéro, on sait à quelle demande elle répond et on la « résout » (promesse).
 */
class CDP {
  /**
   * Prépare un nouveau client (aucune connexion n'est encore ouverte).
   * @param {string} url - adresse WebSocket du navigateur à contacter.
   * @returns {void} un constructeur ne renvoie rien ; il initialise l'objet.
   * Champs : socket = la connexion, nextId = prochain numéro de message,
   * pending = demandes en attente, listeners = abonnements aux événements.
   */
  constructor(url) {
    this.url = url;
    this.socket = null;
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Map();
  }

  /**
   * Ouvre la connexion WebSocket vers le navigateur.
   * @returns {Promise<void>} promesse tenue quand la connexion est ouverte,
   *   rompue (reject) si elle échoue ou met plus de 10 secondes.
   * Notion simple : on s'abonne aux événements « open » (réussi), « error »
   * (échec) et « message » (réponse reçue). Les messages sont du texte JSON
   * qu'on décode ; selon qu'ils contiennent un « id » ou une « method », il
   * s'agit soit de la réponse à une demande, soit d'un événement du navigateur.
   */
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

  /**
   * Envoie un ordre au navigateur et attend sa réponse.
   * @param {string} method - nom de l'ordre CDP (ex. : « Page.navigate »).
   * @param {object} [params] - paramètres de l'ordre ; {} par défaut.
   * @returns {Promise<*>} promesse contenant le résultat renvoyé par le
   *   navigateur, ou une erreur si celui-ci signale un problème.
   * Notion simple : on invente un numéro (id), on mémorise les fonctions
   * « resolve »/« reject » dans pending, puis on envoie le tout en JSON.
   * La méthode connect() se chargera de retrouver la bonne promesse plus tard.
   */
  send(method, params) {
    return new Promise((resolve, reject) => {
      const id = this.nextId++;
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params: params || {} }));
    });
  }

  /**
   * S'abonne à un événement du navigateur (ex. : une exception JavaScript).
   * @param {string} method - nom de l'événement CDP à écouter.
   * @param {Function} handler - fonction à appeler quand l'événement arrive ;
   *   elle reçoit les détails (params) en argument.
   * @returns {void} rien ; l'abonnement est simplement ajouté à la liste.
   * Notion simple : c'est le principe du « écouteur d'événements ». Plusieurs
   * écouteurs peuvent être enregistrés pour le même nom d'événement.
   */
  on(method, handler) {
    if (!this.listeners.has(method)) this.listeners.set(method, []);
    this.listeners.get(method).push(handler);
  }

  /**
   * Ferme la connexion WebSocket avec le navigateur.
   * @returns {void} rien ; la connexion est simplement fermée si elle existe.
   * Notion simple : on vérifie « if (this.socket) » car il se peut qu'on n'ait
   * jamais réussi à se connecter (dans ce cas il n'y a rien à fermer).
   */
  close() {
    if (this.socket) this.socket.close();
  }
}

/**
 * Cherche un navigateur Edge ou Chrome installé sur la machine.
 * @returns {string} chemin complet vers le fichier exécutable trouvé.
 * @throws {Error} si aucun des emplacements de la liste n'existe.
 * Notion simple : on parcourt la liste EDGE_CANDIDATES et on renvoie le premier
 * chemin qui existe réellement (fs.existsSync = « est-ce que ce fichier est là ? »).
 */
function findBrowser() {
  for (const candidate of EDGE_CANDIDATES) {
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new Error('Aucun navigateur Edge/Chrome trouvé.');
}

/**
 * Déroule tout le parcours de test, étape par étape.
 * @returns {Promise<void>} une promesse tenue quand le test est terminé.
 * Notion simple : c'est le « chef d'orchestre ». Il démarre le serveur et le
 * navigateur, attend qu'ils soient prêts, enchaîne les vérifications, puis
 * nettoie tout dans le bloc « finally » (même en cas d'erreur).
 */
async function main() {
  // Préparation : on crée les dossiers de travail s'ils n'existent pas encore.
  // « recursive: true » signifie « crée aussi les dossiers parents ».
  fs.mkdirSync(TEMP, { recursive: true });
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

  // Étape préliminaire : lancer notre propre serveur local dans un autre
  // processus (spawn). On lui passe le chemin de serve.js et le port choisi.
  const server = spawn(process.execPath, [path.join(ROOT, 'scripts', 'serve.js'), String(PORT)], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe']
  });
  // On collecte les messages du serveur (sortie normale et erreurs) au cas où
  // il faudrait diagnostiquer un démarrage qui échoue. « chunk » = petit morceau
  // de texte reçu au fur et à mesure (un flux, voir l'en-tête).
  let serverLog = '';
  server.stdout.on('data', (chunk) => { serverLog += chunk.toString(); });
  server.stderr.on('data', (chunk) => { serverLog += chunk.toString(); });

  // Ces variables garderont un œil sur ce qui a été lancé pour pouvoir tout
  // arrêter proprement à la fin. Les deux tableaux recueillent les erreurs
  // survenues dans la page pour vérifier qu'il n'y en a aucune.
  let browser = null;
  let cdp = null;
  const exceptions = [];
  const consoleErrors = [];

  try {
    // On attend que le serveur réponde avant d'aller plus loin : fetch() fait
    // une demande à notre adresse locale et response.ok vaut true si ça marche.
    await waitFor(async () => {
      const response = await fetch(BASE + 'index.html');
      return response.ok;
    }, 10000, 'démarrage du serveur local');

    // Lancement du navigateur en mode headless (sans fenêtre). Les nombreuses
    // options désactivent les mises à jour et la synchronisation pour que le
    // test soit rapide et reproductible. « --remote-debugging-port=0 » demande
    // à Chrome d'ouvrir un port CDP choisi automatiquement.
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

    // Le navigateur écrit le numéro du port CDP dans un fichier spécial situé
    // dans son profil temporaire. On attend que ce fichier apparaisse, puis on
    // lit sa première ligne (le numéro de port).
    const portFile = path.join(TEMP, 'DevToolsActivePort');
    const debugPort = await waitFor(() => {
      if (!fs.existsSync(portFile)) return null;
      const lines = fs.readFileSync(portFile, 'utf8').split(/\r?\n/);
      return Number(lines[0]) || null;
    }, 15000, 'ouverture du port CDP');

    // On demande au navigateur la liste de ses « cibles » (onglets/pages),
    // toujours via fetch sur le port local. On garde la première page trouvée.
    const targets = await waitFor(async () => {
      const response = await fetch('http://127.0.0.1:' + debugPort + '/json/list');
      if (!response.ok) return null;
      const list = await response.json();
      return list.find((target) => target.type === 'page') || null;
    }, 15000, 'liste des cibles CDP');

    // Connexion au navigateur via l'adresse WebSocket de la cible, puis
    // activation des « domaines » CDP dont on aura besoin : Page (navigation),
    // Runtime (exécuter du JavaScript), Log et Network (surveiller erreurs et
    // réseau). On fixe aussi une taille d'écran de bureau (1440 x 1000).
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

    // Deux écouteurs d'événements : on note toute exception JavaScript et
    // toute erreur affichée dans la console du navigateur. À la fin du test,
    // la liste des exceptions doit être vide.
    cdp.on('Runtime.exceptionThrown', (params) => {
      exceptions.push(params.exceptionDetails);
    });
    cdp.on('Log.entryAdded', (params) => {
      if (params.entry && params.entry.level === 'error') {
        consoleErrors.push(params.entry.text);
      }
    });

    /**
     * Exécute du JavaScript dans la page et en renvoie le résultat.
     * @param {string} expression - code JavaScript à exécuter dans le navigateur.
     * @param {boolean} [awaitPromise] - mettre true si le code renvoie une
     *   promesse (par exemple une opération asynchrone) et qu'on veut attendre
     *   sa valeur.
     * @returns {Promise<*>} promesse contenant la valeur renvoyée par la page.
     * Notion simple : c'est notre « télécommande ». On envoie l'ordre
     * Runtime.evaluate à CDP ; si la page a levé une exception, on la transforme
     * en erreur lisible ici. returnByValue demande à récupérer une vraie valeur
     * et non une simple référence.
     */
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

    /**
     * Ouvre une page dans le navigateur et attend que le jeu soit prêt.
     * @param {string} [url] - page à ouvrir ; l'adresse locale du jeu par défaut.
     * @returns {Promise<void>} promesse tenue quand l'application est initialisée.
     * Notion simple : on s'abonne à l'événement « chargement terminé », on
     * ordonne la navigation, puis on attend au maximum 12 secondes. Ensuite on
     * vérifie que window.checkersApp existe : c'est le signe que le jeu a démarré.
     */
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

    /**
     * Prend une capture d'écran de la page et l'enregistre sur le disque.
     * @param {string} name - nom du fichier image à créer dans docs/screenshots.
     * @returns {Promise<void>} promesse tenue quand le fichier a été écrit.
     * Notion simple : CDP renvoie l'image encodée en base64 (texte) ; Buffer.from
     * avec « base64 » la convertit en octets, que fs.writeFileSync enregistre en PNG.
     */
    const screenshot = async (name) => {
      const result = await cdp.send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.join(SCREENSHOT_DIR, name), Buffer.from(result.data, 'base64'));
    };

    // ÉTAPE 1 — Ouvrir l'accueil : on vérifie le titre, le nombre d'écrans,
    // l'écran actif et les 4 cartes de difficulté, puis on prend une capture.
    console.log('1. Chargement de l’accueil');
    await load();
    assert.equal(await evaluate('document.title'), 'CHECKERS LEGEND 2026 — Dames internationales');
    assert.equal(await evaluate('document.querySelectorAll(".screen").length'), 3);
    assert.equal(await evaluate('document.querySelector("#screen-home").classList.contains("is-active")'), true);
    assert.equal(await evaluate('document.querySelectorAll("#difficulty-grid .difficulty-card").length'), 4);
    await screenshot('01-accueil-desktop.png');

    // ÉTAPE 2 — Sons et réglages : on allume/éteint le son, on modifie tous les
    // paramètres (thème, pièces, difficulté, volume…), puis on vérifie la
    // réinitialisation qui doit tout remettre aux valeurs de départ.
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

    // ÉTAPE 3 — Fenêtres modales : on ouvre et ferme les panneaux « comment
    // jouer » et « historique » en cliquant sur les boutons de la page.
    console.log('3. Modales règles et historique');
    await evaluate('document.querySelector("#btn-howto").click()');
    assert.equal(await evaluate('document.querySelectorAll("#modal-howto .howto-card").length'), 7);
    await evaluate('document.querySelector("#modal-howto .modal-close").click()');
    await evaluate('document.querySelector("#btn-history").click()');
    assert.equal(await evaluate('!document.querySelector("#modal-history").classList.contains("hidden")'), true);
    await evaluate('document.querySelector("#modal-history .modal-close").click()');

    // ÉTAPE 4 — Démarrer une partie contre l'IA en difficulté facile : on
    // vérifie le plateau (100 cases), les 40 pions et l'écran de jeu actif.
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

    // ÉTAPE 5 — Jouer un coup : on clique sur un pion puis sur sa destination,
    // on attend la réponse de l'IA, et on vérifie les effets de capture et la
    // sauvegarde automatique dans localStorage (mémoire du navigateur).
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

    // ÉTAPE 6 — Recharger la page puis cliquer sur « reprendre » : la partie
    // enregistrée doit revenir exactement là où elle en était.
    console.log('6. Rechargement et reprise de partie');
    await load();
    assert.equal(await evaluate('!document.querySelector("#btn-resume").classList.contains("hidden")'), true);
    await evaluate('document.querySelector("#btn-resume").click()');
    await waitFor(() => evaluate('document.querySelector("#screen-game").classList.contains("is-active")'), 4000, 'reprise');
    assert.equal(await evaluate('window.checkersApp.engine.history.length >= 2'), true);
    assert.equal(await evaluate('window.checkersApp.gameActive'), true);

    // ÉTAPE 7 — Mettre en pause, reprendre, puis annuler les coups jusqu'au
    // début : le bouton « annuler » doit aussi effacer la sauvegarde.
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

    // ÉTAPE 8 — Quitter la partie (avec confirmation) puis lancer un mode à
    // deux joueurs : on joue un coup, on l'annule, on revient à l'accueil.
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

    // ÉTAPE 9 — Choisir de jouer avec les pions noirs : le plateau doit se
    // retourner automatiquement et l'IA doit ouvrir la partie.
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

    // ÉTAPE 10 — Simuler un écran de téléphone (390 x 844) via CDP, vérifier
    // qu'il n'y a pas de débordement horizontal, puis restaurer l'écran normal.
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

    // ÉTAPE 11 — Vérifier que le Service Worker est installé et contrôle la
    // page, puis couper le réseau via CDP et recharger : le jeu doit quand même
    // s'afficher grâce au cache (fonctionnement hors ligne / PWA).
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

    // ÉTAPE 12 — Toujours sans réseau, jouer un coup et attendre l'IA : elle
    // doit répondre normalement puisqu'elle tourne sur l'appareil.
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

    // ÉTAPE 13 — Simuler un Web Worker indisponible (l'IA tourne normalement
    // dans un thread séparé) et vérifier qu'elle sait continuer sur le thread
    // principal : c'est le « repli » (fallback) de sécurité.
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

    // ÉTAPE 14 — Déclencher une fin de partie par temps écoulé, vérifier la
    // modale « défaite », les statistiques enregistrées, puis cliquer sur
    // « rejouer » pour repartir d'un plateau vierge.
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

    // ÉTAPE 15 — Jouer avec les touches Entrée et les flèches, enregistrer et
    // recharger une sauvegarde manuelle (emplacement 1), puis copier la notation.
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

    // ÉTAPE 16 — Créer une partie nommée, créer un second profil, puis revenir
    // au profil d'origine : les sauvegardes propres à chaque profil doivent
    // réapparaître (le jeu isole bien les données des joueurs).
    console.log('16. Profils et sauvegardes nommées');
    await evaluate(`
      (() => {
        const app = window.checkersApp;
        app.openSaves();
        document.querySelector('#named-save-name').value = 'Partie test';
        app.saveNamedGame();
      })()
    `);
    assert.equal(await evaluate('window.ProfileManager.listNamed().length'), 1);
    const originalProfileId = await evaluate('window.ProfileManager.active().id');
    const originalPlayerName = await evaluate('window.checkersApp.settings.playerName');
    await evaluate(`
      (() => {
        const app = window.checkersApp;
        app.openProfiles();
        document.querySelector('#new-profile-name').value = 'Test Profil';
        app.createProfile();
      })()
    `);
    assert.equal(await evaluate('window.ProfileManager.list().length'), 2);
    assert.equal(await evaluate('window.checkersApp.settings.playerName'), 'Test Profil');
    assert.equal(await evaluate('window.ProfileManager.listNamed().length'), 0);
    await evaluate(`
      (() => {
        const app = window.checkersApp;
        window.ProfileManager.select(${JSON.stringify(originalProfileId)});
        app.applyActiveProfile(window.ProfileManager.active());
      })()
    `);
    assert.equal(await evaluate('window.ProfileManager.listNamed().length'), 1);
    assert.equal(await evaluate('window.checkersApp.settings.playerName'), originalPlayerName);

    // ÉTAPE 17 — Ouvrir les puzzles, demander une analyse IA, passer au puzzle
    // suivant et vérifier que le choix est mémorisé. Puis on rétablit le réseau
    // et on vérifie qu'aucune exception JavaScript ne s'est produite.
    console.log('17. Puzzles et analyse de position');
    await evaluate('window.checkersApp.openPuzzles()');
    assert.equal(await evaluate('document.querySelectorAll("#puzzle-board .square").length'), 100);
    await evaluate('document.querySelector("#btn-puzzle-hint").click()');
    await evaluate('document.querySelector("#btn-puzzle-analysis").click()');
    assert.match(await evaluate('document.querySelector("#puzzle-feedback").textContent'), /Analyse IA/);
    const previousPuzzle = await evaluate('document.querySelector("#puzzle-select").value');
    await evaluate('document.querySelector("#btn-puzzle-next").click()');
    assert.notEqual(await evaluate('document.querySelector("#puzzle-select").value'), previousPuzzle);
    assert.equal(await evaluate('JSON.parse(localStorage.getItem("cl2026:puzzle")).data'),
      await evaluate('document.querySelector("#puzzle-select").value'));
    await evaluate('document.querySelector("#modal-puzzles [data-close]").click()');

    await cdp.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: 0,
      downloadThroughput: -1,
      uploadThroughput: -1
    });

    // Bilan : la liste des exceptions doit être vide. Les erreurs de console
    // ne sont qu'affichées (elles ne font pas échouer le test).
    assert.deepEqual(exceptions, [], 'exceptions JavaScript détectées : ' +
      exceptions.map((e) => e.text).join(' | '));
    if (consoleErrors.length) {
      console.log('Avertissements console :');
      consoleErrors.forEach((entry) => console.log(' - ' + entry));
    }

    console.log('\nTests navigateur réussis.');
    console.log('Captures : docs/screenshots/');
  // Le bloc « finally » est TOUJOURS exécuté, même si une étape a échoué.
  // Il sert à nettoyer : fermer la connexion CDP, tuer le navigateur (avec
  // taskkill sous Windows pour être sûr que ses processus enfants partent),
  // arrêter le serveur et supprimer le dossier temporaire.
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

/**
 * Point d'entrée du script : appelle main() et intercepte les erreurs.
 * @param {Error} error - l'erreur qui a fait échouer le parcours, le cas échéant.
 * @returns {void} rien ; on affiche la pile d'appels (stack) pour aider à
 *   comprendre où le problème a eu lieu, puis on fixe un code de sortie d'échec.
 * Notion simple : « .catch() » attrape les promesses rompues. Sans lui, une
 * erreur serait silencieuse ou peu lisible.
 */
main().catch((error) => {
  console.error('\nÉCHEC DU TEST NAVIGATEUR');
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
