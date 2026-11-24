/**
 * CHECKERS LEGEND 2026 — Audit statique de compatibilité WebKit/Safari
 * --------------------------------------------------------------------
 * Safari n'est pas installable dans cet environnement Windows et aucune
 * dépendance réseau n'est autorisée. Ce test ne remplace PAS un lancement
 * réel de Safari : il vérifie uniquement que les replis WebKit présents dans
 * le code ne régressent pas (AudioContext, préfixes CSS, garde Service Worker).
 *
 * Exécution : node --test tests/test-webkit.js
 */
/**
 * NOTE PÉDAGOGIQUE (débutant)
 *
 * Ce fichier réalise un audit statique de compatibilité avec Safari et WebKit.
 * Safari ne peut pas être lancé dans cet environnement : on lit simplement les
 * fichiers source avec node:fs et on recherche des motifs avec des expressions
 * régulières. assert.match exige qu’un motif soit présent ; assert.doesNotMatch
 * exige qu’il soit absent.
 *
 * node:test fournit test() (describe() permettrait de regrouper, ce n’est pas
 * utilisé ici). Les titres de tests sont cités dans la documentation : ils ne
 * doivent pas changer.
 *
 * Lancer ce seul fichier : node --test tests/test-webkit.js
 */
'use strict';

/**
 * Import du lanceur de tests, des vérifications et des modules de lecture de fichiers.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

/**
 * Racine du projet : __dirname désigne le dossier du test, « .. » son parent.
 */
const ROOT = path.resolve(__dirname, '..');
/**
 * Lit un fichier du projet sous forme de texte, depuis la racine.
 */
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

const audio = read('js/audio-manager.js');
const css = read('style.css');
const script = read('script.js');

/**
 * Scénario : on compte les créations de contexte audio et les repli WebKit.
 * Pourquoi : Safari utilise un nom différent pour l’objet audio.
 * Assertions : au moins un contexte est créé et chaque création possède un repli.
 */
test('WebKit : repli webkitAudioContext présent à chaque création de contexte', () => {
  const contexts = audio.match(/new Ctx\(/g) || [];
  const fallbacks = audio.match(/webkitAudioContext/g) || [];
  assert.ok(contexts.length >= 1, 'aucun contexte audio créé');
  assert.ok(fallbacks.length >= contexts.length,
    'chaque AudioContext doit avoir un repli webkitAudioContext');
});

/**
 * Scénario : on cherche les préfixes CSS propres à WebKit.
 * Pourquoi : Safari a besoin de ces variantes pour le flou, les masques et le lissage.
 * Assertions : les trois propriétés préfixées sont présentes dans la feuille de style.
 */
test('WebKit : préfixes -webkit- pour le flou et les masques CSS', () => {
  assert.match(css, /-webkit-backdrop-filter\s*:/);
  assert.match(css, /-webkit-mask-image\s*:/);
  assert.match(css, /-webkit-font-smoothing\s*:/);
});

/**
 * Scénario : on vérifie que l’enregistrement du Service Worker est protégé et
 * limité aux pages sécurisées.
 * Pourquoi : cette fonctionnalité ne doit pas être appelée n’importe où.
 * Assertions : le garde-fou et la vérification du protocole sont présents dans le script.
 */
test('WebKit : enregistrement du Service Worker protégé et limité à HTTP(S)', () => {
  assert.match(script, /'serviceWorker'\s+in\s+(global|window|navigator)\.navigator/);
  assert.match(script, /\^https\?:\$/);
});

/**
 * Scénario : on recherche des API propres à un autre navigateur.
 * Pourquoi : ces API ne fonctionnent pas sur Safari et feraient planter le script.
 * Assertions : les trois API interdites sont absentes du script principal.
 */
test('WebKit : aucune API exclusive à Chromium dans le script principal', () => {
  assert.doesNotMatch(script, /\bchrome\./);
  assert.doesNotMatch(script, /\bwebkitSpeechRecognition\b/);
  assert.doesNotMatch(script, /\bshowDirectoryPicker\b/);
});
