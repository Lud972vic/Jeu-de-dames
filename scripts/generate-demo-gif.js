/**
 * CHECKERS LEGEND 2026 — Générateur du GIF de démonstration
 * ---------------------------------------------------------
 * Crée `assets/images/carnage-demo.gif` : une courte animation qui montre les
 * trois effets de capture (frappe royale, décapitation, carnage).
 *
 * Aucune dépendance : le dessin est fait par un canvas dans Edge/Chrome
 * headless, et l'encodage GIF (LZW) est écrit à la main dans ce fichier.
 *
 * Usage : node scripts/generate-demo-gif.js   (ou npm run gif)
 */
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'assets', 'images', 'carnage-demo.gif');
const TEMP = path.join(os.tmpdir(), 'cl2026-gif-' + process.pid);

const BROWSERS = [
  process.env.EDGE_PATH,
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'
].filter(Boolean);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Client CDP minimal (le même motif que le test de fumée navigateur). */
class CDP {
  constructor(url) {
    this.url = url;
    this.nextId = 1;
    this.pending = new Map();
  }
  connect() {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(this.url);
      const timer = setTimeout(() => reject(new Error('Connexion CDP impossible')), 10000);
      socket.addEventListener('open', () => { clearTimeout(timer); resolve(socket); });
      socket.addEventListener('error', (event) => {
        clearTimeout(timer);
        reject(new Error('WebSocket CDP : ' + event.message));
      });
      socket.addEventListener('message', (event) => {
        let message;
        try { message = JSON.parse(event.data); } catch (error) { return; }
        if (!message.id) return;
        const item = this.pending.get(message.id);
        if (!item) return;
        this.pending.delete(message.id);
        if (message.error) item.reject(new Error(message.error.message));
        else item.resolve(message.result);
      });
    }).then((socket) => { this.socket = socket; });
  }
  send(method, params) {
    return new Promise((resolve, reject) => {
      const id = this.nextId++;
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params: params || {} }));
    });
  }
}

function findBrowser() {
  for (const candidate of BROWSERS) {
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new Error('Aucun navigateur Edge/Chrome trouvé.');
}

/**
 * Code exécuté DANS le navigateur : dessine 20 images, les quantifie sur une
 * palette de 256 couleurs, les compresse en GIF et renvoie le tout en base64.
 * @returns {string} expression JavaScript à passer à Runtime.evaluate
 */
function browserCode() {
  return `(function () {
  var W = 480, H = 320, FRAMES = 20;
  var canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  var ctx = canvas.getContext('2d');

  // Palette web-safe 6x6x6 (216 couleurs) complétée jusqu'à 256.
  var palette = [], i, j, k;
  for (i = 0; i < 6; i++) for (j = 0; j < 6; j++) for (k = 0; k < 6; k++) {
    palette.push([i * 51, j * 51, k * 51]);
  }
  while (palette.length < 256) palette.push([0, 0, 0]);
  var cache = new Map();
  function nearest(r, g, b) {
    var key = (r << 16) | (g << 8) | b;
    var hit = cache.get(key);
    if (hit !== undefined) return hit;
    var best = 0, bestDist = 1e9, n, d, dr, dg, db;
    for (n = 0; n < palette.length; n++) {
      dr = r - palette[n][0]; dg = g - palette[n][1]; db = b - palette[n][2];
      d = dr * dr + dg * dg + db * db;
      if (d < bestDist) { bestDist = d; best = n; }
    }
    cache.set(key, best);
    return best;
  }

  // Générateur aléatoire déterministe : les mêmes images à chaque exécution.
  function rand(seed) {
    var x = Math.sin(seed * 12.9898) * 43758.5453;
    return x - Math.floor(x);
  }

  function disc(x, y, r, color) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  }

  function crown(x, y, size) {
    ctx.beginPath();
    ctx.moveTo(x - size, y + size * 0.6);
    ctx.lineTo(x - size * 0.8, y - size * 0.5);
    ctx.lineTo(x - size * 0.35, y + size * 0.1);
    ctx.lineTo(x, y - size * 0.8);
    ctx.lineTo(x + size * 0.35, y + size * 0.1);
    ctx.lineTo(x + size * 0.8, y - size * 0.5);
    ctx.lineTo(x + size, y + size * 0.6);
    ctx.closePath();
    ctx.fillStyle = '#fbbf24';
    ctx.fill();
  }

  function label(text, color) {
    ctx.font = 'bold 27px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.lineWidth = 5;
    ctx.strokeStyle = '#1a0000';
    ctx.strokeText(text, W / 2, 306);
    ctx.fillStyle = color;
    ctx.fillText(text, W / 2, 306);
  }

  // Dessine une image complète : plateau, pièces, puis l'effet du moment.
  function drawFrame(f) {
    ctx.fillStyle = '#0b0b18';
    ctx.fillRect(0, 0, W, H);

    var cell = 34, ox = 73, oy = 14;
    for (var row = 0; row < 8; row++) {
      for (var col = 0; col < 8; col++) {
        ctx.fillStyle = (row + col) % 2 ? '#20203c' : '#33335a';
        ctx.fillRect(ox + col * cell, oy + row * cell, cell, cell);
      }
    }

    // Pions de décor et dame attaquante (case 2,4), victime (case 4,4).
    var decor = [[0,0],[2,0],[6,1],[1,2],[7,2],[0,4],[6,5],[2,7],[5,7],[7,6]];
    for (var d = 0; d < decor.length; d++) {
      disc(ox + decor[d][0] * cell + cell / 2, oy + decor[d][1] * cell + cell / 2, 11, '#d8455a');
    }
    var qx = ox + (2 + Math.min(1, f / 4)) * cell + cell / 2;
    var qy = oy + 4 * cell + cell / 2;
    var vx = ox + 4 * cell + cell / 2;
    var vy = qy;

    if (f >= 7 && f <= 16) {
      // Victime remplacée par une flaque.
      disc(vx, vy + 6, 16 + f, '#8b0000');
    } else {
      disc(vx, vy, 11, '#b91c3c');
    }

    // Dame : deux disques empilés + couronne.
    disc(qx, qy + 5, 12, '#dbeafe');
    disc(qx, qy - 5, 12, '#f8fafc');
    crown(qx, qy - 14, 9);

    // Phase 1 : lame dorée et étincelles.
    if (f >= 3 && f <= 6) {
      var t = (f - 3) / 3;
      ctx.strokeStyle = 'rgba(255, 236, 160, ' + (1 - t * 0.4) + ')';
      ctx.lineWidth = 6 - t * 3;
      ctx.beginPath();
      ctx.moveTo(qx + 6, qy - 6);
      ctx.lineTo(vx - 6, vy + 6);
      ctx.stroke();
      for (var s = 0; s < 28; s++) {
        var a = rand(s + f * 31) * Math.PI * 2;
        var rr = rand(s * 7 + f) * (20 + t * 55);
        disc(vx + Math.cos(a) * rr, vy + Math.sin(a) * rr, 2 + rand(s) * 2, '#fbbf24');
      }
      label('FRAPPE ROYALE !', '#ffe9a8');
    }

    // Phase 2 : tête et couronne qui volent + jet de sang.
    if (f >= 7 && f <= 11) {
      var p = (f - 7) / 4;
      for (var b = 0; b < 42; b++) {
        var ang = -Math.PI / 2 + (rand(b * 3 + f) - 0.5) * 1.1;
        var sp = rand(b + f * 17) * (18 + p * 55);
        disc(vx + Math.cos(ang) * sp, vy + Math.sin(ang) * sp + p * p * 30,
          2 + rand(b) * 4, b % 3 ? '#dc0038' : '#ff4d6d');
      }
      disc(vx - 40 * p, vy - 46 * Math.sin(p * Math.PI) + p * 45, 11, '#c81e3a');
      crown(vx + 45 * p, vy - 62 * Math.sin(p * Math.PI) + p * 60, 10);
      label('OFF WITH HER HEAD !', '#ff9b9b');
    }

    // Phase 3 : éclaboussures et flash rouge.
    if (f >= 12 && f <= 16) {
      var q = (f - 12) / 4;
      ctx.fillStyle = 'rgba(190, 0, 20, ' + (0.45 * (1 - q)) + ')';
      ctx.fillRect(0, 0, W, H);
      for (var e = 0; e < 70; e++) {
        var ex = rand(e * 11 + 5) * W;
        var ey = rand(e * 13 + 9) * 280;
        disc(ex, ey, 2 + rand(e) * 9 * (1 - q * 0.3), e % 4 ? '#a30020' : '#ff1e3c');
      }
      label('MASSACRE !', '#ff6b6b');
    }

    if (f >= 17) label('CHECKERS LEGEND 2026', '#7dd3fc');

    // Petit bandeau.
    ctx.font = 'bold 13px Arial, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#94a3b8';
    ctx.fillText('DEMO · CAPTURES', 12, 12);
  }

  // --- Encodage GIF89a ---------------------------------------------------
  function lzw(indices) {
    var clear = 256, eoi = 257;
    var next = eoi + 1, codeSize = 9;
    var dict = new Map();
    var out = [], bits = 0, count = 0;
    function emit(code) {
      bits |= code << count;
      count += codeSize;
      while (count >= 8) { out.push(bits & 255); bits >>= 8; count -= 8; }
      // « Early change » GIF : la taille augmente APRÈS avoir écrit le code,
      // sinon le décodeur décalle d'un symbole et l'image est illisible.
      if (next > (1 << codeSize) - 1 && codeSize < 12) codeSize++;
    }
    emit(clear);
    var prefix = String(indices[0]);
    for (var i = 1; i < indices.length; i++) {
      var key = prefix + ',' + indices[i];
      if (dict.has(key)) { prefix = key; continue; }
      emit(dict.has(prefix) ? dict.get(prefix) : Number(prefix));
      if (next < 4096) {
        dict.set(key, next++);
      } else {
        emit(clear);
        dict.clear(); next = eoi + 1; codeSize = 9;
      }
      prefix = String(indices[i]);
    }
    emit(dict.has(prefix) ? dict.get(prefix) : Number(prefix));
    emit(eoi);
    if (count > 0) out.push(bits & 255);
    return out;
  }

  function encode(frames) {
    var bytes = [];
    function byte(v) { bytes.push(v & 255); }
    function short(v) { byte(v); byte(v >> 8); }
    function text(s) { for (var a = 0; a < s.length; a++) byte(s.charCodeAt(a)); }

    text('GIF89a');
    short(W); short(H);
    byte(0xF7); byte(0); byte(0); // table globale 256 couleurs
    for (var p = 0; p < 256; p++) for (var c = 0; c < 3; c++) byte(palette[p][c]);

    // Boucle infinie (Netscape).
    byte(0x21); byte(0xFF); byte(0x0B);
    text('NETSCAPE2.0');
    byte(0x03); byte(0x01); byte(0x00); byte(0x00); byte(0x00);

    for (var f = 0; f < frames.length; f++) {
      byte(0x21); byte(0xF9); byte(0x04); byte(0x00); byte(0x08); byte(0x00); byte(0x00); byte(0x00);
      byte(0x2C); short(0); short(0); short(W); short(H); byte(0x00);
      byte(8);
      var packed = lzw(frames[f]);
      for (var o = 0; o < packed.length; o += 255) {
        var chunk = packed.slice(o, o + 255);
        byte(chunk.length);
        for (var z = 0; z < chunk.length; z++) byte(chunk[z]);
      }
      byte(0);
    }
    byte(0x3B);
    return bytes;
  }

  var frames = [];
  for (var f = 0; f < FRAMES; f++) {
    drawFrame(f);
    var data = ctx.getImageData(0, 0, W, H).data;
    var indices = new Uint8Array(W * H);
    for (var i = 0; i < indices.length; i++) {
      indices[i] = nearest(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]);
    }
    frames.push(indices);
  }
  var bytes = encode(frames);
  var binary = '';
  for (var q = 0; q < bytes.length; q += 8192) {
    binary += String.fromCharCode.apply(null, bytes.slice(q, q + 8192));
  }
  return btoa(binary);
})()`;
}

async function main() {
  fs.mkdirSync(TEMP, { recursive: true });
  let browser = null;
  let socket = null;
  try {
    browser = spawn(findBrowser(), [
      '--headless=new', '--disable-gpu', '--no-first-run',
      '--no-default-browser-check', '--disable-background-networking',
      '--remote-debugging-port=0', '--user-data-dir=' + TEMP, 'about:blank'
    ], { stdio: 'ignore' });

    const portFile = path.join(TEMP, 'DevToolsActivePort');
    let port = null;
    for (let i = 0; i < 100 && !port; i++) {
      if (fs.existsSync(portFile)) {
        port = Number(fs.readFileSync(portFile, 'utf8').split(/\r?\n/)[0]) || null;
      }
      if (!port) await sleep(100);
    }
    if (!port) throw new Error('Port CDP indisponible.');

    let target = null;
    for (let i = 0; i < 100 && !target; i++) {
      try {
        const response = await fetch('http://127.0.0.1:' + port + '/json/list');
        const list = await response.json();
        target = list.find((entry) => entry.type === 'page') || null;
      } catch (error) { /* navigateur pas encore prêt */ }
      if (!target) await sleep(100);
    }
    if (!target) throw new Error('Onglet CDP introuvable.');

    const cdp = new CDP(target.webSocketDebuggerUrl);
    await cdp.connect();
    socket = cdp.socket;
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    const result = await cdp.send('Runtime.evaluate', {
      expression: browserCode(),
      returnByValue: true,
      awaitPromise: false
    });
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.text || 'Erreur JavaScript dans le navigateur');
    }
    const buffer = Buffer.from(result.result.value, 'base64');
    if (buffer.subarray(0, 6).toString('ascii') !== 'GIF89a') {
      throw new Error('L’en-tête GIF est invalide.');
    }
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, buffer);
    console.log('GIF créé : ' + path.relative(ROOT, OUT) + ' (' +
      (buffer.length / 1024).toFixed(0) + ' Ko, 20 images)');
  } finally {
    if (socket) socket.close();
    if (browser) browser.kill();
    await sleep(200);
    fs.rmSync(TEMP, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error('Échec de la génération du GIF : ' + error.message);
  process.exitCode = 1;
});
