/**
 * CHECKERS LEGEND 2026 — Service Worker
 * --------------------------------------
 * Cache 100 % local des ressources du jeu, gestion des versions et
 * fonctionnement hors ligne complet (HTML, CSS, JS, polices, sons, icônes).
 * Aucune ressource distante n'est mise en cache.
 */
'use strict';

const CACHE_PREFIX = 'checkers-legend-2026-';
const CACHE_NAME = CACHE_PREFIX + 'v1.3.0';

const PRECACHE = [
  './',
  './index.html',
  './style.css',
  './script.js',
  './manifest.json',
  './config/game-config.js',
  './js/game-rules.js',
  './js/game-engine.js',
  './js/ai-engine.js',
  './js/ai-worker.js',
  './js/storage-manager.js',
  './js/profile-manager.js',
  './js/settings-manager.js',
  './js/statistics.js',
  './js/audio-manager.js',
  './js/animations.js',
  './js/particles-background.js',
  './js/board-renderer.js',
  './js/puzzles.js',
  './vendor/bootstrap/css/bootstrap.min.css',
  './vendor/bootstrap/js/bootstrap.bundle.min.js',
  './assets/fonts/fonts.css',
  './assets/fonts/orbitron-latin-400-normal.woff2',
  './assets/fonts/orbitron-latin-500-normal.woff2',
  './assets/fonts/orbitron-latin-600-normal.woff2',
  './assets/fonts/orbitron-latin-700-normal.woff2',
  './assets/fonts/orbitron-latin-800-normal.woff2',
  './assets/fonts/orbitron-latin-900-normal.woff2',
  './assets/fonts/rajdhani-latin-400-normal.woff2',
  './assets/fonts/rajdhani-latin-500-normal.woff2',
  './assets/fonts/rajdhani-latin-600-normal.woff2',
  './assets/fonts/rajdhani-latin-700-normal.woff2',
  './assets/images/icon-192.png',
  './assets/images/icon-512.png',
  './assets/images/logo.svg',
  './assets/images/carnage-demo.gif',
  './assets/sounds/click.wav',
  './assets/sounds/move.wav',
  './assets/sounds/capture.wav',
  './assets/sounds/promote.wav',
  './assets/sounds/victory.wav',
  './assets/sounds/draw.wav',
  './assets/sounds/invalid.wav',
  './assets/icons/arrow-left.svg',
  './assets/icons/check.svg',
  './assets/icons/chess-pawn.svg',
  './assets/icons/chess-queen.svg',
  './assets/icons/chevron-left.svg',
  './assets/icons/clock.svg',
  './assets/icons/cpu.svg',
  './assets/icons/crown.svg',
  './assets/icons/crown-solid.svg',
  './assets/icons/download.svg',
  './assets/icons/upload.svg',
  './assets/icons/fullscreen.svg',
  './assets/icons/gamepad.svg',
  './assets/icons/help-circle.svg',
  './assets/icons/history.svg',
  './assets/icons/info.svg',
  './assets/icons/log-out.svg',
  './assets/icons/maximize.svg',
  './assets/icons/moon.svg',
  './assets/icons/sun.svg',
  './assets/icons/medal.svg',
  './assets/icons/menu.svg',
  './assets/icons/pause-circle.svg',
  './assets/icons/pause.svg',
  './assets/icons/play-circle.svg',
  './assets/icons/play.svg',
  './assets/icons/refresh-cw.svg',
  './assets/icons/rotate-ccw.svg',
  './assets/icons/rotate-cw.svg',
  './assets/icons/settings.svg',
  './assets/icons/sparkles.svg',
  './assets/icons/star.svg',
  './assets/icons/timer.svg',
  './assets/icons/trophy.svg',
  './assets/icons/undo.svg',
  './assets/icons/user.svg',
  './assets/icons/users.svg',
  './assets/icons/volume-2.svg',
  './assets/icons/volume-x.svg',
  './assets/icons/x-circle.svg',
  './assets/icons/x.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Navigation : réseau d'abord, puis cache (mode hors ligne).
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)).catch(() => {});
          }
          return response;
        })
        .catch(() => caches.match(request).then((cached) =>
          cached || caches.match('./index.html')
        ))
    );
    return;
  }

  // Ressources : cache d'abord, revalidation silencieuse en arrière-plan.
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response && response.ok && response.type === 'basic') {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)).catch(() => {});
          }
          return response;
        })
        .catch(() => null);

      if (cached) {
        event.waitUntil(network);
        return cached;
      }
      return network.then((response) => response || caches.match('./index.html'));
    })
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
