/**
 * CHECKERS LEGEND 2026 — Gestionnaire de stockage local
 * ------------------------------------------------------
 * Encapsule localStorage avec :
 *  - espace de noms (préfixe cl2026:)
 *  - versioning du schéma + migrations futures
 *  - tolérance aux erreurs (mode navigation privée, quota dépassé)
 */
(function (global) {
  'use strict';

  const CFG = global.GameConfig;

  const StorageManager = {
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

    _key(key) {
      return CFG.STORAGE.PREFIX + key;
    },

    /** Lit une valeur versionnée. Retourne fallback si absente/corrompue. */
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

    /** Écrit une valeur avec la version courante du schéma. */
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

  global.StorageManager = StorageManager;
  if (typeof module !== 'undefined' && module.exports) module.exports = StorageManager;
})(typeof globalThis !== 'undefined' ? globalThis : this);
