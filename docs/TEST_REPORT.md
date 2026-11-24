# Rapport de tests — CHECKERS LEGEND 2026

**Version testée :** 1.0.0
**Date :** 22 novembre 2026
**Environnement :** Windows, Node.js v24.22.2, Microsoft Edge 158.0.4370.33 (headless)
**Méthode :** tests automatisés `node:test`, tests d'intégrité statique, parcours navigateur réel via le protocole CDP (Chrome DevTools Protocol).

---

## 1. Synthèse

| Suite | Fichier | Tests | Réussis | Échecs |
|-------|---------|------:|--------:|-------:|
| Règles et moteur de jeu | `tests/test-rules.js` | 28 | 28 | 0 |
| Intelligence artificielle | `tests/test-ai.js` | 11 | 11 | 0 |
| Stockage, paramètres, reprise | `tests/test-storage.js` | 11 | 11 | 0 |
| Fond de particules | `tests/test-particles.js` | 5 | 5 | 0 |
| Effets de capture / carnage / décapitation / frappe royale | `tests/test-animations.js` | 6 | 6 | 0 |
| Profils et sauvegardes nommées | `tests/test-profiles.js` | 4 | 4 | 0 |
| Puzzles tactiques | `tests/test-puzzles.js` | 8 | 8 | 0 |
| Compatibilité WebKit (audit statique) | `tests/test-webkit.js` | 4 | 4 | 0 |
| Intégrité, PWA, ressources | `tests/test-integrity.js` | 10 | 10 | 0 |
| **Total Node.js** | — | **87** | **87** | **0** |
| Parcours navigateur Edge | `scripts/browser-smoke-test.js` | 17 étapes | 17 | 0 |
| Parcours navigateur Firefox | `scripts/browser-smoke-test-firefox.js` | 11 étapes | 11 | 0 |

**Conclusion :** la totalité des tests automatisés réussit. Le parcours navigateur
couvre le chargement, l'ensemble des paramètres et leur réinitialisation, les modales,
une partie contre l'IA avec réponse du Worker, la sauvegarde/reprise, la pause,
l'annulation, le mode 2 joueurs, le choix des Noirs et l'orientation automatique, le
responsive mobile, le Service Worker, le rechargement et une partie d'IA hors ligne,
le repli sans Web Worker, la fin de partie et le rejeu, les profils et les
parties nommées, puis les puzzles et l'analyse IA. Le second parcours, exécuté
dans Firefox 160 via le WebDriver BiDi intégré, couvre 11 étapes équivalentes
sans aucun driver à installer. Aucune exception JavaScript n'a été levée.
`npm run verify` (vérification globale) passe également.

Les parcours navigateur headless (`scripts/browser-smoke-test.js`, 17 étapes, et
`scripts/browser-smoke-test-firefox.js`, 11 étapes) existent toujours et restent
détaillés en section 6 ; ils n'ont pas été supprimés ni remplacés.

Commande de reproduction :

```bash
npm test
npm run test:browser
npm run verify
```

---

## 2. Tests des règles et du moteur (`test-rules.js`)

### Plateau et déplacements

1. Plateau initial : 20 pions par joueur, Blancs au trait.
2. Cases jouables : uniquement les cases sombres (50 cases).
3. Pion blanc : déplacement diagonal avant uniquement.
4. Pion noir : déplacement diagonal avant, vers le bas.
5. Dame : déplacement à distance sur toute la diagonale.
6. Dame : bloquée par une pièce amie.

### Prises internationales

7. Capture obligatoire : aucun déplacement simple si une prise existe.
8. Pion : capture vers l'arrière autorisée.
9. Pion : prise multiple enchaînée jusqu'à épuisement.
10. Prise majoritaire : seule la séquence maximale est légale.
11. Prise majoritaire : en cas d'égalité, toutes les séquences maximales sont autorisées.
12. Dame : capture à distance.
13. Dame : capture multiple avec choix de la case d'atterrissage.
14. Dame : enchaînement forcé de captures sur la grande diagonale.
15. Promotion : un pion terminant sur la dernière rangée devient dame.
16. Promotion interdite en cours de prise multiple (promotion en fin de rafle).

### Fins de partie

17. Victoire : adversaire sans pièces.
18. Victoire : adversaire bloqué, sans aucun coup légal.
19. Match nul : triple répétition de position.
20. Match nul : 50 demi-coups sans capture ni mouvement de pion.

### Moteur, annulation, robustesse

21. Alternance automatique des joueurs.
22. Coup illégal rejeté sans altérer l'état.
23. Annulation (`undo`) : restaure plateau, joueur et compteurs.
24. Sérialisation / rechargement : état identique.
25. **Parties complètes : trois simulations aléatoires se terminent proprement**
    (jusqu'à 1 000 demi-coups, tous les coups validés, raison de fin conforme).
26. Notation des coups : déplacement et prise.

### Options non réglementaires (désactivées par défaut)

27. **Option non réglementaire : prise non obligatoire ajoute les déplacements simples**
    (`capturesOptional`) : avec l'option activée, les coups simples restent légaux même
    lorsqu'une capture est disponible ; les règles officielles s'appliquent sinon.
28. **Option non réglementaire : capturer conserve le tour (tour bonus)**
    (`chainCaptures`) : après une capture, c'est encore au joueur de jouer, ce qui
    permet d'enchaîner les prises.

---

## 3. Tests de l'IA (`test-ai.js`)

### Légalité et qualité tactique

1. Coup légal dans la position initiale, pour les 4 difficultés.
2. Trouve une capture immédiate.
3. Choisit la prise majoritaire.
4. Évite de perdre une pièce inutilement (choix du coup sûr).
5. Mat en un coup : capture de la dernière pièce adverse.
6. Aucun coup disponible : retourne `move: null`.

### Performance et intégrité algorithmique

7. Respecte la limite de temps (Expert, 500 ms demandés, arrêt < 2,5 s).
8. La profondeur atteinte augmente avec le temps alloué.
9. Évaluation symétrique entre les deux camps, hors bonus de tempo.
10. Zobrist : hash déterministe, sensible au joueur, et hash incrémental identique
    au hash recalculé après un coup.
11. IA vs IA : 20 demi-coups, tous légaux, aucune erreur.

### Mesures de performance

Mesures effectuées sur la position initiale et une position de milieu de partie,
avec le moteur actuel (Node.js v24.22.2, un seul thread) :

| Position | Difficulté | Profondeur atteinte | Nœuds explorés | Temps |
|----------|------------|--------------------:|---------------:|------:|
| Initiale | Facile | 3 | 989 | 17 ms |
| Initiale | Normal | 5 | 8 155 | 26 ms |
| Initiale | Difficile | 7 | 18 590 | 55 ms |
| Initiale | Expert | 12 | 1 332 816 | 2 175 ms |
| Milieu de partie | Expert | 12 | 808 803 | 1 148 ms |

La recherche s'arrête dès que la profondeur maximale du niveau est atteinte, avant la
limite de temps configurée. En partie réelle, l'interface plafonne de plus le temps de
réflexion selon le chronomètre restant.

---

## 4. Tests stockage, paramètres et reprise (`test-storage.js`)

### Stockage local

1. Écriture/lecture versionnée avec préfixe `cl2026:`.
2. Valeur absente ou JSON corrompu : valeur de repli, sans exception.
3. Suppression et détection de disponibilité.
4. Migration d'un ancien schéma.

### Paramètres

5. Valeurs par défaut, persistance de tous les réglages et réinitialisation.

### Statistiques et XP

6. Victoire, défaite, nul et progression XP ; niveau calculé correctement.
7. Partie 2 joueurs historisée sans XP ni modification du bilan personnel.
8. Historique plafonné à 50 parties.
9. Succès (badges), puzzles et données de replay : liste des badges, puzzle attribué
   une seule fois, bonus d'XP et persistance de la notation et du replay.

### Sauvegarde / reprise

10. Sérialisation, stockage et rechargement identiques ; annulation toujours possible.
11. Coup légal après rechargement et statut cohérent.

### Profils (`test-profiles.js`)

1. Premier lancement : le profil par défaut récupère les données historiques sans
   supprimer les clés existantes.
2. Bascule A → B → A : isolation des réglages, statistiques et sauvegardes.
3. Sauvegardes nommées : création, lecture et suppression propres au profil actif.
4. Renommage, suppression et garde du dernier profil.

### Puzzles (`test-puzzles.js`)

1. Catalogue de six puzzles uniques, avec titre, niveau et indice.
2. Recherche par identifiant, avec retour `null` si absent.
3. Puzzle du jour déterministe et présent dans le catalogue.
4. Validation de toutes les positions et solutions contre le moteur de règles.
5. Détection d'une solution impossible.
6. Chaque coup de solution est légal et retire les pièces annoncées.
7. Parcours cyclique du puzzle suivant.
8. Atterrissages explicites pour les captures de dames volantes.

### Compatibilité WebKit (`test-webkit.js`)

Audit statique — **pas un lancement de Safari** : Safari n'est pas installable sous
Windows et aucune dépendance réseau n'est autorisée.

1. Repli `webkitAudioContext` présent à chaque création de contexte audio.
2. Préfixes `-webkit-` conservés pour `backdrop-filter`, `mask-image` et
   `font-smoothing`.
3. Enregistrement du Service Worker protégé et limité à HTTP(S).
4. Aucune API exclusive à Chromium dans le contrôleur principal.

### Effets de capture, carnage, décapitation et frappe royale (`test-animations.js`)

1. Le mode carnage ajoute sang, flaques et coulures à la capture brutale.
2. Les coulures s'étalent puis les flaques s'estompent avec le temps.
3. Le rendu du carnage utilise bien le canvas 2D.
4. La décapitation ajoute un jet de sang et une flaque.
5. La frappe d'une dame projette des étincelles dorées.
6. Le mouvement réduit désactive tous les effets de capture.

---

## 5. Tests d'intégrité et PWA (`test-integrity.js`)

1. Livrables obligatoires présents et non vides.
2. Aucune dépendance distante : pas de CDN, d'API ou de police en ligne dans le HTML,
   le CSS, le script principal ou le Worker.
3. Toutes les références locales de `index.html` existent réellement.
4. Toutes les ressources `url()` de `style.css` existent réellement.
5. Syntaxe JavaScript valide pour tous les modules et le serveur local (`node --check`).
6. Identifiants HTML uniques et sélecteurs du contrôleur présents dans le HTML.
7. Manifeste PWA valide : langue, affichage, couleurs, icônes ; dimensions PNG réelles
   vérifiées par lecture de l'en-tête binaire (192×192 et 512×512).
8. Service Worker : les 60+ ressources précachées existent toutes sur le disque.
9. Ordre de chargement des scripts compatible avec les modules UMD.
10. Le Web Worker importe bien les modules locaux attendus et communique par `postMessage`.

---

## 6. Parcours navigateur headless (`browser-smoke-test.js`)

Navigateur : Microsoft Edge 158, mode `--headless=new`, piloté par CDP.
Serveur : `scripts/serve.js` sur `http://127.0.0.1:8124/`.
Captures produites dans `docs/screenshots/`.

| # | Scénario | Vérifications |
|---|----------|---------------|
| 1 | Chargement de l'accueil | Titre exact, 3 écrans, accueil actif, 4 cartes de difficulté |
| 2 | Sons et paramètres complets | Bascule sonore, préchargement de 5+ effets WAV, thème, pièces, difficulté, chronomètre, vitesse, temps IA, volume, sons, animations, aides, message GitHub, orientation, puis réinitialisation complète aux valeurs par défaut |
| 3 | Modales règles et historique | 7 cartes de règles (dont les options non réglementaires), ouverture/fermeture de l'historique |
| 4 | Nouvelle partie IA (Facile) | Écran de jeu, 100 cases, 40 pièces, mode et difficulté corrects, Blancs au trait |
| 5 | Coup humain + réponse IA | Affichage des cibles, coup appliqué, réponse du Worker, statistiques IA, historique, sauvegarde automatique |
| 6 | Rechargement et reprise | Bouton Reprendre visible, partie restaurée avec son historique |
| 7 | Pause et annulation | Chronomètre figé, overlay de pause, reprise, annulation complète, sauvegarde supprimée |
| 8 | Mode 2 joueurs | Partie locale, coup blanc, tour noir, annulation, retour à l'accueil |
| 9 | Partie avec les Noirs | Choix de la couleur, ouverture par l'IA blanche, plateau inversé, joueur noir en bas et actif |
| 10 | Responsive mobile | 390×844 : aucun débordement horizontal, plateau contenu dans l'écran |
| 11 | Service Worker et cache | Enregistrement, cache `checkers-legend-2026-*`, contrôle de la page |
| 12 | Rechargement hors ligne | Réseau coupé : accueil, application et titre fonctionnels |
| 13 | IA hors ligne | Coup humain accepté, réponse IA complète sans réseau |
| 14 | Repli sans Worker + fin de partie | Worker volontairement désactivé : recherche de secours, coup légal et statistiques ; timeout, défaite, statistiques/XP enregistrés, rejouer |
| 15 | Clavier, sauvegardes et notation | Coup joué avec Entrée, navigation aux flèches, 3 emplacements affichés, écriture/chargement de l'emplacement 1, copie de la notation |
| 16 | Profils et sauvegardes nommées | Partie nommée enregistrée, création d'un second profil, isolation des sauvegardes, retour au profil d'origine |
| 17 | Puzzles et analyse de position | Plateau tactique chargé, indice, analyse IA affichée, puzzle suivant, id du puzzle persisté |

**Résultat :** 17/17 étapes réussies, **0 exception JavaScript**.

Le test vérifie également que la sauvegarde contient bien les demi-coups joués et que
la reprise restaure le bon joueur. Les effets sonores sont décodés par le navigateur
(5+ tampons audio), mais l'audibilité physique ne peut pas être mesurée en headless.

### Parcours Firefox 160 (`browser-smoke-test-firefox.js`)

Navigateur : Mozilla Firefox 160.0.1, mode `--headless`, piloté par **WebDriver BiDi**
intégré au navigateur (WebSocket natif de Node, aucun geckodriver ni paquet npm).
Serveur : `scripts/serve.js` sur `http://127.0.0.1:8125/`.

| # | Scénario | Vérifications |
|---|----------|---------------|
| 1 | Chargement de l'accueil | Application initialisée, menu complet, capture `firefox-01-accueil.png` |
| 2 | Paramètres et thèmes | Ouverture, changement de thème, réinitialisation |
| 3 | Modales | Règles et succès |
| 4 | Partie IA et réponse du Worker | 100 cases, coup humain, réponse de l'IA, capture `firefox-02-partie.png` |
| 5 | Sauvegarde et reprise | Auto-save, rechargement, restauration de l'historique |
| 6 | Pause et annulation | Overlay de pause, coup annulé |
| 7 | Deux joueurs et orientation | Mode `pvp`, plateau inversé avec les Noirs |
| 8 | Responsive mobile | `browsingContext.setViewport` 390×844, aucun débordement, capture `firefox-03-mobile.png` |
| 9 | Service Worker et cache | Contrôle de la page et API `caches` disponible |
| 10 | Profils et parties nommées | Création d'un profil, isolation des sauvegardes |
| 11 | Puzzles et analyse | Plateau, analyse IA, puzzle suivant, persistance de l'id |

**Résultat :** 11/11 étapes réussies, **0 exception JavaScript**. Les étapes CDP
(émulation réseau hors ligne, neutralisation de `Worker`) ne sont pas reproductibles
en BiDi et restent couvertes par le parcours Edge.

---

## 7. Captures de validation

| Fichier | Contenu |
|---------|---------|
| `docs/screenshots/01-accueil-desktop.png` | Accueil desktop, progression et modes de jeu |
| `docs/screenshots/02-partie-desktop.png` | Partie contre l'IA, plateau et panneaux |
| `docs/screenshots/03-partie-mobile.png` | Interface mobile 390×844 |
| `docs/screenshots/04-hors-ligne.png` | Partie jouée avec le réseau désactivé |
| `docs/screenshots/firefox-01-accueil.png` | Accueil sous Firefox 160 |
| `docs/screenshots/firefox-02-partie.png` | Partie IA sous Firefox 160 |
| `docs/screenshots/firefox-03-mobile.png` | Interface Firefox à 390×844 |

---

## 8. Limites de la validation

Pour rester factuel, les points suivants ne sont pas couverts par l'automatisation :

- **Navigateurs non testés automatiquement** : Edge/Chromium et Firefox sont exécutés.
  Safari n'est pas disponible sous Windows : l'audit `test-webkit.js` vérifie les
  replis WebKit, mais ne remplace pas un lancement réel de Safari sur macOS.
- **Installation PWA réelle** : le Service Worker et le cache hors ligne sont testés,
  mais l'installation depuis la barre d'adresse et le lancement en fenêtre autonome
  n'ont pas été automatisés (ils dépendent de l'interface du navigateur).
- **Audio** : le décodage des fichiers WAV et les états de configuration sont vérifiés ;
  l'audibilité réelle dépend du matériel et du volume système.
- **Plein écran** : l'API est appelée avec gestion d'erreur, mais le passage effectif
  en plein écran n'est pas vérifié en headless.
- **Parties très longues** : les simulations aléatoires couvrent jusqu'à 1 000 demi-coups ;
  aucune partie de plusieurs milliers de coups n'a été testée.

Aucune de ces limites ne concerne une fonctionnalité déclarée comme validée par les
tests ci-dessus.
