/**
 * CHECKERS LEGEND 2026 — Serveur HTTP local
 * ------------------------------------------
 * Sert le jeu avec les bons types MIME pour permettre l'installation PWA
 * et le Service Worker (qui ne fonctionnent pas avec file://).
 *
 * Usage : node scripts/serve.js [port]
 * Puis ouvrir http://localhost:8080
 */

/**
 * POUR UN DÉBUTANT — Rôle, concepts et mode d'emploi
 * --------------------------------------------------
 * Rôle : ce programme est un « serveur HTTP local ». Il rend le dossier du jeu
 * accessible à un navigateur (Chrome, Edge, Firefox…) comme le ferait un site
 * web, mais uniquement sur votre propre machine. C'est nécessaire parce que
 * certaines fonctions modernes (installation PWA et Service Worker) refusent
 * de fonctionner quand on ouvre simplement index.html depuis le disque
 * (adresse de type « file:// »).
 *
 * Concepts utilisés :
 *  - Modules Node « node: » : le préfixe « node: » désigne les bibliothèques
 *    fournies avec Node.js (ici « node:http » pour le serveur web, « node:fs »
 *    pour accéder aux fichiers, « node:path » pour manipuler les chemins).
 *    Rien n'est à installer : tout est déjà dans Node.js.
 *  - Chemin de fichier : « path.resolve » fabrique un chemin absolu (complet)
 *    à partir de « __dirname », le dossier où se trouve ce script. Le code
 *    vérifie ensuite que le fichier demandé reste bien à l'intérieur du projet
 *    (sécurité contre les chemins qui essaieraient d'en sortir).
 *  - Types MIME : un type (par exemple « text/html » ou « image/png ») indique
 *    au navigateur quelle sorte de fichier il reçoit, pour l'afficher
 *    correctement.
 *  - Flux (stream) : au lieu de charger un gros fichier d'un seul coup en
 *    mémoire, « createReadStream » le lit petit à petit et « pipe » (tuyau)
 *    l'envoie au navigateur au fur et à mesure.
 *  - Variables d'environnement : « process.env » récupère des réglages venant
 *    du système (port, hôte) sans avoir à modifier le code.
 *
 * Mode d'emploi simple :
 *  1. Ouvrez un terminal dans le dossier du projet.
 *  2. Tapez : node scripts/serve.js   (ou ajoutez un port, ex. : … 9000).
 *  3. Ouvrez votre navigateur à l'adresse locale indiquée dans le terminal.
 *  4. Appuyez sur Ctrl+C dans le terminal pour arrêter le serveur.
 */
'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

// Dossier racine du projet (le parent de scripts/). Tous les chemins du
// serveur partent de lui, afin de ne jamais servir un fichier extérieur.
const ROOT = path.resolve(__dirname, '..');
// Port TCP d'écoute : d'abord l'argument donné sur la ligne de commande,
// puis la variable d'environnement PORT, sinon 8080. Number() convertit le
// texte reçu en nombre (les arguments de commande sont toujours du texte).
const PORT = Number(process.argv[2] || process.env.PORT || 8080);
// Adresse locale d'écoute : par défaut 127.0.0.1, c'est-à-dire « cette machine
// seulement ». La variable d'environnement HOST peut la remplacer.
const HOST = process.env.HOST || '127.0.0.1';

// Table de correspondance « extension du fichier -> type MIME » (voir l'en-tête).
// Si une extension n'est pas dans cette table, on utilisera le type générique
// « application/octet-stream » (voir la fonction de rappel plus bas).
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.wav': 'audio/wav',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8'
};

/**
 * Envoie une réponse HTTP au navigateur.
 * @param {object} res - la réponse en cours, fournie par le serveur : c'est
 *   l'objet sur lequel on écrit ce que le navigateur va recevoir.
 * @param {number} status - le code de statut HTTP (200 = OK, 404 = introuvable,
 *   400 = requête invalide, 403 = accès interdit).
 * @param {string} body - le contenu (texte) à renvoyer au navigateur.
 * @param {object} [headers] - en-têtes supplémentaires éventuels (métadonnées
 *   placées avant le contenu, par exemple le type MIME). Facultatif.
 * @returns {void} ne renvoie rien : la réponse est écrite directement.
 * Notion simple : « writeHead » prépare l'enveloppe (code + en-têtes) et « end »
 * la ferme en envoyant le contenu. Object.assign fusionne les en-têtes de
 * sécurité par défaut avec ceux reçus en paramètre (les seconds gagnent).
 */
function send(res, status, body, headers) {
  res.writeHead(status, Object.assign({
    'Content-Type': 'text/plain; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer'
  }, headers || {}));
  res.end(body);
}

/**
 * Fonction de rappel appelée par le serveur à chaque demande d'un navigateur.
 * On ne l'appelle pas nous-mêmes : c'est Node.js qui la déclenche (« callback »).
 * @param {object} req - la requête entrante (contient l'adresse demandée).
 * @param {object} res - la réponse à construire (voir la fonction send()).
 * @returns {void} rien ; la réponse part via send() ou via un flux.
 * Étapes : décoder l'adresse, refuser de sortir du projet, vérifier que le
 * fichier existe, choisir son type MIME, puis l'envoyer au navigateur.
 */
const server = http.createServer((req, res) => {
  let pathname;
  // Étape 1 : décoder la partie « chemin » de l'adresse demandée. L'adresse de
  // base utilisée ici ne sert qu'à décoder ; si le décodage échoue, on répond
  // 400 (requête invalide). decodeURIComponent gère les caractères encodés.
  try {
    pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch (error) {
    send(res, 400, 'Requête invalide');
    return;
  }

  // Étape 2 : la racine « / » correspond à la page d'accueil du jeu.
  if (pathname === '/') pathname = '/index.html';

  // Étape 3 : construire le chemin complet du fichier dans le projet.
  const filePath = path.resolve(ROOT, '.' + pathname);
  // Étape 4 (sécurité) : le chemin doit commencer par la racine du projet.
  // Sinon on répond 403 (accès interdit) : c'est la protection contre les
  // chemins du type « .. » qui remontent d'un dossier.
  if (!filePath.startsWith(ROOT + path.sep)) {
    send(res, 403, 'Accès interdit');
    return;
  }

  // Étape 5 : demander à Node des informations sur le fichier (stat = état).
  // C'est une opération asynchrone : on fournit une fonction de rappel qui
  // sera appelée plus tard, quand l'information sera prête.
  fs.stat(filePath, (error, stat) => {
    // S'il y a eu une erreur ou si ce n'est pas un fichier, on répond 404.
    if (error || !stat.isFile()) {
      send(res, 404, 'Ressource introuvable : ' + pathname);
      return;
    }

    // Étape 6 : deviner le type MIME à partir de l'extension du fichier.
    const ext = path.extname(filePath).toLowerCase();
    const headers = {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Content-Length': stat.size,
      'Cache-Control': 'no-cache'
    };
    // Cas spécial du Service Worker : il doit pouvoir couvrir tout le site,
    // et on lui interdit d'être mis en cache pour toujours voir la nouvelle
    // version après une mise à jour.
    if (path.basename(filePath) === 'service-worker.js') {
      headers['Service-Worker-Allowed'] = '/';
      headers['Cache-Control'] = 'no-store';
    }

    // Étape 7 : on écrit l'en-tête 200 (tout va bien), puis on ouvre un flux
    // de lecture sur le fichier. Si le flux échoue, on coupe la connexion.
    // « pipe » connecte la lecture du fichier à l'envoi au navigateur.
    res.writeHead(200, headers);
    const stream = fs.createReadStream(filePath);
    stream.on('error', () => {
      res.destroy();
    });
    stream.pipe(res);
  });
});

/**
 * Fonction de rappel appelée une fois que le serveur écoute réellement le port.
 * @returns {void} rien ; elle affiche seulement trois messages d'information.
 * Notion simple : « listen » démarre le serveur ; le code continue à vivre
 * ensuite et cette fonction est exécutée au bon moment par Node.js.
 */
server.listen(PORT, HOST, () => {
  console.log('CHECKERS LEGEND 2026');
  console.log('Serveur local : http://' + HOST + ':' + PORT);
  console.log('Appuyez sur Ctrl+C pour arrêter.');
});
