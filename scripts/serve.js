/**
 * CHECKERS LEGEND 2026 — Serveur HTTP local
 * ------------------------------------------
 * Sert le jeu avec les bons types MIME pour permettre l'installation PWA
 * et le Service Worker (qui ne fonctionnent pas avec file://).
 *
 * Usage : node scripts/serve.js [port]
 * Puis ouvrir http://localhost:8080
 */
'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.argv[2] || process.env.PORT || 8080);
const HOST = process.env.HOST || '127.0.0.1';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.wav': 'audio/wav',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8'
};

function send(res, status, body, headers) {
  res.writeHead(status, Object.assign({
    'Content-Type': 'text/plain; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer'
  }, headers || {}));
  res.end(body);
}

const server = http.createServer((req, res) => {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch (error) {
    send(res, 400, 'Requête invalide');
    return;
  }

  if (pathname === '/') pathname = '/index.html';

  const filePath = path.resolve(ROOT, '.' + pathname);
  if (!filePath.startsWith(ROOT + path.sep)) {
    send(res, 403, 'Accès interdit');
    return;
  }

  fs.stat(filePath, (error, stat) => {
    if (error || !stat.isFile()) {
      send(res, 404, 'Ressource introuvable : ' + pathname);
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const headers = {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Content-Length': stat.size,
      'Cache-Control': 'no-cache'
    };
    if (path.basename(filePath) === 'service-worker.js') {
      headers['Service-Worker-Allowed'] = '/';
      headers['Cache-Control'] = 'no-store';
    }

    res.writeHead(200, headers);
    const stream = fs.createReadStream(filePath);
    stream.on('error', () => {
      res.destroy();
    });
    stream.pipe(res);
  });
});

server.listen(PORT, HOST, () => {
  console.log('CHECKERS LEGEND 2026');
  console.log('Serveur local : http://' + HOST + ':' + PORT);
  console.log('Appuyez sur Ctrl+C pour arrêter.');
});
