#!/usr/bin/env node
/**
 * CHECKERS LEGEND 2026 — Générateur de ressources locales
 * ---------------------------------------------------------
 * Génère, sans aucune dépendance externe (Node.js >= 18) :
 *   - Les effets sonores du jeu (fichiers WAV 16 bits mono) :
 *       assets/sounds/move.wav, capture.wav, promote.wav, victory.wav,
 *       click.wav, invalid.wav, draw.wav
 *   - Les icônes PWA (PNG RGBA) :
 *       assets/images/icon-192.png, assets/images/icon-512.png
 *   - Un logo SVG : assets/images/logo.svg
 *
 * Usage : node scripts/generate-assets.js
 * Les fichiers sont générés localement : aucune licence externe, aucun réseau.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.resolve(__dirname, '..');
const SOUNDS_DIR = path.join(ROOT, 'assets', 'sounds');
const IMAGES_DIR = path.join(ROOT, 'assets', 'images');

fs.mkdirSync(SOUNDS_DIR, { recursive: true });
fs.mkdirSync(IMAGES_DIR, { recursive: true });

/* ============================================================
 * 1. GÉNÉRATION AUDIO (WAV 16 bits, mono, 44 100 Hz)
 * ============================================================ */

const SAMPLE_RATE = 44100;

/** Écrit un fichier WAV PCM 16 bits mono à partir d'un tableau de samples [-1, 1]. */
function writeWav(filePath, samples) {
  const numSamples = samples.length;
  const dataSize = numSamples * 2;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);          // taille du chunk fmt
  buffer.writeUInt16LE(1, 20);           // PCM
  buffer.writeUInt16LE(1, 22);           // mono
  buffer.writeUInt32LE(SAMPLE_RATE, 24);
  buffer.writeUInt32LE(SAMPLE_RATE * 2, 28); // byte rate
  buffer.writeUInt16LE(2, 32);           // block align
  buffer.writeUInt16LE(16, 34);          // bits par sample
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  for (let i = 0; i < numSamples; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    buffer.writeInt16LE(Math.round(clamped * 32767), 44 + i * 2);
  }
  fs.writeFileSync(filePath, buffer);
  console.log(`  OK  ${path.relative(ROOT, filePath)} (${buffer.length} octets)`);
}

/** Enveloppe simple : attaque linéaire + décroissance exponentielle. */
function envelope(t, duration, attack = 0.01, decay = 6) {
  if (t < attack) return t / attack;
  return Math.exp(-decay * (t - attack) / duration);
}

function sine(t, freq) {
  return Math.sin(2 * Math.PI * freq * t);
}

function noise() {
  return Math.random() * 2 - 1;
}

/** Petit "tick" de déplacement. */
function makeMoveSound() {
  const duration = 0.08;
  const n = Math.floor(SAMPLE_RATE * duration);
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    const env = envelope(t, duration, 0.002, 14);
    out[i] = 0.35 * env * (sine(t, 720) * 0.7 + sine(t, 1440) * 0.3);
  }
  return out;
}

/** Capture : balayage descendant + bruit bref. */
function makeCaptureSound() {
  const duration = 0.22;
  const n = Math.floor(SAMPLE_RATE * duration);
  const out = new Float64Array(n);
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    const p = t / duration;
    const freq = 620 * Math.pow(180 / 620, p); // balayage exponentiel
    phase += 2 * Math.PI * freq / SAMPLE_RATE;
    const env = envelope(t, duration, 0.004, 5);
    const thump = sine(t, 110) * Math.exp(-30 * t);
    out[i] = 0.5 * env * (Math.sin(phase) * 0.75 + noise() * 0.25) + 0.3 * thump;
  }
  return out;
}

/** Promotion : arpège ascendant (do - mi - sol - do). */
function makePromoteSound() {
  const notes = [523.25, 659.25, 783.99, 1046.5];
  const noteDur = 0.09;
  const duration = notes.length * noteDur;
  const n = Math.floor(SAMPLE_RATE * duration);
  const out = new Float64Array(n);
  notes.forEach((freq, idx) => {
    const start = Math.floor(idx * noteDur * SAMPLE_RATE);
    const len = Math.floor(noteDur * SAMPLE_RATE);
    for (let i = 0; i < len && start + i < n; i++) {
      const t = i / SAMPLE_RATE;
      const env = envelope(t, noteDur, 0.005, 7);
      out[start + i] += 0.32 * env * (sine(t, freq) + 0.3 * sine(t, freq * 2));
    }
  });
  return out;
}

/** Victoire : accord majeur + scintillement. */
function makeVictorySound() {
  const duration = 1.1;
  const n = Math.floor(SAMPLE_RATE * duration);
  const out = new Float64Array(n);
  const chord = [523.25, 659.25, 783.99, 1046.5];
  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    let v = 0;
    chord.forEach((freq, k) => {
      const env = envelope(t, duration, 0.02 + k * 0.02, 3);
      v += 0.16 * env * sine(t, freq);
    });
    const sparkle = 0.05 * Math.sin(2 * Math.PI * (1568 + 120 * Math.sin(2 * Math.PI * 6 * t)) * t) * Math.exp(-2.5 * t);
    out[i] = v + sparkle;
  }
  return out;
}

/** Clic d'interface. */
function makeClickSound() {
  const duration = 0.045;
  const n = Math.floor(SAMPLE_RATE * duration);
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    const env = envelope(t, duration, 0.001, 20);
    out[i] = 0.25 * env * (sine(t, 1100) + 0.4 * sine(t, 2200));
  }
  return out;
}

/** Coup invalide : bourdonnement grave. */
function makeInvalidSound() {
  const duration = 0.18;
  const n = Math.floor(SAMPLE_RATE * duration);
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    const env = envelope(t, duration, 0.005, 5);
    out[i] = 0.3 * env * (Math.sin(2 * Math.PI * 120 * t) + 0.5 * Math.sin(2 * Math.PI * 180 * t));
  }
  return out;
}

/** Match nul : deux tons neutres descendants. */
function makeDrawSound() {
  const duration = 0.5;
  const n = Math.floor(SAMPLE_RATE * duration);
  const out = new Float64Array(n);
  const seg = n / 2;
  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    const freq = i < seg ? 440 : 349.23;
    const env = envelope(i < seg ? t : t - 0.25, 0.25, 0.01, 6);
    out[i] = 0.28 * env * sine(t, freq);
  }
  return out;
}

console.log('Génération des sons :');
writeWav(path.join(SOUNDS_DIR, 'move.wav'), makeMoveSound());
writeWav(path.join(SOUNDS_DIR, 'capture.wav'), makeCaptureSound());
writeWav(path.join(SOUNDS_DIR, 'promote.wav'), makePromoteSound());
writeWav(path.join(SOUNDS_DIR, 'victory.wav'), makeVictorySound());
writeWav(path.join(SOUNDS_DIR, 'click.wav'), makeClickSound());
writeWav(path.join(SOUNDS_DIR, 'invalid.wav'), makeInvalidSound());
writeWav(path.join(SOUNDS_DIR, 'draw.wav'), makeDrawSound());

/* ============================================================
 * 2. GÉNÉRATION DES ICÔNES PNG (encodeur PNG pur Node + zlib)
 * ============================================================ */

/** Table CRC32 (norme PNG). */
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

/** Encode un buffer RGBA (width*height*4) en PNG. */
function encodePNG(width, height, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // color type RGBA
  ihdr[10] = 0;  // compression
  ihdr[11] = 0;  // filter
  ihdr[12] = 0;  // interlace

  // Chaque scanline est préfixée par son octet de filtre (0 = aucun).
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    const rowStart = y * (width * 4 + 1);
    raw[rowStart] = 0;
    rgba.copy(raw, rowStart + 1, y * width * 4, (y + 1) * width * 4);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });

  return Buffer.concat([
    sig,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', idat),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Canvas RGBA minimal avec blending alpha. */
function makeCanvas(size) {
  return {
    size,
    data: Buffer.alloc(size * size * 4), // transparent par défaut
  };
}

function blendPixel(canvas, x, y, r, g, b, a) {
  if (x < 0 || y < 0 || x >= canvas.size || y >= canvas.size || a <= 0) return;
  const idx = (y * canvas.size + x) * 4;
  const d = canvas.data;
  const sa = Math.min(1, a);
  const da = d[idx + 3] / 255;
  const outA = sa + da * (1 - sa);
  if (outA <= 0) return;
  d[idx]     = Math.round((r * sa + d[idx] * da * (1 - sa)) / outA);
  d[idx + 1] = Math.round((g * sa + d[idx + 1] * da * (1 - sa)) / outA);
  d[idx + 2] = Math.round((b * sa + d[idx + 2] * da * (1 - sa)) / outA);
  d[idx + 3] = Math.round(outA * 255);
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

/** Distance signée à un rectangle arrondi (pour coins arrondis). */
function roundedRectSDF(px, py, cx, cy, halfW, halfH, radius) {
  const qx = Math.abs(px - cx) - (halfW - radius);
  const qy = Math.abs(py - cy) - (halfH - radius);
  const ax = Math.max(qx, 0);
  const ay = Math.max(qy, 0);
  return Math.sqrt(ax * ax + ay * ay) + Math.min(Math.max(qx, qy), 0) - radius;
}

/** Remplit un polygone (crown, triangles) par test point-dans-polygone. */
function pointInPolygon(px, py, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1];
    const xj = poly[j][0], yj = poly[j][1];
    const intersect = ((yi > py) !== (yj > py)) &&
      (px < ((xj - xi) * (py - yi)) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Dessine l'icône premium : fond sombre dégradé, damier subtil,
 * pièce lumineuse avec couronne (identité CHECKERS LEGEND 2026).
 */
function drawIcon(size) {
  const canvas = makeCanvas(size);
  const S = size;

  // --- Fond : dégradé bleu nuit -> bleu roi avec halo cyan ---
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const tx = x / S;
      const ty = y / S;
      const d = roundedRectSDF(x + 0.5, y + 0.5, S / 2, S / 2, S / 2, S / 2, S * 0.18);
      if (d > 0) continue; // coins arrondis transparents

      // Dégradé diagonal bleu nuit -> bleu roi
      const t = clamp01((tx + ty) / 2);
      let r = Math.round(lerp(4, 13, t));
      let g = Math.round(lerp(10, 42, t));
      let b = Math.round(lerp(24, 92, t));

      // Halo cyan en haut à droite
      const dx = tx - 0.78, dy = ty - 0.2;
      const glow = Math.exp(-(dx * dx + dy * dy) * 14);
      r += Math.round(10 * glow);
      g += Math.round(55 * glow);
      b += Math.round(80 * glow);

      // Damier subtil (motif 10x10 du jeu)
      const cell = Math.floor(x / (S / 10)) + Math.floor(y / (S / 10));
      if (cell % 2 === 0) {
        r += 6; g += 6; b += 12;
      }

      // Bordure lumineuse
      const border = Math.exp(-Math.abs(d) * 90);
      r += Math.round(90 * border);
      g += Math.round(140 * border);
      b += Math.round(220 * border);

      blendPixel(canvas, x, y, r, g, b, 1);
    }
  }

  // --- Pièce centrale : disque avec dégradé rouge -> bleu -> cyan ---
  const cx = S / 2, cy = S * 0.52, radius = S * 0.27;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > radius + 2) continue;

      const t = clamp01((dx / radius + 1) / 2);
      const a = t < 0.5 ? [227, 6, 19] : [0, 51, 160];
      const z = t < 0.5 ? [0, 51, 160] : [0, 174, 240];
      const k = t < 0.5 ? t * 2 : (t - 0.5) * 2;
      const r = Math.round(lerp(a[0], z[0], k));
      const g = Math.round(lerp(a[1], z[1], k));
      const b = Math.round(lerp(a[2], z[2], k));

      // Anneau extérieur lumineux
      const ring = dist > radius * 0.86 ? 1 : 0;
      const edge = Math.exp(-Math.abs(dist - radius) * 8) * 0.8;

      if (ring) {
        blendPixel(canvas, x, y, 240, 245, 255, 0.95);
      } else {
        // Reflet supérieur gauche
        const sheen = Math.exp(-((dx + radius * 0.35) ** 2 + (dy + radius * 0.4) ** 2) / (radius * radius * 0.25)) * 0.35;
        blendPixel(canvas, x, y,
          Math.round(lerp(r, 255, sheen)),
          Math.round(lerp(g, 255, sheen)),
          Math.round(lerp(b, 255, sheen)),
          1);
      }
      if (edge > 0.05) {
        blendPixel(canvas, x, y, 180, 240, 255, edge * 0.5);
      }
    }
  }

  // --- Couronne dorée au centre de la pièce ---
  const crownScale = S * 0.00022;
  const crownW = S * 0.30, crownH = S * 0.20;
  const baseX = cx - crownW / 2, baseY = cy + crownH * 0.28;
  const crown = [
    [baseX, baseY],
    [baseX + crownW, baseY],
    [baseX + crownW, baseY - crownH * 0.35],
    [baseX + crownW * 0.82, baseY - crownH * 0.75],
    [baseX + crownW * 0.68, baseY - crownH * 0.35],
    [baseX + crownW * 0.50, baseY - crownH * 0.95],
    [baseX + crownW * 0.32, baseY - crownH * 0.35],
    [baseX + crownW * 0.18, baseY - crownH * 0.75],
    [baseX, baseY - crownH * 0.35],
  ];
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      if (!pointInPolygon(x + 0.5, y + 0.5, crown)) continue;
      // Dégradé doré vertical
      const t = clamp01((y - (baseY - crownH)) / crownH);
      const r = Math.round(lerp(255, 212, t));
      const g = Math.round(lerp(236, 160, t));
      const b = Math.round(lerp(150, 40, t));
      blendPixel(canvas, x, y, r, g, b, 1);
    }
  }
  // Trois perles sur les pointes
  const pearls = [
    [baseX + crownW * 0.18, baseY - crownH * 0.80],
    [baseX + crownW * 0.50, baseY - crownH * 1.00],
    [baseX + crownW * 0.82, baseY - crownH * 0.80],
  ];
  for (const [px, py] of pearls) {
    const pr = S * 0.018;
    for (let y = Math.floor(py - pr); y <= Math.ceil(py + pr); y++) {
      for (let x = Math.floor(px - pr); x <= Math.ceil(px + pr); x++) {
        const d = Math.sqrt((x - px) ** 2 + (y - py) ** 2);
        if (d <= pr) blendPixel(canvas, x, y, 255, 248, 220, 1);
      }
    }
  }

  return canvas;
}

console.log('Génération des icônes PWA :');
for (const size of [192, 512]) {
  const canvas = drawIcon(size);
  const png = encodePNG(size, size, canvas.data);
  const filePath = path.join(IMAGES_DIR, `icon-${size}.png`);
  fs.writeFileSync(filePath, png);
  console.log(`  OK  ${path.relative(ROOT, filePath)} (${png.length} octets)`);
}

/* ============================================================
 * 3. LOGO SVG (vectoriel, police Orbitron locale en fallback système)
 * ============================================================ */

const logoSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="200" viewBox="0 0 640 200" role="img" aria-label="Checkers Legend 2026">
  <defs>
    <linearGradient id="lgViolet" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#e30613"/>
      <stop offset="0.5" stop-color="#0033a0"/>
      <stop offset="1" stop-color="#00aef0"/>
    </linearGradient>
    <linearGradient id="lgGold" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffe082"/>
      <stop offset="1" stop-color="#d4a017"/>
    </linearGradient>
    <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="6" result="blur"/>
      <feMerge>
        <feMergeNode in="blur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
  </defs>

  <!-- Pièce emblème -->
  <g filter="url(#glow)">
    <circle cx="100" cy="100" r="66" fill="url(#lgViolet)" stroke="#ffffff" stroke-width="4"/>
    <circle cx="100" cy="100" r="52" fill="none" stroke="#ffffff" stroke-opacity="0.35" stroke-width="2"/>
    <!-- Couronne -->
    <path d="M70 118 L70 96 L84 108 L100 86 L116 108 L130 96 L130 118 Z"
          fill="url(#lgGold)" stroke="#8a5a00" stroke-width="1.5" stroke-linejoin="round"/>
    <circle cx="84" cy="93" r="4" fill="#fff8e1"/>
    <circle cx="100" cy="83" r="4.5" fill="#fff8e1"/>
    <circle cx="116" cy="93" r="4" fill="#fff8e1"/>
  </g>

  <!-- Texte -->
  <text x="196" y="92" font-family="Orbitron, 'Segoe UI', sans-serif" font-size="46" font-weight="800"
        fill="url(#lgViolet)" letter-spacing="2">CHECKERS</text>
  <text x="196" y="140" font-family="Orbitron, 'Segoe UI', sans-serif" font-size="46" font-weight="800"
        fill="#ffffff" letter-spacing="10">LEGEND</text>
  <text x="470" y="140" font-family="Orbitron, 'Segoe UI', sans-serif" font-size="46" font-weight="900"
        fill="url(#lgGold)" letter-spacing="1">2026</text>
</svg>
`;

fs.writeFileSync(path.join(IMAGES_DIR, 'logo.svg'), logoSvg);
console.log(`  OK  assets/images/logo.svg (${Buffer.byteLength(logoSvg)} octets)`);

/* ============================================================
 * 4. FEUILLE DE STYLE DES POLICES LOCALES (@font-face)
 * ============================================================ */

const fontFaces = [];
const orbitronWeights = [400, 500, 600, 700, 800, 900];
const rajdhaniWeights = [400, 500, 600, 700];

for (const w of orbitronWeights) {
  fontFaces.push(`@font-face {
  font-family: 'Orbitron';
  font-style: normal;
  font-weight: ${w};
  font-display: swap;
  src: url('orbitron-latin-${w}-normal.woff2') format('woff2');
}`);
}
for (const w of rajdhaniWeights) {
  fontFaces.push(`@font-face {
  font-family: 'Rajdhani';
  font-style: normal;
  font-weight: ${w};
  font-display: swap;
  src: url('rajdhani-latin-${w}-normal.woff2') format('woff2');
}`);
}

const fontsCss = `/* CHECKERS LEGEND 2026 — Polices locales (aucun chargement distant)
 * Orbitron & Rajdhani — licence SIL Open Font License 1.1
 * Fichiers récupérés par scripts/fetch-dependencies.ps1 (via @fontsource)
 */
${fontFaces.join('\n\n')}
`;
fs.writeFileSync(path.join(ROOT, 'assets', 'fonts', 'fonts.css'), fontsCss);
console.log(`  OK  assets/fonts/fonts.css (${Buffer.byteLength(fontsCss)} octets)`);

console.log('\nGénération terminée.');
