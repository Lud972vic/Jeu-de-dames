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
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

const audio = read('js/audio-manager.js');
const css = read('style.css');
const script = read('script.js');

test('WebKit : repli webkitAudioContext présent à chaque création de contexte', () => {
  const contexts = audio.match(/new Ctx\(/g) || [];
  const fallbacks = audio.match(/webkitAudioContext/g) || [];
  assert.ok(contexts.length >= 1, 'aucun contexte audio créé');
  assert.ok(fallbacks.length >= contexts.length,
    'chaque AudioContext doit avoir un repli webkitAudioContext');
});

test('WebKit : préfixes -webkit- pour le flou et les masques CSS', () => {
  assert.match(css, /-webkit-backdrop-filter\s*:/);
  assert.match(css, /-webkit-mask-image\s*:/);
  assert.match(css, /-webkit-font-smoothing\s*:/);
});

test('WebKit : enregistrement du Service Worker protégé et limité à HTTP(S)', () => {
  assert.match(script, /'serviceWorker'\s+in\s+(global|window|navigator)\.navigator/);
  assert.match(script, /\^https\?:\$/);
});

test('WebKit : aucune API exclusive à Chromium dans le script principal', () => {
  assert.doesNotMatch(script, /\bchrome\./);
  assert.doesNotMatch(script, /\bwebkitSpeechRecognition\b/);
  assert.doesNotMatch(script, /\bshowDirectoryPicker\b/);
});
