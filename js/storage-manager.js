/**
 * CHECKERS LEGEND 2026 — Gestionnaire de stockage local
 * ------------------------------------------------------
 * Encapsule localStorage avec :
 *  - espace de noms (préfixe cl2026:)
 *  - versioning du schéma + migrations futures
 *  - tolérance aux erreurs (mode navigation privée, quota dépassé)
 */

/**
 * POUR BIEN DÉBUTER
 * -----------------
 * localStorage est un espace de stockage du navigateur qui conserve des paires
 * clé/valeur même après la fermeture de la page. Il n'accepte que du TEXTE.
 *
 * Pour y ranger des objets, on utilise JSON : JSON.stringify() transforme un
 * objet en texte, JSON.parse() fait l'inverse. On appelle cela la sérialisation.
 *
 * Le « versioning » consiste à enregistrer { version, data } : si le format
 * change plus tard, on saura convertir (migrer) les anciennes données sans les
 * perdre. Ici, la version vient de GameConfig.STORAGE.VERSION.
 *
 * Tout est enveloppé dans une IIFE (fonction immédiatement appelée) : les
 * variables internes restent privées, seul StorageManager est rendu public.
 * Les blocs try/catch rendent le code tolérant aux erreurs (navigation privée,
 * quota dépassé) : au lieu de planter, on retourne une valeur de repli.
 */
(function (global) {
  'use strict';

  // CFG = configuration globale (préfixe, version, noms de clés).
  // Le préfixe 'cl2026:' est ajouté par _key() à chaque nom de clé.
  const CFG = global.GameConfig;

  const StorageManager = {
    /**
     * Vérifie si localStorage est utilisable.
     * On écrit puis on supprime une clé de test : c'est le test le plus fiable,
     * car une lecture peut réussir alors que l'écriture est bloquée.
     * @returns {boolean} true si le stockage fonctionne, false sinon.
     */
    isAvailable() {
      try {
        const k = '__cl2026_test__';
        global.localStorage.setItem(k, '1');
        global.localStorage.removeItem(k);
        return true;
      } catch (e) {
        return false;
      }
    },

    /**
     * Construit la clé complète en ajoutant le préfixe (cl2026:).
     * @param {string} key nom court de la clé (ex. 'settings').
     * @returns {string} clé complète à utiliser avec localStorage.
     */
    _key(key) {
      return CFG.STORAGE.PREFIX + key;
    },

    /**
     * Lit une valeur versionnée. Retourne fallback si absente/corrompue.
     * Le texte brut est converti avec JSON.parse(). Si l'objet contient
     * 'version' et 'data', on vérifie la version ; sinon on accepte l'ancien
     * format directement, pour rester compatible avec les vieilles sauvegardes.
     * @param {string} key nom court de la clé.
     * @param {*} fallback valeur renvoyée si rien n'est trouvé.
     * @returns {*} la donnée lue, ou fallback.
     */
    get(key, fallback) {
      try {
        const raw = global.localStorage.getItem(this._key(key));
        if (!raw) return fallback;
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object' && 'version' in parsed && 'data' in parsed) {
          if (parsed.version === CFG.STORAGE.VERSION) return parsed.data;
          const migrated = this._migrate(key, parsed);
          return migrated !== undefined ? migrated : fallback;
        }
        // Ancien format non versionné : on l'accepte tel quel.
        return parsed;
      } catch (e) {
        console.warn('[Storage] lecture impossible :', key, e);
        return fallback;
      }
    },

    /**
     * Écrit une valeur avec la version courante du schéma.
     * JSON.stringify() transforme l'objet { version, data } en texte.
     * @param {string} key nom court de la clé.
     * @param {*} data donnée à enregistrer.
     * @returns {boolean} true si l'écriture a réussi, false sinon.
     */
    set(key, data) {
      try {
        global.localStorage.setItem(this._key(key), JSON.stringify({
          version: CFG.STORAGE.VERSION,
          data: data
        }));
        return true;
      } catch (e) {
        console.warn('[Storage] écriture impossible :', key, e);
        return false;
      }
    },

    /**
     * Supprime une clé du stockage local.
     * @param {string} key nom court de la clé à supprimer.
     * @returns {boolean} true si la suppression a réussi, false sinon.
     */
    remove(key) {
      try {
        global.localStorage.removeItem(this._key(key));
        return true;
      } catch (e) {
        return false;
      }
    },

    /**
     * Migrations de schéma. Ajouter ici les conversions lors des évolutions.
     * Exemple futur : if (stored.version === 1) { data = ...; version = 2; }
     * Une migration convertit une ancienne structure de données vers la
     * nouvelle. Pour l'instant (version 1), il n'y a rien à convertir.
     * @param {string} key nom court de la clé (utile pour les messages d'erreur).
     * @param {{version: number, data: *}} stored objet lu dans le stockage.
     * @returns {*} les données converties, ou telles quelles.
     */
    _migrate(key, stored) {
      let data = stored.data;
      let version = stored.version;
      // Aucune migration nécessaire pour l'instant (version 1).
      if (version !== CFG.STORAGE.VERSION) {
        console.warn('[Storage] version inconnue pour', key, version);
      }
      return data;
    }
  };

  // Motif UMD : on publie l'objet dans le navigateur (global.StorageManager)
  // et on l'exporte aussi pour Node (module.exports).
  global.StorageManager = StorageManager;
  if (typeof module !== 'undefined' && module.exports) module.exports = StorageManager;
})(typeof globalThis !== 'undefined' ? globalThis : this);
