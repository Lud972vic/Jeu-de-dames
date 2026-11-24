/**
 * CHECKERS LEGEND 2026 — Tests du mode carnage (animations.js)
 * -------------------------------------------------------------
 * Tests Node.js du module canvas : quantité de sang, coulures, dessin et
 * respect du réglage « réduire les animations ».
 * Exécution : node --test tests/test-animations.js
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const Animations = require('../js/animations.js');

/** Contexte 2D factice : toutes les méthodes existent et ne font rien. */
function createContext() {
  const noop = () => {};
  return {
    globalAlpha: 1,
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    setTransform: noop, clearRect: noop, beginPath: noop, moveTo: noop,
    lineTo: noop, stroke: noop, fill: noop, arc: noop, ellipse: noop,
    save: noop, restore: noop, fillRect: noop, translate: noop, rotate: noop
  };
}

const GLOBALS = ['document', 'matchMedia', 'requestAnimationFrame', 'performance', 'devicePixelRatio'];

/** Installe un environnement minimal et remet les tableaux d'effets à zéro. */
function setup() {
  const saved = {};
  for (const key of GLOBALS) {
    saved[key] = {
      exists: Object.prototype.hasOwnProperty.call(globalThis, key),
      value: globalThis[key]
    };
  }
  globalThis.document = {
    body: { classList: { contains: () => false } }
  };
  globalThis.matchMedia = () => ({ matches: false });
  globalThis.requestAnimationFrame = () => 1;
  globalThis.performance = { now: () => 0 };
  globalThis.devicePixelRatio = 1;

  Animations.particles = [];
  Animations.confetti = [];
  Animations.shockwaves = [];
  Animations.splats = [];
  Animations.cracks = [];
  Animations.gore = [];
  Animations.flash = 0;
  Animations.running = false;
  Animations.canvas = {
    clientWidth: 800, clientHeight: 600, width: 800, height: 600,
    getContext: () => createContext()
  };
  Animations.ctx = Animations.canvas.getContext();
  Animations.dpr = 1;
  return saved;
}

/** Restaure les globales telles qu'elles étaient avant le test. */
function teardown(saved) {
  for (const key of GLOBALS) {
    if (saved[key].exists) globalThis[key] = saved[key].value;
    else delete globalThis[key];
  }
}

/**
 * Scénario : une capture carnage doit être nettement plus fournie qu'une
 * capture brutale classique, avec des flaques et des coulures.
 */
test('Le mode carnage ajoute sang, flaques et coulures à la capture brutale', () => {
  const saved = setup();
  try {
    Animations.brutalCapture(100, 100, 1);
    const classicParticles = Animations.particles.length;
    const classicFlash = Animations.flash;

    Animations.particles = [];
    Animations.shockwaves = [];
    Animations.splats = [];
    Animations.cracks = [];
    Animations.gore = [];
    Animations.flash = 0;

    Animations.goreCapture(100, 100, 1);
    assert.ok(Animations.particles.length > classicParticles * 2,
      'le geyser doit produire beaucoup plus de particules');
    assert.ok(Animations.gore.length >= 3, 'flaques de sang absentes');
    assert.ok(Animations.gore.every((pool) => pool.drips.length > 0), 'coulures absentes');
    assert.ok(Animations.particles.some((p) => p.blob === true), 'gouttes de sang absentes');
    assert.ok(Animations.flash > classicFlash, 'flash du carnage trop faible');
    assert.ok(Animations.flash <= 0.55, 'flash du carnage mal borné');
  } finally {
    teardown(saved);
  }
});

/** Scénario : les coulures s'allongent puis les flaques finissent par disparaître. */
test('Les coulures s\'étalent et les flaques s\'estompent avec le temps', () => {
  const saved = setup();
  try {
    Animations.goreCapture(50, 50, 2);
    const pool = Animations.gore[0];
    const drip = pool.drips[0];
    const start = drip.len;
    for (let i = 0; i < 20; i++) Animations._update(1);
    assert.ok(drip.len > start, 'la coulure doit grandir');
    assert.ok(drip.len <= drip.max, 'la coulure doit être bornée');

    pool.life = 0.01;
    for (let i = 0; i < 5; i++) Animations._update(1);
    assert.equal(Animations.gore.includes(pool), false, 'la flaque doit être supprimée');
  } finally {
    teardown(saved);
  }
});

/** Scénario : le dessin du carnage ne doit pas planter avec un vrai canvas 2D. */
test('Le rendu du carnage utilise bien le canvas 2D', () => {
  const saved = setup();
  try {
    Animations.goreCapture(60, 60, 3);
    Animations._draw();
    assert.equal(Animations.ctx.globalAlpha, 1, 'transparence non restaurée');
  } finally {
    teardown(saved);
  }
});

/** Scénario : la décapitation d'une dame projette du sang vers le haut. */
test('La décapitation ajoute un jet de sang et une flaque', () => {
  const saved = setup();
  try {
    Animations.decapitate(100, 100, 2);
    assert.ok(Animations.particles.length >= 56, 'jet de sang absent');
    assert.ok(Animations.particles.every((p) => p.blob === true), 'gouttes de sang manquantes');
    assert.ok(Animations.particles.filter((p) => p.vy < 0).length > 20,
      'le sang doit jaillir vers le haut');
    assert.equal(Animations.gore.length, 1, 'flaque de la décapitation absente');
    assert.ok(Animations.gore[0].drips.length > 0, 'coulures absentes');
    assert.ok(Animations.flash > 0, 'flash absent');
  } finally {
    teardown(saved);
  }
});

/** Scénario : une dame qui capture produit une lame dorée, sans sang. */
test('La frappe d\'une dame projette des étincelles dorées', () => {
  const saved = setup();
  try {
    Animations.royalStrike(100, 100, 2);
    assert.ok(Animations.particles.length >= 50, 'lame dorée absente');
    assert.ok(Animations.particles.every((p) => p.shard === true), 'éclats manquants');
    assert.ok(Animations.particles.every(
      (p) => ['#fff3c4', '#fbbf24', '#f59e0b', '#ffffff'].includes(p.color)
    ), 'couleurs dorées attendues');
    assert.ok(Animations.shockwaves.some((s) => s.gold === true), 'onde dorée absente');
    assert.equal(Animations.gore.length, 0, 'une frappe royale ne saigne pas');
  } finally {
    teardown(saved);
  }
});

/** Scénario : mouvement réduit = aucun effet, même en mode carnage. */
test('Le mouvement réduit désactive tous les effets de capture', () => {
  const saved = setup();
  try {
    globalThis.document.body.classList.contains = () => true;
    Animations.goreCapture(10, 10, 3);
    Animations.decapitate(10, 10, 3);
    Animations.royalStrike(10, 10, 3);
    assert.equal(Animations.gore.length, 0);
    assert.equal(Animations.particles.length, 0);
    assert.equal(Animations.shockwaves.length, 0);
    assert.equal(Animations.flash, 0);
  } finally {
    teardown(saved);
  }
});
