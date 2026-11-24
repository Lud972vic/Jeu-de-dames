/**
 * CHECKERS LEGEND 2026 — Vérification du projet
 * ----------------------------------------------
 * Exécute la suite de tests Node.js complète (règles, IA, stockage,
 * intégrité, PWA) et affiche un bilan lisible.
 *
 * Usage : npm run verify
 */
'use strict';

const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const TESTS = [
  'tests/test-rules.js',
  'tests/test-ai.js',
  'tests/test-storage.js',
  'tests/test-particles.js',
  'tests/test-profiles.js',
  'tests/test-puzzles.js',
  'tests/test-webkit.js',
  'tests/test-integrity.js'
];

console.log('CHECKERS LEGEND 2026 — vérification');
console.log('Node.js ' + process.version + ' · ' + process.platform + ' ' + process.arch);
console.log('Tests : ' + TESTS.join(', '));
console.log('');

const result = spawnSync(process.execPath, ['--test'].concat(TESTS), {
  cwd: ROOT,
  stdio: 'inherit'
});

if (result.error) {
  console.error('Impossible de lancer les tests :', result.error.message);
  process.exit(1);
}

if (result.status !== 0) {
  console.error('\nVérification ÉCHOUÉE (code ' + result.status + ').');
  process.exit(result.status || 1);
}

console.log('\nVérification réussie : règles, IA, stockage et intégrité PWA.');
console.log('Pour le parcours navigateur : npm run test:browser');
