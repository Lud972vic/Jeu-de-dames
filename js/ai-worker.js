/**
 * CHECKERS LEGEND 2026 — Web Worker de l'IA
 * ------------------------------------------
 * Exécute la recherche Minimax + Alpha-Bêta hors du thread principal :
 * l'interface ne se bloque jamais pendant la réflexion de l'ordinateur.
 *
 * Protocole :
 *   -> { type: 'search', id, board, player, difficulty, timeMs?, capturesOptional?, chainCaptures? }
 *   <- { type: 'progress', id, depth, score, nodes, timeMs }
 *   <- { type: 'result', id, move, score, depth, nodes, timeMs }
 *   <- { type: 'error', id, message }
 *
 * L'annulation se fait côté interface via worker.terminate() puis recréation.
 */
'use strict';

importScripts('../config/game-config.js', 'game-rules.js', 'ai-engine.js');

self.onmessage = function (event) {
  const data = event.data || {};
  if (data.type !== 'search') return;

  const id = data.id;
  try {
    const result = CheckersAI.search(data.board, data.player, {
      difficulty: data.difficulty,
      timeMs: data.timeMs,
      capturesOptional: !!data.capturesOptional,
      chainCaptures: !!data.chainCaptures,
      onProgress: function (progress) {
        self.postMessage({
          type: 'progress',
          id: id,
          depth: progress.depth,
          score: progress.score,
          nodes: progress.nodes,
          timeMs: progress.timeMs
        });
      }
    });

    self.postMessage({
      type: 'result',
      id: id,
      move: result.move,
      score: result.score,
      depth: result.depth,
      nodes: result.nodes,
      timeMs: result.timeMs,
      forced: !!result.forced
    });
  } catch (err) {
    self.postMessage({
      type: 'error',
      id: id,
      message: err && err.message ? err.message : String(err)
    });
  }
};
