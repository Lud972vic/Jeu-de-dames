# Rapport de vérification des dépendances — CHECKERS LEGEND 2026

**Phase 1 — Préparation des dépendances locales**
Date : 22 novembre 2026
Méthode : téléchargement via `scripts/fetch-dependencies.ps1`, génération locale via `scripts/generate-assets.js`, vérification d'intégrité par script Node (signatures binaires, tailles).

---

## 1. Dépendances récupérées (vendor)

| Dépendance | Version | Fichier local | Taille | Licence | Source |
|------------|---------|---------------|--------|---------|--------|
| Bootstrap 5 (CSS) | 5.3.9 | `vendor/bootstrap/css/bootstrap.min.css` | 232 360 octets | MIT | jsDelivr (npm `bootstrap`) |
| Bootstrap 5 (JS bundle) | 5.3.9 | `vendor/bootstrap/js/bootstrap.bundle.min.js` | 80 669 octets | MIT | jsDelivr (npm `bootstrap`) |

**Vérifications** : présence réelle, taille > seuil, contenu CSS/JS non vide. ✅

---

## 2. Icônes (Lucide)

| Dépendance | Version | Emplacement | Licence | Source |
|------------|---------|-------------|---------|--------|
| Lucide (SVG individuels) | 1.77.0 | `assets/icons/*.svg` | ISC | jsDelivr (npm `lucide-static`) |

**36 icônes téléchargées** (toutes vérifiées : balise `<svg>` présente, taille > 0) :
`play`, `cpu`, `users`, `help-circle`, `settings`, `volume-2`, `volume-x`, `pause`, `rotate-cw`, `undo`, `log-out`, `maximize`, `history`, `star`, `timer`, `crown`, `trophy`, `user`, `medal`, `gamepad`, `x`, `menu`, `chevron-left`, `sparkles`, `clock`, `info`, `refresh-cw`, `chess-pawn`, `chess-queen`, `fullscreen`, `play-circle`, `pause-circle`, `rotate-ccw`, `arrow-left`, `check`, `x-circle`.

**Note** : seules les icônes réellement utilisées sont intégrées (pas de package complet de 57 Mo). Chaque SVG est référencé localement — aucun chargement réseau.

---

## 3. Polices de caractères

| Police | Graisses | Emplacement | Licence | Source |
|--------|----------|-------------|---------|--------|
| Orbitron (latin) | 400, 500, 600, 700, 800, 900 | `assets/fonts/orbitron-latin-*-normal.woff2` | OFL 1.1 | jsDelivr (npm `@fontsource/orbitron`) |
| Rajdhani (latin) | 400, 500, 600, 700 | `assets/fonts/rajdhani-latin-*-normal.woff2` | OFL 1.1 | jsDelivr (npm `@fontsource/rajdhani`) |

**10 fichiers .woff2** vérifiés (signature `wOF2` valide). Les déclarations `@font-face` locales sont dans `assets/fonts/fonts.css`.

---

## 4. Ressources générées localement (aucune licence externe)

### Sons — `assets/sounds/` (WAV 16 bits mono 44,1 kHz, générés par `scripts/generate-assets.js`)

| Fichier | Usage | Taille |
|---------|-------|--------|
| `move.wav` | déplacement de pièce | 7 100 octets |
| `capture.wav` | capture | 19 448 octets |
| `promote.wav` | promotion en dame | 31 796 octets |
| `victory.wav` | victoire | 97 064 octets |
| `click.wav` | clic d'interface | 4 012 octets |
| `invalid.wav` | coup invalide | 15 920 octets |
| `draw.wav` | match nul | 44 144 octets |

Tous vérifiés : signature `RIFF`/`WAVE` valide. **Aucune ressource audio externe, aucune licence tierce.**

### Images — `assets/images/`

| Fichier | Usage | Taille |
|---------|-------|--------|
| `icon-192.png` | icône PWA 192×192 | 22 273 octets |
| `icon-512.png` | icône PWA 512×512 | 64 603 octets |
| `logo.svg` | logo vectoriel CHECKERS LEGEND 2026 | 1 922 octets |

Icônes PNG générées par encodeur PNG pur Node (zlib intégré, zéro dépendance) ; vérifiées : signature PNG valide.

---

## 5. Dépendances volontairement absentes

| Élément | Raison |
|---------|--------|
| Framework JS lourd (React, Vue…) | Non requis — JavaScript Vanilla conformément au cahier des charges. |
| Bibliothèque d'animation externe | Animations CSS + canvas maison (zéro dépendance). |
| Bibliothèque audio externe | Web Audio API native + fichiers WAV locaux. |
| Base de données / ORM | LocalStorage natif avec versioning maison. |
| Icônes Font Awesome | Lucide retenu (plus léger, SVG individuels). |
| Tout CDN au runtime | **Interdit** — tous les chemins sont relatifs et locaux. |

---

## 6. Vérification « zéro CDN »

- Aucun fichier du projet ne référence `cdn.jsdelivr.net`, `cdnjs.cloudflare.com`, `fonts.googleapis.com`, `fonts.gstatic.com`, `unpkg.com`.
- Les scripts de récupération (`scripts/fetch-dependencies.ps1`) utilisent Internet **uniquement lors de la préparation** ; une fois les fichiers présents, le jeu fonctionne intégralement hors ligne.
- Le Service Worker (Phase 8) mettra en cache l'ensemble des fichiers locaux.

**Statut global Phase 1 : ✅ conforme — 57 fichiers vérifiés, 0 échec.**
