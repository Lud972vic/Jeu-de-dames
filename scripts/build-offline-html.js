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
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'dist');
const OUT_FILE = path.join(OUT_DIR, 'checkers-legend-offline.html');

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

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function toPosix(value) {
  return value.split(path.sep).join('/').replace(/\\/g, '/');
}

function dataUri(rel) {
  const clean = path.posix.normalize(toPosix(rel));
  const abs = path.join(ROOT, clean);
  const ext = path.extname(abs).toLowerCase();
  const mime = MIME[ext] || 'application/octet-stream';
  const base64 = fs.readFileSync(abs).toString('base64');
  return 'data:' + mime + ';base64,' + base64;
}

/** Remplace les url(...) relatives d'une feuille de style par des data URI. */
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
function safeInlineScript(code) {
  return code.replace(/<\/script/gi, '<\\/script');
}

function main() {
  console.log('Construction de la version autonome…');

  let html = read('index.html');

  // 1. Feuilles de style -> <style> avec polices intégrées.
  html = html.replace(/<link\s+rel="stylesheet"\s+href="([^"]+)"\s*\/?>/gi, (match, href) => {
    console.log('  CSS  ' + href);
    const css = inlineCssUrls(read(href), href);
    return '<style>\n' + css + '\n</style>';
  });

  // 2. Manifeste et icônes : inutiles / bloqués en fichier local.
  html = html.replace(/<link\s+rel="manifest"[^>]*\/?>\s*/gi, '');
  html = html.replace(/(<link[^>]+href=")assets\/images\/icon-192\.png(")/gi,
    (_m, before, after) => before + dataUri('assets/images/icon-192.png') + after);
  html = html.replace(/(<img[^>]+src=")assets\/images\/logo\.svg(")/gi,
    (_m, before, after) => before + dataUri('assets/images/logo.svg') + after);

  // 3. Scripts -> <script> en ligne, dans le même ordre que index.html.
  const scriptTags = [];
  html = html.replace(/<script\s+src="([^"]+)"\s*><\/script>/gi, (match, src) => {
    console.log('  JS   ' + src);
    let code = read(src);

    // Sons : fetch(data:) fonctionne en local, fetch(assets/...) non.
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

  html = html.replace('<!-- ===================== SCRIPTS ===================== -->',
    () => '<!-- ===================== SCRIPTS ===================== -->\n' + bootstrap);

  const scriptsBlock = scriptTags.join('\n\n');
  // Fonction de remplacement : évite que "$$" dans le code soit interprété
  // comme un échappement de replacement par String.replace().
  html = html.replace('</body>', () => '<script>\n' + safeInlineScript(scriptsBlock) + '\n</script>\n</body>');

  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT_FILE, html, 'utf8');

  const kb = (Buffer.byteLength(html, 'utf8') / 1024).toFixed(0);
  console.log('\nTerminé : ' + path.relative(ROOT, OUT_FILE) + ' (' + kb + ' Ko)');
  console.log('Copiez CE fichier sur le téléphone et ouvrez-le avec Chrome.');
}

main();
