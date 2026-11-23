# CHECKERS LEGEND 2026 — Architecture technique

Document de référence pour la phase 0 (Architecture & préparation). Il décrit l'architecture générale, les responsabilités des modules, les dépendances et le plan de tests. Aucune fonctionnalité n'est implémentée à cette étape.

---

## 1. Principes directeurs

- **100 % offline** : aucune ressource distante (CDN, API, Cloud) dans la version finale. Toutes les dépendances sont intégrées localement.
- **Séparation stricte des responsabilités** : moteur de règles indépendant du rendu graphique ; l'IA est indépendante de l'interface et s'exécute dans un Web Worker.
- **JavaScript Vanilla** + Bootstrap 5 (responsive) — pas de framework lourd.
- **Qualité & testabilité** : le moteur de jeu et l'IA sont des modules purs, testables via Node sans navigateur.
- **PWA installable** avec Service Worker pour un fonctionnement hors ligne complet après installation.

---

## 2. Arborescence complète du projet

```
CHECKERS-LEGEND-2026/
│
├── index.html                    # Point d'entrée unique (structure HTML)
├── style.css                     # Design premium global (thème sombre, glassmorphism)
├── script.js                     # Bootstrap de l'application : initialisation, routage des vues
│
├── assets/
│   ├── fonts/                    # Polices locales (ex: Orbitron / Rajdhani .woff2 — Phase 1)
│   ├── icons/                    # Icônes SVG locales (Lucide-style, inline ou fichiers)
│   ├── images/                   # Logos, textures de fond
│   ├── textures/                 # Texture du plateau (bois premium / verre lumineux)
│   ├── sounds/                   # Sons locaux : déplacement, capture, victoire (Phase 1)
│   └── animations/               # Ressources d'animation éventuelles
│
├── vendor/
│   ├── bootstrap/
│   │   ├── css/bootstrap.min.css
│   │   └── js/bootstrap.bundle.min.js
│   ├── lucide/                   # Icônes locales (SVG inline ou script local)
│   └── libraries/                # Bibliothèques complémentaires éventuelles
│
├── js/
│   ├── game-engine.js            # Moteur de jeu : état, alternance, historique, annulation (indépendant du rendu)
│   ├── game-rules.js             # Règles internationales : déplacements, captures obligatoires, prises multiples, prise majoritaire, promotion, victoire/match nul
│   ├── ai-engine.js              # IA : Minimax + Alpha-Bêta, évaluation stratégique, optimisations (move ordering, transposition table, Zobrist, iterative deepening, quiescence)
│   ├── ai-worker.js              # Web Worker exécutant l'IA en arrière-plan (annulation possible)
│   ├── board-renderer.js         # Rendu du plateau et des pions (DOM/CSS), sélection, coups possibles
│   ├── animations.js             # Animations de déplacement, capture, promotion, confetti
│   ├── audio-manager.js          # Gestion des sons locaux (Web Audio API / <audio>)
│   ├── storage-manager.js        # Sauvegardes locales (LocalStorage/IndexedDB) avec versioning de schéma
│   ├── settings-manager.js       # Paramètres utilisateur persistés localement
│   └── statistics.js             # Statistiques victoires/défaites, XP, niveaux, récompenses
│
├── config/
│   └── game-config.js            # Configuration globale : tailles, profondeurs par difficulté, valeurs d'évaluation, constantes
│
├── tests/
│   ├── run-tests.js              # Runner de tests minimaliste (node:test) — zéro dépendance externe
│   └── test-*.js                 # Tests du moteur de règles et de l'IA
│
├── scripts/
│   ├── fetch-dependencies.ps1    # Script reproductible de récupération des dépendances (Phase 1)
│   └── serve.py / serve.js       # Mini serveur HTTP local pour lancer le jeu (Service Worker requis)
│
├── docs/
│   └── ARCHITECTURE.md           # Ce document
│
├── manifest.json                 # PWA : nom, icônes, couleurs, mode standalone
├── service-worker.js             # Cache offline des ressources locales + gestion des mises à jour
├── README.md                     # Documentation complète (Phase 10)
├── PROJECT_STATUS.md             # Suivi du projet (mis à jour à chaque phase)
└── .gitignore                    # Exclusions éventuelles
```

---

## 3. Responsabilités des modules

| Module | Rôle | Dépendances internes | Indépendant de l'UI ? |
|--------|------|---------------------|----------------------|
| `game-rules.js` | Logique pure : représentation du plateau (10x10), génération des coups légaux (captures obligatoires, prises multiples, prise majoritaire, promotion en dame), détection victoire/match nul (répétition de position, limitation des coups sans progression). Aucune dépendance DOM. | `config/game-config.js` | Oui — testable via Node |
| `game-engine.js` | Machine à états du jeu : joueur courant, historique des coups, annulation (undo), recommencer, nouvelle partie. Encapsule le moteur de règles et expose une API simple au rendu. | `game-rules.js` | Oui — testable via Node |
| `ai-engine.js` | IA stratégique : Minimax + Alpha-Bêta avec move ordering, transposition table (Zobrist hashing), iterative deepening, quiescence search, endgame evaluation. Quatre niveaux de difficulté (Facile/Normal/Difficile/Expert) via profondeurs configurables. | `game-rules.js`, `config/game-config.js` | Oui — testable via Node |
| `ai-worker.js` | Web Worker : reçoit la position + config de difficulté, retourne le meilleur coup + statistiques (positions analysées, temps, profondeur atteinte). Supporte l'annulation d'une recherche en cours. Ne bloque jamais l'interface. | `ai-engine.js` | Oui — exécutable dans un Worker |
| `board-renderer.js` | Rendu DOM du plateau et des pions (CSS/DOM, pas de canvas lourd) : sélection d'une pièce, affichage des coups légaux possibles, mise à jour après chaque coup. | `game-engine.js` | Non — dépend du DOM |
| `animations.js` | Animations CSS + particules canvas (captures, promotion, confetti de victoire). Respecte la préférence « réduire les animations ». | Aucune logique métier | Non |
| `audio-manager.js` | Lecture des sons locaux via Web Audio API / `<audio>` : déplacement, capture, promotion, victoire. Volume et activation/désactivation persistés. Fallback synthétisé si un fichier est absent (documenté). | Aucune logique métier | Non |
| `storage-manager.js` | Sauvegarde automatique de la partie en cours + historique des parties dans LocalStorage/IndexedDB, avec versioning du schéma pour préserver les anciennes données lors des évolutions. | Aucune logique métier | Oui — testable via Node (avec mock) |
| `settings-manager.js` | Paramètres utilisateur persistés : thème, couleur des pions, difficulté par défaut, volume sonore, animations activées/désactivées, plein écran, orientation du plateau, affichage des coups possibles, durée du chronomètre, vitesse des animations, temps max de réflexion IA. | Aucune logique métier | Oui — testable via Node (avec mock) |
| `statistics.js` | Statistiques : victoires/défaites par mode et difficulté, XP, niveaux du joueur, récompenses. Persistées localement. | `storage-manager.js` | Partiellement — logique pure séparée de la persistance |
| `script.js` | Bootstrap de l'application : initialisation des modules, routage entre écran d'accueil / sélection du mode / partie / paramètres, gestion globale des événements. | Tous les modules UI + moteur | Non |
| `index.html` | Structure HTML sémantique : écrans (accueil, sélection de mode, partie, paramètres), liens vers CSS/JS locaux uniquement. | — | Non |
| `style.css` | Design premium global : thème sombre, dégradés violet/bleu électrique/cyan, glassmorphism, pions 3D, animations. Thèmes visuels sélectionnables via variables CSS. | — | Non |
| `config/game-config.js` | Constantes et paramètres globaux : taille du plateau (10x10), profondeurs par difficulté, valeurs d'évaluation stratégique, limites de temps IA, constantes de répétition/match nul. Source unique de vérité pour le moteur et l'IA. | — | Oui — testable via Node |
| `service-worker.js` | Cache offline des ressources locales (HTML/CSS/JS/assets) + gestion des mises à jour (version du cache, activation propre). Ne met jamais en cache de ressource distante. | Aucune logique métier | Non — exécutable dans le navigateur |
| `manifest.json` | PWA : nom, icônes, couleurs, mode standalone, orientation. Permet l'installation du jeu sur mobile/desktop. | — | Non |

---

## 4. Dépendances et stratégie offline

### 4.1 Dépendances à intégrer localement (Phase 1)

| Dépendance | Version cible | Usage | Source de récupération |
|------------|---------------|-------|------------------------|
| Bootstrap 5 | 5.3.x | CSS + JS responsive | jsDelivr / npm (`bootstrap@5.3.3`) — script `scripts/fetch-dependencies.ps1` |
| Lucide ou Font Awesome | dernière stable | Icônes SVG locales | CDN officiel / npm — script de récupération |
| Polices (ex: Orbitron, Rajdhani) | .woff2 | Typographie futuriste | Google Fonts (fichiers .woff2 téléchargés localement) ou fallback système documenté |
| Sons (déplacement, capture, victoire) | .wav/.ogg | Effets audio locaux | Générés localement via script Node (synthèse Web Audio API → fichiers WAV) — zéro dépendance externe |
| Icônes PWA / manifeste | PNG 192x192 + 512x512 | Installation PWA | Générées localement via script Node (canvas/SVG→PNG ou SVG inline) |

### 4.2 Stratégie offline

- **Aucune dépendance CDN** dans la version finale : tous les chemins sont relatifs et locaux.
- **Service Worker** met en cache toutes les ressources locales au premier chargement ; après installation, le jeu fonctionne sans Internet (y compris l'IA Minimax).
- **Lancement via serveur HTTP local** obligatoire (les Service Workers ne fonctionnent pas avec `file://`) : fournir un mini serveur Node/Python intégré dans `scripts/` — zéro dépendance externe.
- **Fallbacks documentés** si une ressource optionnelle est absente (ex: police système, sons synthétisés via Web Audio API) — jamais de chargement distant silencieux.

### 4.3 Tests automatisés sans dépendance externe

- Runner minimaliste basé sur `node:test` (intégré à Node ≥ 18) : zéro installation, fonctionne hors ligne.
- Les tests couvrent le moteur de règles et l'IA en environnement Node pur (pas de DOM requis).

---

## 5. Conventions de programmation

- **JavaScript Vanilla**, ES Modules (`type="module"`) pour les modules navigateur ; compatibilité CommonJS/ESM via `export` + wrapper Node pour les tests.
- **Nommage** : fichiers en kebab-case (`game-rules.js`), fonctions en camelCase, constantes en UPPER_SNAKE_CASE.
- **Commentaires** : JSDoc sur chaque module et fonction publique ; commentaires de logique non triviale (prise majoritaire, élagage Alpha-Bêta).
- **Pas de dépendance externe au runtime** pour le moteur et l'IA — uniquement `config/game-config.js`.
- **Gestion d'erreurs** : try/catch autour des opérations critiques (Web Worker, stockage local) ; jamais de crash silencieux.
- **Performance IA** : iterative deepening + limitation du temps de réflexion (configurable) pour éviter les blocages sur mobile.

---

## 6. Plan de tests (Phases 2–9)

### Phase 2 — Moteur de règles (tests Node, sans DOM)
- Déplacements des pions et des dames (diagonaux uniquement).
- Captures obligatoires (un coup non capturant est rejeté si une capture existe).
- Prises multiples (séquence forcée jusqu'à épuisement).
- **Prise majoritaire** : la prise qui maximise le nombre de pions capturés est obligatoire.
- Promotion en dame (pion atteignant la dernière rangée, y compris lors d'une capture multiple).
- Détection victoire / défaite / match nul (répétition triple de position ; limitation des coups sans progression — configurable).
- Alternance automatique des joueurs.
- Coups illégaux rejetés par le moteur.
- Annulation d'un coup (undo) et recommencer une partie.

### Phase 3 — IA (tests Node, sans DOM)
- Chaque coup choisi est légal (vérifié contre `game-rules.js`).
- Profondeurs par difficulté : Facile=2, Normal=4, Difficile=6, Expert=8–12 (objectif de configuration).
- Limitation du temps de réflexion respectée.
- Web Worker non bloquant l'interface ; annulation d'une recherche en cours fonctionnelle.
- Statistiques IA affichées : positions analysées, temps, profondeur atteinte.

### Phases 4–9 — Intégration & validation globale
- Parties complètes contre l'IA à tous les niveaux de difficulté.
- Sauvegarde / reprise après fermeture du navigateur (LocalStorage).
- Mode deux joueurs sur le même appareil.
- Responsive mobile + commandes tactiles.
- Fonctionnement offline réel (déconnexion Internet → jeu opérationnel, IA incluse).
- Absence d'erreurs JavaScript en console ; absence de dépendances distantes (vérifié via DevTools / grep des chemins).

---

## 7. Risques techniques et mitigations

| # | Risque | Impact | Mitigation |
|---|--------|--------|------------|
| 1 | **Prise majoritaire** (règle internationale complexe) mal implémentée → coups invalides ou victoires erronées | Critique | Tests dédiés en Phase 2 ; validation croisée moteur vs IA. |
| 2 | **Performance IA sur mobile** : profondeur Expert trop coûteuse | Élevé | Iterative deepening + limitation du temps de réflexion (configurable) ; Web Worker non bloquant. |
| 3 | **Service Worker nécessite un serveur HTTP local** (pas `file://`) | Moyen | Mini serveur intégré dans `scripts/` (Node ou Python, zéro dépendance externe) + instructions README. |
| 4 | **Dépendances à télécharger en Phase 1** : polices, sons, icônes PWA — risque de licences non conformes | Moyen | Script reproductible `scripts/fetch-dependencies.ps1` ; vérification des licences avant intégration ; fallbacks locaux documentés (sons synthétisés via Web Audio API, police système). |
| 5 | **Zobrist hashing / transposition table** : risque de collision ou d'incohérence avec la répétition de position | Moyen | Zobrist hash calculé sur l'état complet du plateau (pions + joueur courant + historique minimal) ; tests unitaires dédiés. |
| 6 | **Sauvegardes locales** : risque de perte de données lors d'une évolution du schéma | Faible | Versioning explicite du schéma dans `storage-manager.js` ; migration des anciennes sauvegardes. |
| 7 | **Web Worker + ES Modules** : compatibilité navigateur variable | Moyen | Utiliser un worker classique (non module) pour la compatibilité maximale, ou tester sur les navigateurs cibles en Phase 3/5. |

---

## 8. Plan de développement (10 phases — cahier des charges §18)

| Phase | Objectif | Livrables clés | Statut |
|-------|----------|----------------|--------|
| 0 | Architecture & préparation | Arborescence, modules, dépendances, plan de tests | **En cours — validation requise** |
| 1 | Dépendances locales | `vendor/`, `assets/`, rapport de vérification | À faire |
| 2 | Moteur de jeu | `game-rules.js`, `game-engine.js`, tests Node | À faire |
| 3 | Intelligence artificielle | `ai-engine.js`, `ai-worker.js`, niveaux de difficulté | À faire |
| 4 | Interface graphique | `index.html`, `style.css`, modules UI | À faire |
| 5 | Intégration IA ↔ interface | Communication Worker, gestion des difficultés | À faire |
| 6 | Animations & expérience premium | `animations.js`, sons, confetti | À faire |
| 7 | Sauvegardes & bonus | `storage-manager.js`, `statistics.js`, XP/niveaux | À faire |
| 8 | PWA & offline | `manifest.json`, `service-worker.js`, tests hors ligne | À faire |
| 9 | Tests généraux & optimisation | Rapport de tests final | À faire |
| 10 | Livraison finale | README complet, instructions d'installation/lancement | À faire |

---

## 9. Conventions de validation entre phases

À la fin de chaque phase : bilan (travail effectué / fichiers créés ou modifiés / tests effectués / résultats / état) → **attente explicite de validation** avant de passer à la phase suivante. Aucune phase ne doit être entamée sans accord préalable.
