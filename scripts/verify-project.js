/**
 * CHECKERS LEGEND 2026 — Vérification du projet
 * ----------------------------------------------
 * Exécute la suite de tests Node.js complète (règles, IA, stockage,
 * intégrité, PWA) et affiche un bilan lisible.
 *
 * Usage : npm run verify
 */

/**
 * POUR UN DÉBUTANT — Rôle, concepts et mode d'emploi
 * --------------------------------------------------
 * Rôle : ce petit programme est un « lanceur de tests ». Il exécute toute la
 * suite de tests du projet (règles du jeu, IA, sauvegardes, particules,
 * profils, puzzles, WebKit, intégrité PWA) et affiche un bilan lisible. Il ne
 * teste rien lui-même : il délègue le travail à Node.js et affiche le résultat.
 *
 * Concepts utilisés :
 *  - Modules Node « node: » : « node:path » sert à construire des chemins de
 *    fichiers, « node:child_process » permet de lancer un autre programme.
 *    Le préfixe « node: » indique que ces bibliothèques sont intégrées à
 *    Node.js (aucune installation nécessaire).
 *  - spawnSync (spawn « synchrone ») : lance une commande et ATTEND qu'elle se
 *    termine avant de continuer. Ici on lance Node.js avec l'option « --test »
 *    et la liste des fichiers de tests.
 *  - stdio: 'inherit' : l'enfant (les tests) utilise le même écran que nous ;
 *    ses messages apparaissent donc directement dans le terminal.
 *  - Code de sortie : tout programme se termine avec un nombre. 0 signifie
 *    « succès », autre chose signifie « échec ». Le script s'en sert pour
 *    décider quoi afficher et quel code renvoyer à son tour.
 *
 * Mode d'emploi simple :
 *  1. Ouvrez un terminal à la racine du projet.
 *  2. Tapez : npm run verify
 *  3. Lisez le bilan : « Vérification réussie » ou le détail des échecs.
 */
'use strict';

const path = require('node:path');
const { spawnSync } = require('node:child_process');

// Dossier racine du projet (parent de scripts/). Les tests sont lancés depuis
// là pour que les chemins relatifs des fichiers de tests soient corrects.
const ROOT = path.resolve(__dirname, '..');
// Liste des fichiers de tests à exécuter, dans cet ordre. Pour en ajouter un,
// il suffit d'ajouter son chemin ici (il sera transmis à Node.js avec --test).
const TESTS = [
  'tests/test-rules.js',
  'tests/test-ai.js',
  'tests/test-storage.js',
  'tests/test-particles.js',
  'tests/test-animations.js',
  'tests/test-profiles.js',
  'tests/test-puzzles.js',
  'tests/test-webkit.js',
  'tests/test-integrity.js'
];

// Étape 1 : afficher le contexte (version de Node, système, liste des tests)
// pour que le lecteur sache exactement ce qui a été vérifié.
console.log('CHECKERS LEGEND 2026 — vérification');
console.log('Node.js ' + process.version + ' · ' + process.platform + ' ' + process.arch);
console.log('Tests : ' + TESTS.join(', '));
console.log('');

// Étape 2 : lancer les tests. process.execPath est le chemin vers le Node.js
// en cours d'exécution ; on lui passe « --test » puis tous les fichiers de la
// liste. Le résultat contient notamment le code de sortie (result.status).
const result = spawnSync(process.execPath, ['--test'].concat(TESTS), {
  // cwd = dossier de travail (la racine du projet) ; stdio inherit = les
  // messages des tests s'affichent directement dans notre terminal.
  cwd: ROOT,
  stdio: 'inherit'
});

// Étape 3 : si Node.js n'a même pas pu démarrer, on affiche l'erreur et on
// s'arrête avec le code 1 (échec).
if (result.error) {
  console.error('Impossible de lancer les tests :', result.error.message);
  process.exit(1);
}

// Étape 4 : code de sortie différent de 0 = au moins un test a échoué. On
// relaie le même code pour que les outils automatiques puissent détecter
// l'échec. (Le « || 1 » évite un code 0 accidentel.)
if (result.status !== 0) {
  console.error('\nVérification ÉCHOUÉE (code ' + result.status + ').');
  process.exit(result.status || 1);
}

// Étape 5 : tout est passé, on affiche le message de réussite et une piste
// pour la suite (le test dans un vrai navigateur).
console.log('\nVérification réussie : règles, IA, stockage et intégrité PWA.');
console.log('Pour le parcours navigateur : npm run test:browser');
