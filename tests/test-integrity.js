/**
 * CHECKERS LEGEND 2026 — Tests d'intégrité du projet
 * ---------------------------------------------------
 * Vérifie les livrables, l'absence de CDN, la validité des références
 * locales, la syntaxe JavaScript, le manifeste PWA et le cache offline.
 * Exécution : node --test tests/test-integrity.js
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), 'utf8');
const exists = (relative) => fs.existsSync(path.join(ROOT, relative));

const html = read('index.html');
const css = read('style.css');
const script = read('script.js');

test('Livrables obligatoires présents et non vides', () => {
  const required = [
    'index.html', 'style.css', 'script.js',
    'config/game-config.js', 'js/game-rules.js', 'js/game-engine.js',
    'js/ai-engine.js', 'js/ai-worker.js', 'js/board-renderer.js',
    'js/puzzles.js',
    'js/animations.js', 'js/particles-background.js',
    'js/audio-manager.js', 'js/storage-manager.js', 'js/profile-manager.js',
    'js/settings-manager.js', 'js/statistics.js',
    'tests/test-particles.js', 'tests/test-profiles.js',
    'manifest.json', 'service-worker.js', 'README.md', 'docs/TEST_REPORT.md',
    'vendor/bootstrap/css/bootstrap.min.css',
    'vendor/bootstrap/js/bootstrap.bundle.min.js',
    'assets/fonts/fonts.css', 'assets/images/icon-192.png',
    'assets/images/icon-512.png', 'assets/images/logo.svg',
    'assets/sounds/move.wav', 'assets/sounds/capture.wav',
    'assets/sounds/victory.wav', 'assets/sounds/draw.wav'
  ];
  for (const file of required) {
    assert.ok(exists(file), 'fichier manquant : ' + file);
    assert.ok(fs.statSync(path.join(ROOT, file)).size > 0, 'fichier vide : ' + file);
  }
});

test('Aucune dépendance distante (CDN, API, police en ligne)', () => {
  // Le lien GitHub du pied de page est un lien utilisateur, pas une ressource chargée.
  const htmlSansLiensUtilisateur = html.replace(
    /href\s*=\s*["']https:\/\/github\.com\/Lud972vic["']/gi, 'href="#"'
  );
  assert.doesNotMatch(htmlSansLiensUtilisateur, /(?:src|href)\s*=\s*["'](?:https?:)?\/\//i,
    'une ressource distante est référencée dans index.html');
  assert.doesNotMatch(html, /cdn\./i, 'référence CDN détectée');
  assert.doesNotMatch(css, /url\(\s*["']?(?:https?:)?\/\//i,
    'une URL distante est utilisée dans style.css');
  assert.doesNotMatch(script, /fetch\(\s*["']https?:/i,
    'un appel réseau distant est présent dans script.js');
  assert.doesNotMatch(read('js/ai-worker.js'), /importScripts\([^)]*https?:/i);
});

test('Toutes les références locales de index.html existent', () => {
  const attr = /(?:src|href)\s*=\s*["']([^"']+)["']/gi;
  let match;
  while ((match = attr.exec(html))) {
    const ref = match[1].trim();
    if (!ref || /^(?:#|data:|mailto:|javascript:)/i.test(ref) || /^https?:/i.test(ref)) continue;
    const clean = ref.split('?')[0].split('#')[0];
    assert.ok(exists(clean), 'référence locale introuvable : ' + clean);
  }
});

test('Toutes les ressources url() de style.css existent', () => {
  const url = /url\(\s*["']?([^"')]+)["']?\s*\)/gi;
  let match;
  while ((match = url.exec(css))) {
    const ref = match[1].trim();
    if (!ref || /^(?:data:|https?:)/i.test(ref)) continue;
    const clean = ref.split('?')[0].split('#')[0];
    assert.ok(exists(clean), 'ressource CSS introuvable : ' + clean);
  }
});

test('Syntaxe JavaScript valide pour tous les modules', () => {
  const files = [
    'script.js', 'service-worker.js',
    'config/game-config.js', 'js/game-rules.js', 'js/game-engine.js',
    'js/ai-engine.js', 'js/ai-worker.js', 'js/board-renderer.js',
    'js/puzzles.js',
    'js/animations.js', 'js/particles-background.js',
    'js/audio-manager.js', 'js/storage-manager.js', 'js/profile-manager.js',
    'js/settings-manager.js', 'js/statistics.js',
    'scripts/serve.js'
  ];
  for (const file of files) {
    const result = spawnSync(process.execPath, ['--check', path.join(ROOT, file)], {
      encoding: 'utf8'
    });
    assert.equal(result.status, 0, 'syntaxe invalide dans ' + file + ' : ' + result.stderr);
  }
});

test('Identifiants HTML uniques et présents pour le contrôleur', () => {
  const ids = [];
  const idAttr = /\bid\s*=\s*["']([^"']+)["']/gi;
  let match;
  while ((match = idAttr.exec(html))) ids.push(match[1]);

  const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
  assert.deepEqual(duplicates, [], 'identifiants HTML dupliqués : ' + duplicates.join(', '));

  const idSet = new Set(ids);
  const selectors = script.match(/['"]#[A-Za-z][\w-]*(?=[\s'"]|$)/g) || [];
  for (const selector of selectors) {
    const id = selector.slice(2);
    // Ignore les couleurs hexadécimales présentes dans les chaînes de code.
    if (/^[0-9a-f]{3,8}$/i.test(id)) continue;
    assert.ok(idSet.has(id), 'sélecteur #' + id + ' utilisé dans script.js mais absent du HTML');
  }
});

test('Manifeste PWA valide et icônes aux bonnes dimensions', () => {
  const manifest = JSON.parse(read('manifest.json'));
  assert.equal(manifest.lang, 'fr');
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.start_url, './index.html');
  assert.equal(manifest.theme_color, '#07070f');
  assert.ok(Array.isArray(manifest.icons) && manifest.icons.length >= 2);
  for (const shot of (manifest.screenshots || [])) {
    assert.ok(exists(shot.src), 'capture manquante : ' + shot.src);
  }

  const pngSize = (file) => {
    const buffer = fs.readFileSync(path.join(ROOT, file));
    assert.equal(buffer.toString('ascii', 1, 4), 'PNG', 'signature PNG invalide : ' + file);
    return {
      width: buffer.readUInt32BE(16),
      height: buffer.readUInt32BE(20)
    };
  };

  for (const icon of manifest.icons) {
    assert.ok(exists(icon.src), 'icône manquante : ' + icon.src);
    const [expectedWidth, expectedHeight] = icon.sizes.split('x').map(Number);
    const actual = pngSize(icon.src);
    assert.equal(actual.width, expectedWidth, 'largeur incorrecte : ' + icon.src);
    assert.equal(actual.height, expectedHeight, 'hauteur incorrecte : ' + icon.src);
  }
});

test('Service Worker : toutes les ressources précachées existent', () => {
  const sw = read('service-worker.js');
  const block = sw.match(/const PRECACHE\s*=\s*\[([\s\S]*?)\];/);
  assert.ok(block, 'liste PRECACHE introuvable');

  const entries = [];
  const entry = /'([^']+)'/g;
  let match;
  while ((match = entry.exec(block[1]))) entries.push(match[1]);

  assert.ok(entries.length >= 40, 'liste de précache trop courte');
  for (const entryPath of entries) {
    if (entryPath === './') {
      assert.ok(exists('index.html'));
      continue;
    }
    const clean = entryPath.replace(/^\.\//, '');
    assert.ok(exists(clean), 'ressource précachée manquante : ' + entryPath);
  }
});

test('Ordre de chargement des scripts compatible avec les modules UMD', () => {
  const order = [
    'config/game-config.js',
    'js/game-rules.js',
    'js/game-engine.js',
    'js/storage-manager.js',
    'js/profile-manager.js',
    'js/settings-manager.js',
    'js/statistics.js',
    'js/audio-manager.js',
    'js/animations.js',
    'js/particles-background.js',
    'js/board-renderer.js',
    'js/puzzles.js',
    'js/ai-engine.js',
    'script.js'
  ];
  let previous = -1;
  for (const file of order) {
    const index = html.indexOf('src="' + file + '"');
    assert.ok(index > previous, 'ordre de script incorrect ou absent : ' + file);
    previous = index;
  }
});

test('Le Web Worker importe les modules locaux attendus', () => {
  const worker = read('js/ai-worker.js');
  assert.match(worker, /importScripts\([^)]*game-config\.js/);
  assert.match(worker, /importScripts\([^)]*game-rules\.js/);
  assert.match(worker, /importScripts\([^)]*ai-engine\.js/);
  assert.match(worker, /postMessage/);
});
