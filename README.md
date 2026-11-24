<div align="center">

<img src="assets/images/icon-192.png" width="112" alt="Checkers Legend 2026">

# CHECKERS LEGEND 2026

### Le jeu de dames international qui ne respecte pas les règles — mais votre vie privée.

**10×10 · IA locale · 100 % hors ligne · PWA & Android · Zéro serveur**

[![Node.js](https://img.shields.io/badge/node-%3E%3D20-339933?logo=node.js&logoColor=white)](#démarrage)
[![Tests](https://img.shields.io/badge/tests-60%2F60-brightgreen)](#qualité--validation)
[![Navigation](https://img.shields.io/badge/navigateur-15%2F15-brightgreen)](#qualité--validation)
[![PWA](https://img.shields.io/badge/PWA-ready-00aef0?logo=pwa)](#pwa--android)
[![Licence](https://img.shields.io/badge/licence-MIT-ffc72c)](#licence)

[Démarrage](#démarrage) · [Fonctionnalités](#fonctionnalités) · [Aperçu](#aperçu) · [Règles](#règles--variantes) · [PWA / Android](#pwa--android) · [Validation](#qualité--validation)

</div>

<br>

![Plateau de jeu Checkers Legend 2026](docs/screenshots/02-partie-desktop.png)

---

## Pourquoi ce jeu ?

Les dames internationales, dans leur version la plus propre : **unes règles officielles**, une **IA qui réfléchit sans bloquer l'écran**, une interface soignée qui tourne partout — et **aucune donnée qui quitte votre appareil**.

| | |
|---|---|
| ⚖️ **Règles officielles** | 10×10, prise obligatoire, rafles, prise majoritaire, dames volantes, promotion en fin de capture. |
| 🧠 **IA locale et réactive** | Minimax + Alpha-Bêta, table Zobrist, quiescence, 4 niveaux, exécutée dans un Web Worker. |
| ⚡ **Zéro blocage** | L'attente de l'IA est une fine barre en bas de l'écran, jamais une fenêtre qui cache le plateau. |
| 🎨 **Interface premium** | Palette rouge / bleu / cyan / blanc, deux thèmes, 4 plateaux, 4 styles de pions, animations et fond de particules réglable. |
| 💀 **Captures brutales** | Fissures, éclaboussures, onde de choc, flash plein écran et secousse du plateau ; en rafle, l'intensité monte et les « K.O. 💀 » s'enchaînent. |
| 📴 **Hors ligne par design** | Après le premier chargement, tout fonctionne sans Internet — IA comprise. |
| 🔒 **Confidentialité totale** | Aucun compte, aucune API, aucun traceur, aucun CDN. Vos parties restent chez vous. |

---

## Fonctionnalités

### Le jeu

- **Dames internationales 10×10** — 20 pions par camp, 50 cases jouables, Blancs au trait.
- **Promotion en fin de rafle** : un pion qui traverse la dernière rangée pendant une capture ne devient dame qu'à la fin de la séquence.
- **Dame volante** : déplacement et prise à distance sur les diagonales.
- **Deux dames empilées + couronne** pour une lisibilité immédiate sur le plateau.
- **Deux modes** : contre l'IA (choix de la couleur) ou à deux sur le même écran.
- **Quatre niveaux d'IA**, du facile à l'expert (recherche jusqu'à 12 coups).

### Le confort

- **3 sauvegardes manuelles** en plus de la reprise automatique : écraser, charger, supprimer.
- **Annulation intelligente** : remonte au dernier coup humain, y compris après la réponse de l'IA.
- **Copie de la notation** des coups en un clic depuis l'historique.
- **Chronomètres** 3 / 5 / 10 / 15 / 30 min ou illimités, pause, plein écran.
- **XP, niveaux, statistiques** et historique des 50 dernières parties avec rejouabilité.
- **Clavier** : Tab entre les cases jouables, Entrée/Espace pour jouer, flèches pour naviguer.

### Variantes non réglementaires

Désactivées par défaut, regroupées dans **Paramètres → Options non réglementaires** (et expliquées dans *Comment jouer*) :

- **Prise non obligatoire** — un déplacement simple reste autorisé même si une capture existe.
- **Enchaîner les captures** — capturer donne un tour bonus, pour enchaîner les prises.

L'IA et les sauvegardes connaissent ces options ; les puzzles, eux, restent en règles officielles.

---

## Aperçu

<table>
  <tr>
    <td align="center"><b>Accueil</b><br><img src="docs/screenshots/01-accueil-desktop.png" width="470" alt="Écran d'accueil"></td>
    <td align="center"><b>Partie contre l'IA</b><br><img src="docs/screenshots/02-partie-desktop.png" width="470" alt="Partie en cours"></td>
  </tr>
  <tr>
    <td align="center"><b>Mobile</b><br><img src="docs/screenshots/03-partie-mobile.png" width="220" alt="Interface mobile"></td>
    <td align="center"><b>Hors ligne</b><br><img src="docs/screenshots/04-hors-ligne.png" width="470" alt="Mode hors ligne"></td>
  </tr>
</table>

---

## Démarrage

Prérequis : **Node.js 20+**. Aucune installation de dépendances n'est nécessaire.

```bash
npm start
```

Ouvrez ensuite **http://127.0.0.1:8080**.

Sans npm :

```bash
node scripts/serve.js 8080
```

> Le serveur local fournit les bons types MIME et permet l'installation PWA. Sur **ordinateur**, ouvrir `index.html` en `file://` fonctionne aussi pour jouer, mais le Service Worker est désactivé par le navigateur ; l'IA bascule alors automatiquement sur le thread principal. Sur **Android**, utilisez plutôt le build autonome décrit plus bas.

```bash
npm test             # 65 tests Node.js
npm run test:browser # parcours navigateur headless (Edge/Chrome)
npm run verify       # tests + intégrité PWA
npm run build:offline # génère le fichier HTML unique pour Android
```

> **Sur Android, ne copiez pas seulement le dossier.** Ouvrir `index.html` en
> `file://` bloque le chargement des scripts et du CSS. Utilisez le build
> autonome ci-dessous, ou hébergez le site en HTTPS et installez la PWA.
> Guide complet : [`docs/ANDROID.md`](docs/ANDROID.md).

---

## Règles & variantes

<details>
<summary><b>Règles internationales implémentées</b></summary>

- Plateau 10×10, 50 cases sombres jouables, 20 pions par joueur, les Blancs commencent.
- Pions : déplacement diagonal avant d'une case, capture en avant **et** en arrière.
- **Prise obligatoire** et **prise majoritaire** : la rafle qui capture le plus de pièces est imposée.
- Prises multiples enchaînées jusqu'à épuisement ; une pièce déjà capturée reste bloquante pendant la rafle.
- **Dame volante** : courses et captures à distance sur les diagonales.
- **Promotion uniquement en fin de rafle**.
- Victoire : plus de pièces, adversaire bloqué ou chronomètre écoulé.
- Match nul : triple répétition ou 50 demi-coups sans progression.

</details>

Les règles ci-dessus sont le comportement **par défaut**. Les deux variantes présentées plus haut sont purement optionnelles.

---

## PWA & Android

Le jeu est une **PWA complète** : manifeste, icônes 192/512, Service Worker avec précache intégral (HTML, CSS, JS, polices, sons, images).

### ⚠️ Avant de copier le dossier sur un téléphone

Ce projet est un **site web**, pas une application Android native. Ouvrir
`index.html` depuis un gestionnaire de fichiers Android charge la page en
`file://` : **Chrome bloque alors les fichiers voisins** (scripts, CSS, polices,
sons) et le jeu ne démarre pas. De même, un APK généré par PWABuilder à partir
d'un dossier ou de `localhost` ne peut pas fonctionner : c'est un simple
wrapper qui ouvre une URL HTTPS, il ne contient pas le jeu.

👉 Guide pas-à-pas et dépannage : **[`docs/ANDROID.md`](docs/ANDROID.md)**

### Option 1 — Fichier unique hors ligne (sans hébergement)

```bash
npm run build:offline
```

Génère `dist/checkers-legend-offline.html` (~1,1 Mo) : **un seul fichier** qui
contient tout (code, styles, polices, images, sons, Worker). Copiez ce fichier
sur le téléphone et ouvrez-le avec **Chrome** — le jeu fonctionne hors ligne,
sans serveur et sans installer quoi que ce soit.

### Option 2 — PWA installable (recommandée)

1. Publiez le dossier en HTTPS (GitHub Pages fonctionne, `.nojekyll` est inclus).
2. Ouvrez l'URL dans Chrome sur le téléphone.
3. Menu `⋮` → **Ajouter à l'écran d'accueil** / **Installer l'application**.
4. Après le premier chargement, tout fonctionne **hors ligne**, IA comprise.

Le manifeste utilise des chemins relatifs (`"./"`), donc l'installation
fonctionne aussi depuis un sous-dossier (`.../JeuxDeDames/`).

### Option 3 — APK via PWABuilder

L'APK obtenu est une **Trusted Web Activity** : il ouvre l'URL de votre PWA.
Il faut donc **d'abord** la publier en HTTPS, puis générer l'APK **depuis cette
URL publique** (jamais depuis `localhost`), et déposer le fichier
`.well-known/assetlinks.json` contenant l'empreinte SHA-256 de la clé de
signature utilisée. Sans cette liaison, l'APK affiche une barre d'adresse ou
une page d'erreur. Conservez le keystore généré pour les mises à jour.

Cet APK n'est **pas autonome** : il nécessite un réseau au premier lancement.
Pour un APK avec fichiers embarqués, voir le guide Android (Capacitor/Cordova).

---

## Qualité & validation

La robustesse n'est pas un slogan : le moteur de règles est testé comme le code réellement exécuté par le jeu (modules UMD partagés navigateur / Worker / Node).

| Suite | Résultat |
|---|---|
| Tests Node.js (`npm test`) | **60 / 60** — 28 règles, 11 IA, 11 stockage, 10 intégrité |
| Parcours navigateur (`npm run test:browser`) | **15 / 15 étapes**, 0 exception JavaScript |
| Intégrité PWA (`npm run verify`) | **✅ validée** — ressources locales, manifeste, précache, ordre de chargement |
| Hors ligne | IA, sauvegardes et statistiques vérifiés réseau coupé |

Détails complets : [`docs/TEST_REPORT.md`](docs/TEST_REPORT.md).

---

## Architecture

```text
index.html · style.css · script.js     Interface, thèmes, contrôleur
manifest.json · service-worker.js      PWA et cache hors ligne
config/game-config.js                  Constantes, difficultés, XP
js/game-rules.js                       Règles pures (10×10)
js/game-engine.js                      État, historique, annulation
js/ai-engine.js · ai-worker.js         Minimax, Zobrist, Web Worker
js/board-renderer.js                   Plateau, pièces, animations
js/{storage,settings,statistics,audio,animations}-manager.js
js/particles-background.js             Fond de particules canvas (thème adaptatif)
assets/                                Polices, icônes, logo, sons WAV (locaux)
scripts/                               Serveur, tests, génération d'assets, build HTML unique
dist/                                  Build autonome généré par `npm run build:offline`
tests/                                 65 tests Node.js
docs/                                  Architecture, dépendances, rapports, captures
```

Aucun module n'a de dépendance distante à l'exécution. Le logo, les icônes et les sons sont régénérés localement par `node scripts/generate-assets.js`.

Documentation technique : [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) · [`docs/DEPENDENCY_REPORT.md`](docs/DEPENDENCY_REPORT.md) · [`PROJECT_STATUS.md`](PROJECT_STATUS.md) · [`docs/ANDROID.md`](docs/ANDROID.md)

---

## Confidentialité

Tout est conservé dans `localStorage` sous le préfixe `cl2026:` : paramètres, statistiques et sauvegardes. **Aucune donnée n'est envoyée, synchronisée ou analysée.** Effacer les données du site supprime la progression. Les parties à deux joueurs ne modifient ni l'XP ni les statistiques personnelles.

---

## Licence

Code original sous licence **MIT**. Bootstrap (MIT), Lucide (ISC) et les polices Orbitron / Rajdhani (SIL OFL 1.1) restent la propriété de leurs auteurs.

<div align="center">

**CHECKERS LEGEND 2026** — beau, rapide, et jouable même sans réseau.

Fait par [Lud972vic](https://github.com/Lud972vic)

</div>
