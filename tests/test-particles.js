/**
 * CHECKERS LEGEND 2026 — Tests du fond de particules
 * ---------------------------------------------------
 * Tests Node.js « unitaires » du module canvas : conversion des couleurs,
 * paliers de densité, synchronisation avec les paramètres et onde de choc.
 * Exécution : node --test tests/test-particles.js
 */
/**
 * NOTE PÉDAGOGIQUE (débutant)
 *
 * Ce fichier teste le fond de particules dessiné sur un canvas.
 * Node.js n’ayant pas de navigateur, on fabrique un faux environnement :
 * globalThis.document, getComputedStyle, requestAnimationFrame, performance
 * ou encore SettingsManager. La fonction setup() installe ces objets et
 * sauvegarde les anciens ; teardown() les remet en place après chaque test
 * grâce au bloc « finally ». Un faux contexte de dessin permet de tester sans
 * rien afficher à l’écran.
 *
 * node:test fournit test() (describe() permettrait de regrouper, inutile ici)
 * et assert compare les résultats. Les titres de tests sont cités dans la
 * documentation : ils ne doivent pas changer.
 *
 * Lancer ce seul fichier : node --test tests/test-particles.js
 */
'use strict';

/**
 * Import du lanceur de tests et des vérifications, puis du module à tester.
 */
const test = require('node:test');
const assert = require('node:assert/strict');

const Particles = require('../js/particles-background.js');

/**
 * Liste des variables globales à simuler. Elles sont sauvegardées puis
 * restaurées pour que les tests ne se polluent pas les uns les autres.
 */
const GLOBALS = [
  'document', 'getComputedStyle', 'SettingsManager', 'innerWidth', 'innerHeight',
  'devicePixelRatio', 'requestAnimationFrame', 'cancelAnimationFrame',
  'performance', 'MutationObserver'
];

/**
 * Faux contexte de dessin 2D : toutes les méthodes sont vides, aucun vrai
 * canvas n’est utilisé pendant les tests.
 */
function createContext() {
  return {
    lineWidth: 1,
    setTransform() {}, clearRect() {}, beginPath() {}, moveTo() {},
    lineTo() {}, stroke() {}, fill() {}, arc() {}, save() {}, restore() {}
  };
}

/**
 * Prépare un environnement de test : taille de la fenêtre, faux document,
 * faux réglages, faux canvas et un objet particules minimal nommé « pb ».
 * Retourne aussi la sauvegarde des globales pour pouvoir les restaurer.
 */
function setup(options) {
  options = options || {};
  const saved = {};
  for (const key of GLOBALS) {
    saved[key] = {
      exists: Object.prototype.hasOwnProperty.call(globalThis, key),
      value: globalThis[key]
    };
  }

  globalThis.innerWidth = options.width || 800;
  globalThis.innerHeight = options.height || 600;
  globalThis.devicePixelRatio = 1;
  globalThis.document = {
    hidden: true,
    body: {
      dataset: { mode: 'dark', theme: 'neon' },
      classList: {
        contains: (name) => (options.classes || []).indexOf(name) !== -1
      }
    },
    documentElement: {},
    addEventListener() {}
  };
  globalThis.getComputedStyle = () => ({ getPropertyValue: () => '' });
  globalThis.SettingsManager = {
    settings: { particlesEnabled: true, particleDensity: 'normal' },
    get(key) { return this.settings[key]; }
  };
  globalThis.requestAnimationFrame = () => 1;
  globalThis.cancelAnimationFrame = () => {};
  globalThis.performance = { now: () => 0 };
  globalThis.MutationObserver = undefined;

  const canvas = {
    width: 0, height: 0, style: {},
    getContext: () => createContext()
  };
  /**
   * Crée l’objet à tester à partir du prototype Particles, avec des listes vides.
   */
  const pb = Object.assign(Object.create(Particles), {
    particles: [], rings: [], canvas: null, ctx: null,
    running: false, enabled: true
  });
  return { pb, canvas, saved };
}

/**
 * Remet les variables globales exactement comme elles étaient avant le test.
 */
function teardown(saved) {
  for (const key of GLOBALS) {
    if (saved[key].exists) globalThis[key] = saved[key].value;
    else delete globalThis[key];
  }
}

/**
 * Scénario : on convertit plusieurs écritures de couleurs en composantes RGB.
 * Pourquoi : le canvas a besoin de composantes rouge, vert, bleu séparées.
 * Assertions : les trois formats connus donnent les bons chiffres ; une valeur
 * inconnue ou vide donne « null ».
 */
test('Les couleurs CSS sont converties en RGB (hex court, hex long, rgb())', () => {
  const { saved } = setup();
  try {
    assert.deepEqual(Particles._toRgb('#00aef0'), { r: 0, g: 174, b: 240 });
    assert.deepEqual(Particles._toRgb('#fff'), { r: 255, g: 255, b: 255 });
    assert.deepEqual(Particles._toRgb('rgb(10, 20, 30)'), { r: 10, g: 20, b: 30 });
    assert.equal(Particles._toRgb('inconnu'), null);
    assert.equal(Particles._toRgb(''), null);
  } finally {
    teardown(saved);
  }
});

/**
 * Scénario : on change le palier de densité, puis on met une valeur inconnue.
 * Pourquoi : ce réglage doit adapter la distance des liens et la vitesse.
 * Assertions : valeurs attendues pour « low » et « high », et retour à « normal »
 * pour une valeur non reconnue.
 */
test('Les trois paliers de densité ajustent portée et vitesse', () => {
  const { pb, saved } = setup();
  try {
    globalThis.SettingsManager.settings.particleDensity = 'low';
    assert.equal(pb._applyDensity(), true);
    assert.equal(pb.density, 'low');
    assert.equal(pb.linkDistance, 110);
    assert.equal(pb.speedFactor, 0.65);

    globalThis.SettingsManager.settings.particleDensity = 'high';
    pb._applyDensity();
    assert.equal(pb.density, 'high');
    assert.equal(pb.linkDistance, 155);
    assert.equal(pb.speedFactor, 1.3);

    globalThis.SettingsManager.settings.particleDensity = 'valeur-inconnue';
    pb._applyDensity();
    assert.equal(pb.density, 'normal');
  } finally {
    teardown(saved);
  }
});

/**
 * Scénario : un très grand écran, avec densité normale puis élevée.
 * Pourquoi : trop de particules ralentiraient le navigateur.
 * Assertions : le nombre reste dans une fourchette limitée dans les deux cas.
 */
test('Le nombre de particules reste borné, y compris sur grand écran', () => {
  const { pb, saved } = setup({ width: 4000, height: 3000 });
  try {
    pb.palette = [{ r: 0, g: 174, b: 240 }];
    pb.width = 4000;
    pb.height = 3000;

    pb._applyDensity();
    pb._build();
    assert.ok(pb.particles.length >= 24 && pb.particles.length <= 85);

    globalThis.SettingsManager.settings.particleDensity = 'high';
    pb._applyDensity();
    pb._build();
    assert.ok(pb.particles.length >= 40 && pb.particles.length <= 120);
  } finally {
    teardown(saved);
  }
});

/**
 * Scénario : on désactive puis on réactive les particules alors que le
 * mouvement réduit est actif.
 * Pourquoi : le réglage doit cacher le canvas et arrêter l’animation.
 * Assertions : visibilité cachée puis restaurée, boucle arrêtée, et image fixe
 * quand les animations sont réduites.
 */
test('Le réglage « particules » masque et réaffiche le canvas', () => {
  const { pb, canvas, saved } = setup({ classes: ['no-animations'] });
  try {
    pb.canvas = canvas;
    pb.ctx = canvas.getContext('2d');
    pb.palette = [{ r: 0, g: 174, b: 240 }];
    pb.width = 800;
    pb.height = 600;
    pb.particles = [{
      x: 10, y: 10, vx: 0, vy: 0, radius: 1, alpha: 0.5,
      colorIndex: 0, color: pb.palette[0], link: false
    }];

    globalThis.SettingsManager.settings.particlesEnabled = false;
    pb.sync();
    assert.equal(pb.enabled, false);
    assert.equal(canvas.style.visibility, 'hidden');
    assert.equal(pb.running, false);

    globalThis.SettingsManager.settings.particlesEnabled = true;
    pb.sync();
    assert.equal(pb.enabled, true);
    assert.equal(canvas.style.visibility, '');
    assert.equal(pb.animated, false); // mouvement réduit : image fixe uniquement
  } finally {
    teardown(saved);
  }
});

/**
 * Scénario : un clic en (100,100) près d’une particule.
 * Pourquoi : l’interaction doit créer une onde et repousser les particules.
 * Assertions : un cercle est ajouté et la particule part vers la droite, sans
 * mouvement vertical.
 */
test('Un clic dans le vide crée une onde de choc et repousse les particules', () => {
  const { pb, saved } = setup();
  try {
    pb.enabled = true;
    pb.animated = true;
    pb.particles = [{ x: 130, y: 100, vx: 0, vy: 0 }];
    /**
     * On remplace la boucle d’animation par une fonction vide : sinon le test
     * tournerait en continu dans Node.
     */
    pb._start = () => {}; // évite la boucle d'animation dans Node

    pb._pulseAt(100, 100);
    assert.equal(pb.rings.length, 1);
    assert.ok(pb.particles[0].vx > 0, 'la particule doit être repoussée vers la droite');
    assert.equal(pb.particles[0].vy, 0);
  } finally {
    teardown(saved);
  }
});
