/**
 * CHECKERS LEGEND 2026 — Build « fichier unique » hors ligne
 * -----------------------------------------------------------
 * Produit dist/checkers-legend-offline.html : UNE SEULE page HTML qui contient
 * tout le code, les styles, les polices, les images, les sons et le Web Worker.
 *
 * Utile sur Android quand on copie le jeu sur le téléphone : Chrome bloque le
 * chargement des fichiers voisins en file:// (scripts, CSS, polices, images).
 * Ici il n'y a plus aucun fichier voisin à charger -> la page s'ouvre directement.
 *
 * Usage : node scripts/build-offline-html.js   (ou npm run build:offline)
 */

/**
 * POUR UN DÉBUTANT — Rôle, concepts et mode d'emploi
 * --------------------------------------------------
 * Rôle : ce programme « compile » le jeu en UNE SEULE page HTML autonome,
 * écrite dans dist/checkers-legend-offline.html. Tout est collé dedans : le
 * code JavaScript, les styles CSS, les polices, les images, les sons et même le
 * Web Worker. Le fichier résultant peut être copié sur un téléphone et ouvert
 * directement, sans serveur et sans connexion.
 *
 * Concepts utilisés :
 *  - Modules Node : « fs » lit et écrit des fichiers, « path » construit les
 *    chemins (avec le bon séparateur Windows/Linux). Ce sont des modules
 *    intégrés à Node.js, rien à installer.
 *  - Chemin de fichier : path.join assemble la racine du projet et un chemin
 *    relatif ; __dirname est le dossier où se trouve ce script.
 *  - base64 et data URI : intégrer une image dans une page se fait en la
 *    convertissant en texte (base64) puis en l'insérant dans une « data URI »
 *    (par exemple « data:image/png;base64,... »). Le navigateur la comprend
 *    comme si c'était un vrai fichier.
 *  - Expressions régulières (regex) : des motifs comme /<script…>/gi servent
 *    à repérer et remplacer des bouts de texte dans le HTML. Le « g » signifie
 *    « toutes les occurrences » et le « i » « sans tenir compte de la casse ».
 *  - Blob et URL.createObjectURL : le Web Worker est normalement un fichier
 *    séparé. Ici on reconstruit son code à partir de plusieurs fichiers, on le
 *    met dans un Blob (un petit fichier en mémoire) et on crée une adresse
 *    temporaire pour que le navigateur puisse le lancer quand même.
 *  - « file:// » : c'est l'adresse d'un fichier ouvert depuis le disque. Chrome
 *    interdit d'y charger les fichiers voisins ; d'où l'intérêt de tout mettre
 *    dans un seul fichier.
 *
 * Mode d'emploi simple :
 *  1. Tapez : node scripts/build-offline-html.js
 *  2. Copiez le fichier dist/checkers-legend-offline.html sur le téléphone.
 *  3. Ouvrez-le avec Chrome : tout fonctionne hors ligne.
 */
'use strict';

const fs = require('fs');
const path = require('path');

// Racine du projet, dossier de sortie « dist », puis chemin complet du fichier
// final. Toutes les lectures se font depuis ROOT pour éviter les erreurs de
// chemin quand on lance le script depuis un autre dossier.
const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'dist');
const OUT_FILE = path.join(OUT_DIR, 'checkers-legend-offline.html');

// Table « extension -> type MIME ». Elle sert à écrire le début de chaque data
// URI (par exemple une police .woff2 devient « font/woff2 »). Si l'extension
// est inconnue, on utilise le type générique « application/octet-stream ».
const MIME = {
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.ico': 'image/x-icon'
};

/**
 * Lit un fichier texte du projet.
 * @param {string} rel - chemin relatif depuis la racine (ex. : 'index.html').
 * @returns {string} le contenu du fichier, décodé en UTF-8.
 * Notion simple : readFileSync est « synchrone » : le programme attend la fin
 * de la lecture avant de continuer. Ici c'est pratique car on a besoin du
 * contenu tout de suite.
 */
function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

/**
 * Convertit un chemin Windows en chemin « POSIX » (avec des /).
 * @param {string} value - chemin à convertir.
 * @returns {string} le même chemin avec des slashs.
 * Notion simple : Windows utilise « \\ » et les autres systèmes « / ». Les
 * URL et les chemins relatifs dans le CSS utilisent « / », donc on normalise.
 */
function toPosix(value) {
  return value.split(path.sep).join('/').replace(/\\/g, '/');
}

/**
 * Transforme un fichier binaire en data URI (contenu intégré dans la page).
 * @param {string} rel - chemin relatif du fichier depuis la racine.
 * @returns {string} une chaîne de la forme « data:<type mime>;base64,<texte> ».
 * Notion simple : toString('base64') encode les octets en texte ; on fait
 * précéder ce texte du type MIME pour que le navigateur sache de quel genre
 * de fichier il s'agit.
 */
function dataUri(rel) {
  const clean = path.posix.normalize(toPosix(rel));
  const abs = path.join(ROOT, clean);
  const ext = path.extname(abs).toLowerCase();
  const mime = MIME[ext] || 'application/octet-stream';
  const base64 = fs.readFileSync(abs).toString('base64');
  return 'data:' + mime + ';base64,' + base64;
}

/** Remplace les url(...) relatives d'une feuille de style par des data URI. */
/**
 * Intègre dans le CSS toutes les ressources locales qu'il référence.
 * @param {string} cssText - contenu de la feuille de style.
 * @param {string} cssRelPath - chemin de cette feuille, pour résoudre les
 *   chemins relatifs (une image « ../images/x.png » est relative au CSS).
 * @returns {string} le CSS modifié, avec des data URI à la place des fichiers.
 * Notion simple : la regex repère « url(...) ». Les adresses déjà spéciales
 * (data:, blob:, # ancre…) sont laissées telles quelles. Pour les autres, on
 * reconstruit le chemin, on vérifie que le fichier existe, puis on appelle
 * dataUri(). Si le fichier manque, on prévient et on ne change rien.
 */
function inlineCssUrls(cssText, cssRelPath) {
  const dir = toPosix(cssRelPath).split('/').slice(0, -1).join('/');
  return cssText.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g, (match, _quote, value) => {
    if (/^(data:|https?:|blob:|#)/i.test(value)) return match;
    const cleanValue = value.split(/[?#]/)[0];
    const rel = path.posix.normalize(dir ? dir + '/' + cleanValue : cleanValue);
    if (!fs.existsSync(path.join(ROOT, rel))) {
      console.warn('  ! ressource CSS introuvable : ' + rel + ' (laissée telle quelle)');
      return match;
    }
    return 'url("' + dataUri(rel) + '")';
  });
}

/** Échappe les séquences qui fermeraient prématurément une balise <script>. */
/**
 * Protège le HTML quand on colle du JavaScript dans une balise <script>.
 * @param {string} code - code JavaScript à intégrer.
 * @returns {string} le même code avec les « </script » remplacés par « <\/script ».
 * Notion simple : si le code contient la chaîne « </script », le navigateur
 * croirait que la balise se termine et le reste serait lu comme du HTML.
 * Ajouter un anti-slash devant le « / » ne change rien au JavaScript mais
 * empêche cette fermeture prématurée.
 */
function safeInlineScript(code) {
  return code.replace(/<\/script/gi, '<\\/script');
}

/**
 * Construit la page autonome étape par étape et l'écrit sur le disque.
 * @returns {void} rien ; le fichier dist/checkers-legend-offline.html est créé.
 * Notion simple : c'est le chef d'orchestre. Il lit index.html, remplace
 * successivement les liens CSS, les images, les scripts, ajoute un petit
 * programme d'amorçage pour les sons et le Worker, puis enregistre le résultat.
 */
function main() {
  console.log('Construction de la version autonome…');

  let html = read('index.html');

  // 1. Feuilles de style -> <style> avec polices intégrées.
  // On remplace chaque balise <link rel="stylesheet"> par une balise <style>
  // contenant directement le CSS (et, grâce à inlineCssUrls, les polices).
  html = html.replace(/<link\s+rel="stylesheet"\s+href="([^"]+)"\s*\/?>/gi, (match, href) => {
    console.log('  CSS  ' + href);
    const css = inlineCssUrls(read(href), href);
    return '<style>\n' + css + '\n</style>';
  });

  // 2. Manifeste et icônes : inutiles / bloqués en fichier local.
  // Le manifeste n'a aucun sens pour un fichier unique, donc on le supprime.
  // Les deux images (icône et logo) sont converties en data URI pour rester visibles.
  html = html.replace(/<link\s+rel="manifest"[^>]*\/?>\s*/gi, '');
  html = html.replace(/(<link[^>]+href=")assets\/images\/icon-192\.png(")/gi,
    (_m, before, after) => before + dataUri('assets/images/icon-192.png') + after);
  html = html.replace(/(<img[^>]+src=")assets\/images\/logo\.svg(")/gi,
    (_m, before, after) => before + dataUri('assets/images/logo.svg') + after);
  // Le GIF de démonstration de l'accueil doit lui aussi être intégré.
  html = html.replace(/(<img[^>]+src=")assets\/images\/carnage-demo\.gif(")/gi,
    (_m, before, after) => before + dataUri('assets/images/carnage-demo.gif') + after);

  // 3. Scripts -> <script> en ligne, dans le même ordre que index.html.
  // L'ordre est essentiel : un script peut utiliser ce que le précédent a créé.
  // On retire les balises <script src="…"> et on garde leur code dans scriptTags.
  const scriptTags = [];
  html = html.replace(/<script\s+src="([^"]+)"\s*><\/script>/gi, (match, src) => {
    console.log('  JS   ' + src);
    let code = read(src);

    // Sons : fetch(data:) fonctionne en local, fetch(assets/...) non.
    // On modifie donc une ligne du code du gestionnaire audio pour qu'il aille
    // chercher les sons dans la table __CL_OFFLINE_SOUNDS__ (créée à l'étape 4).
    if (src === 'js/audio-manager.js') {
      code = code.replace(
        "const url = 'assets/sounds/' + name + '.wav';",
        "const url = (global.__CL_OFFLINE_SOUNDS__ && global.__CL_OFFLINE_SOUNDS__[name])" +
        " || 'assets/sounds/' + name + '.wav';"
      );
    }
    scriptTags.push('  /* ' + src + ' */\n' + code);
    return '';
  });

  // 4. Amorçage : sons intégrés + Worker reconstruit depuis un Blob.
  // soundMap associe le nom de chaque son à sa data URI ; workerSource rassemble
  // le code de configuration, des règles, de l'IA et du Worker en un seul texte.
  const soundMap = {};
  for (const name of ['move', 'capture', 'promote', 'victory', 'click', 'invalid', 'draw']) {
    soundMap[name] = dataUri('assets/sounds/' + name + '.wav');
  }

  const workerSource = [
    read('config/game-config.js'),
    read('js/game-rules.js'),
    read('js/ai-engine.js'),
    read('js/ai-worker.js').replace(/^\s*importScripts\([^;]*\);\s*$/m, '')
  ].join('\n\n');

  // Ce petit programme est inséré avant les scripts du jeu. Il remplace
  // temporairement window.Worker : quand le jeu demandera « ai-worker.js »,
  // on lui donnera un Worker fabriqué à partir du code contenu dans un Blob.
  // Les autres Workers (s'il y en a) restent normaux.
  const bootstrap = [
    '<script>',
    'window.__CL_OFFLINE_SOUNDS__ = ' + JSON.stringify(soundMap) + ';',
    '(function () {',
    '  var NativeWorker = window.Worker;',
    '  if (!NativeWorker) return;',
    '  var source = ' + JSON.stringify(workerSource) + ';',
    '  var blobUrl = null;',
    '  window.Worker = function (url) {',
    '    if (typeof url === "string" && url.indexOf("ai-worker.js") !== -1) {',
    '      try {',
    '        if (!blobUrl) {',
    '          blobUrl = URL.createObjectURL(new Blob([source], { type: "text/javascript" }));',
    '        }',
    '        return new NativeWorker(blobUrl);',
    '      } catch (e) { /* repli thread principal dans script.js */ }',
    '    }',
    '    return new NativeWorker(url);',
    '  };',
    '  window.Worker.prototype = NativeWorker.prototype;',
    '})();',
    '</script>'
  ].join('\n');

  // Insertion de l'amorçage à l'endroit réservé aux scripts dans index.html.
  // On utilise une fonction de remplacement pour éviter que « $ » dans le code
  // soit interprété comme un échappement spécial par String.replace().
  html = html.replace('<!-- ===================== SCRIPTS ===================== -->',
    () => '<!-- ===================== SCRIPTS ===================== -->\n' + bootstrap);

  const scriptsBlock = scriptTags.join('\n\n');
  // Fonction de remplacement : évite que "$$" dans le code soit interprété
  // comme un échappement de replacement par String.replace().
  html = html.replace('</body>', () => '<script>\n' + safeInlineScript(scriptsBlock) + '\n</script>\n</body>');

  // Dernière étape : créer le dossier dist s'il manque, écrire le fichier,
  // puis indiquer sa taille (byteLength / 1024 = nombre de kilo-octets).
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT_FILE, html, 'utf8');

  const kb = (Buffer.byteLength(html, 'utf8') / 1024).toFixed(0);
  console.log('\nTerminé : ' + path.relative(ROOT, OUT_FILE) + ' (' + kb + ' Ko)');
  console.log('Copiez CE fichier sur le téléphone et ouvrez-le avec Chrome.');
}

// Point d'entrée : il n'y a qu'une seule chose à faire, lancer la construction.
main();
