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

/**
 * POUR UN DÉBUTANT — Rôle, concepts et mode d'emploi
 * --------------------------------------------------
 * Rôle : c'est la version Firefox du test de fumée navigateur. Elle démarre le
 * serveur local, ouvre le jeu dans Firefox sans fenêtre visible (« headless »),
 * rejoue un parcours en 11 étapes et vérifie qu'il n'y a aucune erreur
 * JavaScript. Aucun pilote externe (geckodriver) ni paquet npm n'est nécessaire.
 *
 * Concepts utilisés :
 *  - Modules Node « node: » : « node:assert/strict » compare des valeurs ;
 *    « node:child_process » lance le serveur et Firefox avec spawn ; « node:fs »
 *    gère fichiers et dossiers ; « node:path » les chemins ; « node:os » le
 *    dossier temporaire. Tout est fourni avec Node.js.
 *  - WebDriver BiDi : c'est le protocole moderne de pilotage des navigateurs
 *    (successeur de WebDriver). Firefox l'intègre directement. On lui envoie
 *    des ordres comme « session.new », « browsingContext.navigate » ou
 *    « script.evaluate » pour créer une session, naviguer et exécuter du code.
 *  - WebSocket : canal de communication bidirectionnel (les deux côtés peuvent
 *    parler). Le WebSocket natif de Node suffit ; chaque message est du JSON.
 *  - Promesses et async/await : une promesse est un résultat futur ; « await »
 *    attend ce résultat sans bloquer le programme. Indispensable ici puisque
 *    le navigateur répond quand il veut.
 *  - fetch : une requête vers notre serveur local (adresse 127.0.0.1) pour
 *    attendre qu'il soit prêt avant de continuer.
 *  - base64 : la capture d'écran arrive encodée en texte ; Buffer.from(...,
 *    'base64') la convertit en fichier image PNG.
 *
 * Mode d'emploi simple :
 *  1. Installez Firefox (version 160 ou plus récente).
 *  2. Tapez : node scripts/browser-smoke-test-firefox.js
 *  3. Si Firefox est installé ailleurs, indiquez son chemin avec la variable
 *     d'environnement FIREFOX_PATH. Le port peut changer via FF_TEST_PORT.
 */
'use strict';

const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

// Dossier racine du projet (parent de scripts/).
const ROOT = path.resolve(__dirname, '..');
// Port du serveur de test : variable FF_TEST_PORT sinon 8125 (différent de
// celui du test Edge/Chrome pour pouvoir lancer les deux en même temps).
const PORT = Number(process.env.FF_TEST_PORT || 8125);
// Adresse locale du jeu : 127.0.0.1 signifie « cette machine uniquement ».
const BASE = 'http://127.0.0.1:' + PORT + '/';
// Dossier des captures d'écran, dans la documentation du projet.
const SHOTS = path.join(ROOT, 'docs', 'screenshots');
// Profil Firefox temporaire et unique (process.pid = numéro de ce programme),
// supprimé à la fin du test.
const TEMP = path.join(os.tmpdir(), 'cl2026-firefox-' + process.pid);

// Emplacements possibles de Firefox, essayés dans l'ordre. La variable
// d'environnement FIREFOX_PATH est prioritaire ; filter(Boolean) enlève les
// entrées vides (quand la variable n'est pas définie).
const CANDIDATES = [
  process.env.FIREFOX_PATH,
  'C:\\Program Files\\Mozilla Firefox\\firefox.exe',
  'C:\\Program Files (x86)\\Mozilla Firefox\\firefox.exe',
  '/usr/bin/firefox',
  '/Applications/Firefox.app/Contents/MacOS/firefox'
].filter(Boolean);

// Pause de « ms » millisecondes, sous forme de promesse : on l'utilise avec
// « await sleep(300) » pour laisser le temps à la page de réagir.
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Attend qu'une condition devienne vraie en réessayant toutes les 100 ms.
 * @param {Function} fn - fonction à appeler ; sa valeur de retour est la
 *   condition à surveiller.
 * @param {number} timeout - délai maximum en millisecondes.
 * @param {string} label - nom de l'étape, pour le message d'erreur.
 * @returns {Promise<void>} promesse tenue quand la condition est remplie.
 * Notion simple : une « boucle d'attente ». On ne suppose jamais qu'un serveur
 * ou un navigateur démarre instantanément ; on vérifie régulièrement.
 */
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

/**
 * Trouve le chemin de Firefox installé sur la machine.
 * @returns {string} chemin complet vers l'exécutable de Firefox.
 * @throws {Error} si aucun emplacement connu n'existe (penser à FIREFOX_PATH).
 * Notion simple : .find() parcourt la liste et renvoie le premier élément pour
 * lequel fs.existsSync répond « oui, ce fichier existe ».
 */
function findBrowser() {
  const found = CANDIDATES.find((candidate) => fs.existsSync(candidate));
  if (!found) throw new Error('Firefox introuvable (définir FIREFOX_PATH).');
  return found;
}

/** Client WebDriver BiDi minimal, basé sur le WebSocket global de Node. */
/**
 * Petit client pour le protocole WebDriver BiDi (le langage utilisé pour
 * piloter Firefox). C'est une « classe » : un modèle d'objet ; on en crée une
 * instance avec new BiDi(ws).
 * Notion simple : comme pour CDP, chaque ordre reçoit un numéro (id). On garde
 * les promesses en attente dans « pending » ; quand une réponse arrive avec ce
 * numéro, on sait à quelle demande elle correspond. Les événements (erreurs de
 * console par exemple) sont distribués aux fonctions inscrites dans « listeners ».
 */
class BiDi {
  /**
   * Crée le client à partir d'un WebSocket déjà ouvert.
   * @param {WebSocket} ws - la connexion vers Firefox.
   * @returns {void} un constructeur ne renvoie rien ; il prépare les champs :
   *   ws = connexion, nextId = prochain numéro, pending = demandes en attente,
   *   listeners = fonctions à appeler quand un événement arrive.
   * Notion simple : dès la création, on s'abonne au message entrant pour
   * decoder le JSON (texte structuré) et aiguiller la réponse.
   */
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

  /**
   * Envoie un ordre BiDi à Firefox et attend sa réponse.
   * @param {string} method - nom de la commande (ex. : « session.new »).
   * @param {object} [params] - paramètres de la commande ; {} par défaut.
   * @returns {Promise<object>} promesse contenant la réponse complète (avec
   *   son champ « type » : « success » ou « error »).
   * Notion simple : on incrémente un compteur pour obtenir un identifiant
   * unique, on mémorise la fonction « resolve », puis on envoie le tout en JSON.
   * Une sécurité (setTimeout de 30 s, avec .unref() pour ne pas bloquer la
   * fermeture du programme) évite d'attendre indéfiniment une réponse perdue.
   */
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

  /**
   * Ajoute un écouteur pour les événements envoyés par Firefox.
   * @param {Function} listener - fonction appelée avec chaque message-événement.
   * @returns {void} rien ; l'écouteur est ajouté à la liste.
   * Notion simple : le constructeur distingue les réponses (avec un id) des
   * événements (avec une method) ; ces derniers sont envoyés à tous les
   * écouteurs enregistrés ici.
   */
  on(listener) { this.listeners.push(listener); }

  /**
   * Ferme la connexion WebSocket.
   * @returns {void} rien ; l'erreur est ignorée si la connexion n'existe plus.
   */
  close() {
    try { this.ws.close(); } catch (error) { /* ignoré */ }
  }
}

/**
 * Déroule tout le parcours de test Firefox, étape par étape.
 * @returns {Promise<void>} promesse tenue quand le test est terminé.
 * Notion simple : c'est le chef d'orchestre. Il lance le serveur puis Firefox,
 * ouvre une session BiDi, enchaîne les 11 étapes, puis libère tout dans le bloc
 * « finally » (même si quelque chose a échoué entre-temps).
 */
async function main() {
  const firefox = findBrowser();
  fs.mkdirSync(SHOTS, { recursive: true });
  fs.mkdirSync(TEMP, { recursive: true });

  let browser = null;
  let server = null;
  let bidi = null;

  try {
    // Lancer le serveur local du projet dans un autre processus, puis attendre
    // qu'il réponde (fetch sur l'adresse locale) avant de continuer.
    server = spawn(process.execPath, [path.join(ROOT, 'scripts', 'serve.js'), String(PORT)], {
      cwd: ROOT, stdio: 'ignore'
    });
    await waitFor(async () => {
      try { return (await fetch(BASE + 'index.html')).ok; } catch (error) { return false; }
    }, 10000, 'serveur local');

    // Lancer Firefox sans fenêtre avec un profil temporaire. Le port du serveur
    // BiDi est choisi automatiquement (0) et écrit dans un fichier du profil.
    browser = spawn(firefox, [
      '--headless', '--no-remote', '--profile', TEMP,
      '--remote-debugging-port=0', 'about:blank'
    ], { stdio: ['ignore', 'pipe', 'pipe'] });

    // Attendre le fichier « WebDriverBiDiServer.json » créé par Firefox et lire
    // son champ ws_port : c'est le numéro du port du serveur WebDriver BiDi.
    let port = 0;
    await waitFor(() => {
      const file = path.join(TEMP, 'WebDriverBiDiServer.json');
      if (!fs.existsSync(file)) return false;
      try { port = JSON.parse(fs.readFileSync(file, 'utf8')).ws_port; } catch (error) { return false; }
      return !!port;
    }, 20000, 'serveur WebDriver BiDi de Firefox');

    // Ouvrir le WebSocket vers le serveur BiDi de Firefox, puis attendre qu'il
    // soit ouvert (ou signaler une erreur). C'est notre « ligne téléphonique ».
    const ws = new WebSocket('ws://127.0.0.1:' + port + '/session');
    await new Promise((resolve, reject) => {
      ws.addEventListener('open', resolve, { once: true });
      ws.addEventListener('error', reject, { once: true });
    });
    bidi = new BiDi(ws);

    // Étape préliminaire : créer une session de pilotage en précisant qu'on
    // veut Firefox. Sans session, aucun ordre BiDi ne peut être exécuté.
    const opened = await bidi.send('session.new', {
      capabilities: { alwaysMatch: { browserName: 'firefox' } }
    });
    assert.equal(opened.type, 'success', 'session.new a échoué');

    // S'abonner aux événements « log.entryAdded » pour repérer les erreurs de
    // console. On demande ensuite à Firefox de nous les envoyer (subscribe).
    const logs = [];
    bidi.on((message) => {
      if (message.method === 'log.entryAdded' && message.params &&
          message.params.entry && message.params.entry.level === 'error') {
        logs.push(message.params.entry.text);
      }
    });
    await bidi.send('session.subscribe', { events: ['log.entryAdded'] });

    // Récupérer l'arbre des onglets (browsingContext) et garder l'identifiant
    // du premier : c'est la « cible » sur laquelle on va agir ensuite.
    const tree = await bidi.send('browsingContext.getTree', {});
    const context = tree.result.contexts[0].context;

    /**
     * Exécute du code JavaScript dans la page et renvoie sa valeur.
     * @param {string} expression - code à exécuter ; il doit se terminer par
     *   « return … » car il est placé dans une fonction asynchrone.
     * @returns {Promise<*>} promesse contenant la valeur renvoyée par la page.
     * Notion simple : c'est la télécommande. On utilise la commande
     * « script.evaluate » ; awaitPromise attend les opérations asynchrones et
     * returnByValue demande une vraie valeur. Si la page lève une exception,
     * on la transforme en erreur lisible.
     */
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

    /**
     * Ouvre le jeu et attend qu'il soit prêt, puis installe des pièges à
     * erreurs dans la page pour détecter les exceptions pendant le parcours.
     * @returns {Promise<void>} promesse tenue quand l'application est prête.
     */
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

    /**
     * Prend une capture d'écran et l'écrit dans le dossier des captures.
     * @param {string} name - nom du fichier PNG à créer.
     * @returns {Promise<void>} promesse tenue quand le fichier est enregistré.
     * Notion simple : BiDi renvoie l'image en base64 (texte) ; Buffer.from la
     * convertit en octets avant l'écriture sur le disque.
     */
    const screenshot = async (name) => {
      const response = await bidi.send('browsingContext.captureScreenshot', {
        context, format: { type: 'png' }
      });
      assert.equal(response.type, 'success', 'capture impossible');
      fs.writeFileSync(path.join(SHOTS, name), Buffer.from(response.result.data, 'base64'));
    };

    // ÉTAPE 1 — Ouvrir l'accueil, vérifier l'écran actif et les boutons du menu,
    // puis enregistrer une capture d'écran. Le numéro de version est affiché.
    console.log('1. Chargement de l’accueil (Firefox ' +
      opened.result.capabilities.browserVersion + ')');
    await load();
    assert.equal(await evaluate('return document.querySelector("#screen-home").classList.contains("is-active");'), true);
    assert.ok((await evaluate('return document.querySelectorAll(".menu-btn").length;')) >= 8);
    await screenshot('firefox-01-accueil.png');

    // ÉTAPE 2 — Ouvrir les paramètres, changer le thème puis le réinitialiser,
    // et vérifier que la valeur revient à celle de départ.
    console.log('2. Paramètres et thèmes');
    await evaluate('document.querySelector("#btn-settings").click(); return true;');
    assert.equal(await evaluate('return document.querySelector("#modal-settings").classList.contains("hidden");'), false);
    await evaluate('document.querySelector("#set-theme").value = "midnight"; document.querySelector("#set-theme").dispatchEvent(new Event("change", {bubbles:true})); return true;');
    assert.equal(await evaluate('return window.checkersApp.settings.theme;'), 'midnight');
    await evaluate('document.querySelector("#btn-reset-settings").click(); return true;');
    assert.equal(await evaluate('return window.checkersApp.settings.theme;'), 'neon');
    await evaluate('document.querySelector("#modal-settings [data-close]").click(); return true;');

    // ÉTAPE 3 — Ouvrir puis fermer les fenêtres modales « comment jouer » et
    // « succès » en passant par les boutons de l'interface.
    console.log('3. Modales');
    await evaluate('document.querySelector("#btn-howto").click(); return true;');
    assert.equal(await evaluate('return document.querySelector("#modal-howto").classList.contains("hidden");'), false);
    await evaluate('document.querySelector("#modal-howto [data-close]").click(); return true;');
    await evaluate('document.querySelector("#btn-achievements").click(); return true;');
    assert.ok((await evaluate('return document.querySelectorAll("#achievements-grid > *").length;')) >= 6);
    await evaluate('document.querySelector("#modal-achievements [data-close]").click(); return true;');

    // ÉTAPE 4 — Démarrer une partie contre l'IA, jouer un coup via l'API du jeu
    // (onSquareClick) et attendre que l'IA réponde.
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

    // ÉTAPE 5 — Sauvegarder la partie, recharger la page puis cliquer sur
    // « reprendre » : l'historique des coups doit être identique.
    console.log('5. Sauvegarde et reprise après rechargement');
    await waitFor(() => evaluate('return !window.checkersApp.aiThinking && !window.checkersApp.busy;'), 10000, 'IA prête');
    await evaluate('window.checkersApp.saveGame(); return true;');
    const before = await evaluate('return window.checkersApp.engine.history.length;');
    await load();
    await evaluate('document.querySelector("#btn-resume").click(); return true;');
    await waitFor(() => evaluate('return window.checkersApp.gameActive;'), 5000, 'reprise');
    assert.equal(await evaluate('return window.checkersApp.engine.history.length;'), before);

    // ÉTAPE 6 — Mettre en pause, reprendre, puis annuler un coup et vérifier
    // que l'historique a bien régressé d'un cran.
    console.log('6. Pause et annulation');
    await evaluate('window.checkersApp.togglePause(true); return true;');
    assert.equal(await evaluate('return window.checkersApp.paused;'), true);
    await evaluate('window.checkersApp.togglePause(false); return true;');
    await evaluate('window.checkersApp.undoMove(); return true;');
    assert.ok((await evaluate('return window.checkersApp.engine.history.length;')) < before);

    // ÉTAPE 7 — Lancer une partie à deux joueurs, puis une partie où l'on a les
    // Noirs : le plateau doit se retourner automatiquement.
    console.log('7. Mode deux joueurs et orientation');
    await evaluate('window.checkersApp.startGame({mode:"pvp",timerMinutes:10}); return true;');
    assert.equal(await evaluate('return window.checkersApp.engine.mode;'), 'pvp');
    await evaluate('window.checkersApp.startGame({mode:"ai",difficulty:"easy",playerColor:"black",timerMinutes:10}); return true;');
    assert.equal(await evaluate('return window.checkersApp.getFlipped();'), true);

    // ÉTAPE 8 — Réduire la fenêtre à une taille de téléphone (390 x 844) via
    // BiDi, vérifier l'absence de défilement horizontal, puis la restaurer.
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

    // ÉTAPE 9 — Vérifier que le Service Worker contrôle bien la page et que le
    // cache du navigateur existe (condition du fonctionnement hors ligne).
    console.log('9. Service Worker et cache hors ligne');
    await load();
    await waitFor(() => evaluate('return !!navigator.serviceWorker && !!navigator.serviceWorker.controller;'), 10000, 'Service Worker contrôlant la page');
    assert.equal(await evaluate('return !!caches;'), true);

    // ÉTAPE 10 — Créer un profil appelé « Firefox » et vérifier qu'il n'hérite
    // pas des parties nommées du profil précédent.
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

    // ÉTAPE 11 — Ouvrir les puzzles, lancer une analyse IA, changer de puzzle,
    // puis faire le bilan : aucune exception et aucune erreur de console.
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
  // Ce bloc est exécuté dans TOUS les cas (succès ou erreur) : il ferme la
  // session BiDi, tue Firefox (taskkill sous Windows pour les processus
  // enfants), arrête le serveur et supprime le dossier temporaire.
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

/**
 * Point d'entrée : lance main() et récupère les erreurs éventuelles.
 * @param {Error} error - l'erreur qui a interrompu le parcours.
 * @returns {void} rien ; on affiche la pile d'appels pour situer le problème
 *   et on fixe un code de sortie d'échec.
 */
main().catch((error) => {
  console.error('\nÉCHEC DU TEST NAVIGATEUR FIREFOX');
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
