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

/**
 * POUR BIEN COMMENCER (débutant) — Ce fichier est un « Web Worker » : un second
 * programme qui tourne en arrière-plan, en parallèle de l'interface. Pendant que
 * l'IA réfléchit, l'interface reste réactive (elle n'est pas figée).
 * ---------------------------------------------------------------------------
 * Notions JavaScript utilisées :
 *  - 'use strict' : mode strict, qui signale certaines erreurs.
 *  - importScripts() : charge d'autres fichiers de script DANS le Worker. C'est
 *    l'équivalent des balises <script> du navigateur, mais pour ce thread-ci.
 *    On y charge la config, les règles et le moteur d'IA (chemins relatifs).
 *  - self : l'objet « global » à l'intérieur du Worker (l'équivalent de window).
 *  - événement / callback : onmessage est une fonction appelée automatiquement
 *    quand un message arrive ; c'est une forme de programmation « réactive ».
 *  - postMessage() : envoie un message (un simple objet) au programme principal.
 *    On ne partage pas de variables : tout passe par des messages. C'est le
 *    protocole décrit en haut du fichier (types search / progress / result / error).
 *  - promesse : pas utilisée ici ; le Worker répond plus tard avec un message,
 *    ce qui joue le même rôle que cette « réponse future ».
 *  - try / catch : attrape les erreurs pour répondre avec un message d'erreur
 *    au lieu de faire planter silencieusement le Worker.
 * Pour lire : regardez importScripts, puis onmessage, puis les postMessage.
 */
'use strict';

// On importe les trois briques dont l'IA a besoin, dans le bon ordre.
importScripts('../config/game-config.js', 'game-rules.js', 'ai-engine.js');

/**
 * Fonction appelée à chaque message reçu du programme principal (l'interface).
 * Elle ignore les messages qui ne sont pas une demande 'search', lance l'IA,
 * relaie les progrès, puis renvoie le résultat ou une erreur.
 * @param {object} event événement : event.data contient les données envoyées
 * @returns {void} rien : la communication se fait uniquement par postMessage()
 */
self.onmessage = function (event) {
  const data = event.data || {}; // valeur par défaut si le message est vide
  if (data.type !== 'search') return; // on ne traite que les demandes de recherche

  const id = data.id; // identifiant renvoyé avec chaque réponse, pour faire le lien
  try {
    const result = CheckersAI.search(data.board, data.player, {
      difficulty: data.difficulty,
      timeMs: data.timeMs,
      capturesOptional: !!data.capturesOptional,
      chainCaptures: !!data.chainCaptures,
      /**
       * Callback (fonction « rappel ») appelée par l'IA à chaque profondeur
       * terminée. Elle renvoie un message 'progress' sans attendre la fin,
       * pour afficher l'avancement de la réflexion.
       * @param {object} progress { depth, score, nodes, timeMs }
       * @returns {void} rien
       */
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

    // La recherche est finie : on envoie le meilleur coup et les statistiques.
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
    // En cas d'erreur, on prévient l'interface au lieu de laisser le Worker
    // mourir sans réponse. Le message garde le même 'id' que la demande.
    self.postMessage({
      type: 'error',
      id: id,
      message: err && err.message ? err.message : String(err)
    });
  }
};
