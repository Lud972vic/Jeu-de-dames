/**
 * CHECKERS LEGEND 2026 — Tests du fond de particules
 * ---------------------------------------------------
 * Tests Node.js « unitaires » du module canvas : conversion des couleurs,
 * paliers de densité, synchronisation avec les paramètres et onde de choc.
 * Exécution : node --test tests/test-particles.js
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const Particles = require('../js/particles-background.js');

const GLOBALS = [
  'document', 'getComputedStyle', 'SettingsManager', 'innerWidth', 'innerHeight',
  'devicePixelRatio', 'requestAnimationFrame', 'cancelAnimationFrame',
  'performance', 'MutationObserver'
];

function createContext() {
  return {
    lineWidth: 1,
    setTransform() {}, clearRect() {}, beginPath() {}, moveTo() {},
    lineTo() {}, stroke() {}, fill() {}, arc() {}, save() {}, restore() {}
  };
}

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
  const pb = Object.assign(Object.create(Particles), {
    particles: [], rings: [], canvas: null, ctx: null,
    running: false, enabled: true
  });
  return { pb, canvas, saved };
}

function teardown(saved) {
  for (const key of GLOBALS) {
    if (saved[key].exists) globalThis[key] = saved[key].value;
    else delete globalThis[key];
  }
}

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

test('Un clic dans le vide crée une onde de choc et repousse les particules', () => {
  const { pb, saved } = setup();
  try {
    pb.enabled = true;
    pb.animated = true;
    pb.particles = [{ x: 130, y: 100, vx: 0, vy: 0 }];
    pb._start = () => {}; // évite la boucle d'animation dans Node

    pb._pulseAt(100, 100);
    assert.equal(pb.rings.length, 1);
    assert.ok(pb.particles[0].vx > 0, 'la particule doit être repoussée vers la droite');
    assert.equal(pb.particles[0].vy, 0);
  } finally {
    teardown(saved);
  }
});
