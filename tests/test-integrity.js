/**
 * CHECKERS LEGEND 2026 — Tests d'intégrité du projet
 * ---------------------------------------------------
 * Vérifie les livrables, l'absence de CDN, la validité des références
 * locales, la syntaxe JavaScript, le manifeste PWA et le cache offline.
 * Exécution : node --test tests/test-integrity.js
 */
/**
 * NOTE PÉDAGOGIQUE (débutant)
 *
 * Ce fichier vérifie l’intégrité globale du projet : présence des livrables,
 * absence de ressources chargées à distance, validité des liens locaux,
 * syntaxe JavaScript, manifeste de l’application, cache hors ligne et ordre
 * de chargement des scripts.
 *
 * Les fichiers sont lus avec node:fs et les motifs sont cherchés avec des
 * expressions régulières via assert.match et assert.doesNotMatch. spawnSync
 * lance la vérification de syntaxe de Node sur chaque module.
 * node:test fournit test() (describe() servirait à regrouper, inutile ici) et
 * assert compare les résultats. Les titres de tests sont cités dans la
 * documentation : ils ne doivent pas changer.
 *
 * Lancer ce seul fichier : node --test tests/test-integrity.js
 */
'use strict';

/**
 * Import du lanceur de tests, des vérifications, de la lecture de fichiers et
 * du lancement de commandes.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

/**
 * Racine du projet, calculée à partir du dossier contenant ce test.
 */
const ROOT = path.resolve(__dirname, '..');
/**
 * Lit un fichier texte du projet en le cherchant depuis la racine.
 */
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), 'utf8');
/**
 * Vérifie qu’un fichier existe, toujours depuis la racine du projet.
 */
const exists = (relative) => fs.existsSync(path.join(ROOT, relative));

/**
 * On lit une seule fois les trois fichiers principaux pour les tester plusieurs fois.
 */
const html = read('index.html');
const css = read('style.css');
const script = read('script.js');

/**
 * Scénario : on dresse la liste des fichiers qui doivent être fournis.
 * Pourquoi : le projet doit rester complet et utilisable sans installation.
 * Assertions : chaque fichier existe et n’est pas vide.
 */
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
    'tests/test-puzzles.js', 'tests/test-webkit.js',
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

/**
 * Scénario : on cherche dans les sources des ressources chargées depuis un
 * serveur externe.
 * Pourquoi : le jeu doit fonctionner hors ligne et sans fournisseur externe.
 * Assertions : rien n’est référencé à distance dans les fichiers principaux ;
 * le lien du pied de page est ignoré car il ne charge aucune ressource.
 */
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

/**
 * Scénario : on parcourt tous les attributs src et href du document.
 * Pourquoi : un lien local cassé afficherait une page incomplète.
 * Assertions : sauf les cas spéciaux, chaque chemin mène à un fichier présent.
 */
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

/**
 * Scénario : on parcourt toutes les url() de la feuille de style.
 * Pourquoi : une image ou une police introuvable casserait l’affichage.
 * Assertions : chaque ressource locale existe.
 */
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

/**
 * Scénario : on lance la vérification de syntaxe de Node sur tous les modules.
 * Pourquoi : une faute de syntaxe empêcherait le chargement du jeu.
 * Assertions : chaque vérification se termine avec un code de sortie à zéro.
 */
test('Syntaxe JavaScript valide pour tous les modules', () => {
  const files = [
    'script.js', 'service-worker.js',
    'config/game-config.js', 'js/game-rules.js', 'js/game-engine.js',
    'js/ai-engine.js', 'js/ai-worker.js', 'js/board-renderer.js',
    'js/puzzles.js',
    'js/animations.js', 'js/particles-background.js',
    'js/audio-manager.js', 'js/storage-manager.js', 'js/profile-manager.js',
    'js/settings-manager.js', 'js/statistics.js',
    'scripts/serve.js', 'scripts/browser-smoke-test-firefox.js'
  ];
  for (const file of files) {
    const result = spawnSync(process.execPath, ['--check', path.join(ROOT, file)], {
      encoding: 'utf8'
    });
    assert.equal(result.status, 0, 'syntaxe invalide dans ' + file + ' : ' + result.stderr);
  }
});

/**
 * Scénario : on relève les identifiants du document et les sélecteurs utilisés
 * dans le script principal.
 * Pourquoi : un identifiant en double ou manquant rend des éléments introuvables.
 * Assertions : aucun doublon, et chaque sélecteur correspond à un identifiant présent.
 */
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

/**
 * Scénario : on lit le manifeste puis on examine les icônes.
 * Pourquoi : l’installation de l’application dépend de ces informations.
 * Assertions : langue, affichage, page de départ et couleur attendus, icônes
 * présentes, et dimensions réelles conformes à celles annoncées.
 */
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

/**
 * Scénario : on extrait la liste des fichiers mis en cache par le Service Worker.
 * Pourquoi : le mode hors ligne doit pouvoir charger toutes les ressources.
 * Assertions : la liste est assez longue et chaque élément existe, sauf la
 * racine qui est remplacée par la page d’accueil.
 */
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

/**
 * Scénario : on vérifie l’ordre des balises de script dans le document.
 * Pourquoi : les modules partagent des variables globales, donc l’ordre compte.
 * Assertions : chaque script est présent et apparaît après le précédent.
 */
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

/**
 * Scénario : on lit le script du Worker utilisé par l’IA.
 * Pourquoi : il doit charger les mêmes modules que le reste du jeu.
 * Assertions : les trois imports locaux et l’envoi de résultats sont présents.
 */
test('Le Web Worker importe les modules locaux attendus', () => {
  const worker = read('js/ai-worker.js');
  assert.match(worker, /importScripts\([^)]*game-config\.js/);
  assert.match(worker, /importScripts\([^)]*game-rules\.js/);
  assert.match(worker, /importScripts\([^)]*ai-engine\.js/);
  assert.match(worker, /postMessage/);
});
