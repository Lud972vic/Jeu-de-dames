# CHECKERS LEGEND 2026

## JEU DE DAMES PREMIUM – INTELLIGENCE ARTIFICIELLE LOCALE – 100 % OFFLINE

# 1. RÔLE ET MISSION

Agis comme un développeur senior Full-Stack, architecte logiciel, développeur de jeux vidéo et expert en intelligence artificielle stratégique.

Tu maîtrises parfaitement :

- HTML5.
- CSS3.
- JavaScript Vanilla.
- Bootstrap 5.
- UI/UX Design premium.
- Développement de jeux vidéo.
- Intelligence artificielle stratégique.
- Algorithmes Minimax et Alpha-Bêta.
- Optimisation JavaScript.
- Web Workers.
- Progressive Web Apps (PWA).
- Fonctionnement Offline.
- Architecture logicielle modulaire.

Ta mission est de développer CHECKERS LEGEND 2026, un véritable jeu de dames internationales 10x10, spectaculaire, moderne, professionnel et entièrement fonctionnel.

Le jeu doit intégrer une intelligence artificielle stratégique capable de jouer réellement aux dames, d'anticiper les mouvements du joueur, d'analyser plusieurs coups à l'avance et de sélectionner les meilleures décisions.

## OBJECTIF PRINCIPAL

Créer un jeu de dames premium de nouvelle génération, comparable à un véritable jeu commercial sorti en 2026.

Le jeu doit être :

- Entièrement jouable.
- Fluide.
- Moderne.
- Responsive.
- Intuitif.
- Visuellement spectaculaire.
- Intelligent.
- Autonome.
- Utilisable sans connexion Internet après installation.

## EXIGENCE ABSOLUE

L'intégralité du moteur de jeu et de son intelligence artificielle doit fonctionner localement.

Aucune IA Cloud. Aucune API distante. Aucun LM Studio. Aucun OpenAI. Aucun abonnement. Aucun serveur externe. Aucune connexion Internet obligatoire après installation.

L'intelligence artificielle doit être développée directement en JavaScript.

---

# 2. TECHNOLOGIES OBLIGATOIRES

Utiliser principalement :

- HTML5 pour la structure.
- CSS3 pour le design et les animations.
- JavaScript Vanilla pour toute la logique du jeu.
- Bootstrap 5 pour le responsive design.
- Lucide ou Font Awesome pour les icônes.
- LocalStorage ou IndexedDB pour les sauvegardes.
- Web Workers pour les calculs intensifs de l'IA.
- Service Worker pour le fonctionnement Offline.
- Manifest PWA pour l'installation du jeu.

Privilégier les technologies légères, rapides et compatibles avec les navigateurs modernes.

Éviter les frameworks lourds et les dépendances inutiles.

---

# 3. RÉCUPÉRATION DE TOUTES LES DÉPENDANCES POUR UN FONCTIONNEMENT OFFLINE

C'est une exigence fondamentale.

Avant de finaliser le projet, identifier, récupérer et intégrer localement toutes les dépendances nécessaires.

Dépendances à prévoir :

- Bootstrap 5 : CSS et JavaScript.
- Lucide ou Font Awesome.
- Polices de caractères.
- Bibliothèques JavaScript éventuellement utilisées.
- Bibliothèques d'animations éventuelles.
- Textures et ressources graphiques.
- Images.
- Icônes.
- Sons et effets audio.
- Thèmes graphiques.
- Autres ressources nécessaires.

## Interdiction des CDN

Ne jamais utiliser de CDN dans la version finale.

Interdire les dépendances externes telles que :

- cdn.jsdelivr.net
- cdnjs.cloudflare.com
- fonts.googleapis.com
- fonts.gstatic.com
- unpkg.com

Toutes les ressources doivent être intégrées au projet.

## Architecture recommandée

text

```
CHECKERS-LEGEND-2026/
│
├── index.html
├── style.css
├── script.js
│
├── assets/
│   ├── fonts/
│   ├── icons/
│   ├── images/
│   ├── textures/
│   ├── sounds/
│   └── animations/
│
├── vendor/
│   ├── bootstrap/
│   │   ├── css/
│   │   └── js/
│   ├── lucide/
│   └── libraries/
│
├── js/
│   ├── game-engine.js
│   ├── game-rules.js
│   ├── ai-engine.js
│   ├── ai-worker.js
│   ├── board-renderer.js
│   ├── animations.js
│   ├── audio-manager.js
│   ├── storage-manager.js
│   ├── settings-manager.js
│   └── statistics.js
│
├── config/
│   └── game-config.js
│
├── manifest.json
├── service-worker.js
└── README.md
```

Cette architecture peut être améliorée si nécessaire, mais les trois fichiers principaux index.html, style.css et script.js doivent impérativement être présents.

## Phase de préparation des dépendances

1. Identifier les dépendances nécessaires.
2. Déterminer leurs versions compatibles.
3. Télécharger les fichiers nécessaires.
4. Organiser les dossiers.
5. Vérifier les ressources.
6. Vérifier les licences.
7. Vérifier tous les chemins locaux.
8. Éliminer les chargements distants.
9. Tester le fonctionnement sans Internet.

Ne jamais prétendre qu'une dépendance a été téléchargée si elle n'est pas réellement présente.

Si l'environnement de développement ne permet pas de télécharger des fichiers, expliquer précisément la limitation et fournir un script reproductible pour les récupérer.

---

# 4. DIRECTION ARTISTIQUE : DESIGN PREMIUM 2026

Créer une identité visuelle spectaculaire inspirée des jeux mobiles AAA et des interfaces gaming haut de gamme.

## Univers graphique

- Thème sombre premium.
- Fond noir profond.
- Dégradés violet, bleu électrique et cyan.
- Effets lumineux néon.
- Glassmorphism.
- Cartes translucides.
- Pions avec rendu 3D.
- Reflets et ombres réalistes.
- Plateau en bois premium ou verre lumineux.
- Animations fluides.
- Particules lors des captures.
- Transitions élégantes.
- Typographie futuriste.

Le jeu doit impressionner dès son lancement.

Prévoir plusieurs thèmes visuels sélectionnables.

L'interface doit rester parfaitement lisible sur tous les appareils.

## Qualité visuelle

Ne pas créer une interface générique ou une simple page Bootstrap.

Créer une véritable identité graphique cohérente :

- Écran d'accueil immersif.
- Boutons premium.
- Menus élégants.
- Plateau parfaitement intégré.
- Animations soignées.
- Hiérarchie visuelle professionnelle.
- Retours visuels lors des interactions.

---

# 5. ÉCRAN D'ACCUEIL

Créer une page d'accueil professionnelle avec :

- Logo CHECKERS LEGEND 2026.
- Bouton JOUER MAINTENANT.
- Bouton JOUER CONTRE L'IA.
- Bouton 2 JOUEURS.
- Bouton COMMENT JOUER.
- Bouton PARAMÈTRES.
- Avatar du joueur.
- Niveau.
- Expérience XP.
- Statistiques.
- Meilleur score.
- Historique des parties.
- Effets animés en arrière-plan.

Tous les boutons doivent être fonctionnels.

---

# 6. MODES DE JEU

Proposer plusieurs modes :

- Jouer contre l'ordinateur.
- Jouer à deux sur le même appareil.
- Mode débutant.
- Mode normal.
- Mode difficile.
- Mode expert.

L'utilisateur doit pouvoir sélectionner librement le niveau de difficulté.

L'IA doit adapter son niveau de réflexion selon la difficulté choisie.

Prévoir un écran de sélection du mode de jeu avant chaque nouvelle partie.

---

# 7. MOTEUR DE JEU : DAMES INTERNATIONALES 10X10

Développer un véritable moteur de jeu respectant les règles internationales.

## Caractéristiques

- Plateau 10x10.
- 20 pions par joueur.
- Déplacements diagonaux.
- Captures obligatoires.
- Prises multiples.
- Prise majoritaire.
- Promotion en dame.
- Déplacements des dames sur plusieurs cases.
- Gestion des captures par les dames.
- Génération des coups légaux.
- Gestion des séquences de capture.
- Détection des situations de victoire.
- Détection des situations de défaite.
- Détection des matchs nuls.
- Alternance automatique des joueurs.
- Historique des coups.
- Annulation d'un coup.
- Recommencer une partie.
- Nouvelle partie.

Respecter précisément les règles internationales, notamment les règles de prise majoritaire, les séquences de captures et les conditions de promotion.

Implémenter également les règles de répétition de position, de limitation des coups et les conditions réglementaires de match nul.

Ne jamais permettre à un joueur d'effectuer un coup illégal.

Créer un moteur de règles indépendant de l'interface graphique.

Prévoir des tests spécifiques pour les positions particulières et les cas limites.

---

# 8. INTELLIGENCE ARTIFICIELLE : MINIMAX + ALPHA-BÊTA

C'est l'un des éléments les plus importants du projet.

Développer une intelligence artificielle stratégique entièrement en JavaScript.

Elle doit être capable de :

- Analyser le plateau.
- Générer les coups légaux.
- Anticiper les réponses de l'adversaire.
- Comparer plusieurs stratégies.
- Évaluer les positions.
- Identifier les dangers.
- Privilégier les captures avantageuses.
- Préparer des prises multiples.
- Protéger ses pièces.
- Favoriser les promotions.
- Contrôler le centre du plateau.
- Éviter les pertes inutiles.
- Rechercher les situations gagnantes.

## A. Algorithme Minimax

Utiliser Minimax pour analyser les possibilités futures.

L'ordinateur doit simuler ses propres coups et les réponses potentielles de l'adversaire.

Il doit sélectionner le coup présentant le meilleur résultat stratégique, en supposant que l'adversaire joue correctement.

## B. Élagage Alpha-Bêta

Intégrer l'élagage Alpha-Bêta afin de réduire considérablement le nombre de positions examinées.

L'objectif est d'améliorer la profondeur de recherche sans ralentir inutilement le jeu.

## C. Fonction d'évaluation stratégique

Créer une fonction d'évaluation prenant en compte :

- Nombre de pions.
- Nombre de dames.
- Valeur des pièces.
- Contrôle du centre.
- Mobilité.
- Sécurité des pièces.
- Possibilités de capture.
- Risques de capture.
- Progression vers la promotion.
- Positionnement.
- Avantages tactiques.
- Situations de fin de partie.

Prévoir des valeurs ajustables pour équilibrer la difficulté.

## D. Optimisations avancées

Ajouter les optimisations suivantes :

1. Move Ordering : examiner les coups prometteurs en priorité.
2. Transposition Table : mémoriser les positions déjà analysées.
3. Zobrist Hashing : identifier rapidement les positions.
4. Iterative Deepening : augmenter progressivement la profondeur.
5. Quiescence Search : approfondir les situations tactiquement instables.
6. Killer Moves : améliorer l'ordre d'exploration.
7. History Heuristic : mémoriser les coups intéressants.
8. Endgame Evaluation : améliorer les décisions en fin de partie.

Veiller à ce que toutes les optimisations respectent les règles de répétition et les informations nécessaires à l'évaluation de la position.

## E. Niveaux de difficulté

Prévoir quatre niveaux :

**FACILE**

- Recherche peu profonde.
- Stratégie élémentaire.
- Choix de coups moins optimisés.

**NORMAL**

- Recherche intermédiaire.
- Captures prioritaires.
- Protection des pièces.
- Anticipation des menaces simples.

**DIFFICILE**

- Recherche plus profonde.
- Anticipation de plusieurs réponses.
- Évaluation positionnelle.
- Stratégie avancée.

**EXPERT**

- Recherche approfondie.
- Alpha-Bêta optimisé.
- Table de transposition.
- Recherche progressive.
- Analyse tactique avancée.
- Meilleure évaluation des fins de partie.

Profondeurs indicatives en demi-coups :

- Facile : 2.
- Normal : 4.
- Difficile : 6.
- Expert : 8 à 12.

Ces profondeurs sont des objectifs de configuration, pas des garanties de performance. Adapter la recherche au temps disponible et au matériel de l'utilisateur.

## F. Performances

Utiliser un Web Worker pour exécuter les calculs de l'IA en arrière-plan.

L'interface graphique ne doit jamais se bloquer pendant la réflexion de l'ordinateur.

Prévoir :

- Limitation du temps de réflexion.
- Annulation d'une recherche en cours.
- Gestion des erreurs.
- Indicateur de réflexion.
- Nombre de positions analysées.
- Temps de calcul.
- Profondeur atteinte.
- Affichage d'un commentaire simple pendant la réflexion.

L'IA stratégique doit rester totalement indépendante de toute connexion Internet.

---

# 9. ANIMATIONS ET EFFETS SPÉCIAUX

Ajouter :

- Animation des déplacements.
- Animation de capture.
- Disparition spectaculaire des pions capturés.
- Effets lumineux sur les cases sélectionnées.
- Indication des déplacements possibles.
- Animation de promotion en dame.
- Confettis lors d'une victoire.
- Sons de déplacement.
- Sons de capture.
- Sons de victoire.
- Effets visuels lors des événements importants.

Prévoir un bouton pour activer ou désactiver les sons.

Toutes les ressources audio doivent être locales.

Respecter les préférences de réduction des animations lorsque possible.

---

# 10. INTERFACE PENDANT LA PARTIE

Afficher :

- Plateau au centre.
- Joueur actuel.
- Adversaire.
- Nombre de pions restants.
- Nombre de dames.
- Chronomètre.
- Nombre de captures.
- Historique des coups.
- Niveau de difficulté.
- Statut de l'ordinateur.
- Indicateur de réflexion de l'IA.
- Bouton pause.
- Bouton recommencer.
- Bouton annuler.
- Bouton quitter.

L'interface doit être parfaitement adaptée aux ordinateurs, tablettes et smartphones.

Prévoir des commandes tactiles optimisées.

Permettre de sélectionner une pièce et de visualiser clairement ses déplacements légaux.

---

# 11. PARAMÈTRES

Créer un panneau de configuration permettant de modifier :

- Thème du plateau.
- Couleur des pions.
- Niveau de difficulté.
- Volume sonore.
- Activation des animations.
- Mode plein écran.
- Orientation du plateau.
- Affichage des coups possibles.
- Durée du chronomètre.
- Vitesse des animations.
- Durée maximale de réflexion de l'IA.

Enregistrer les paramètres localement.

---

# 12. FONCTIONNALITÉS BONUS

Ajouter :

- Sauvegarde automatique.
- Reprise de partie.
- Statistiques de victoires.
- Statistiques de défaites.
- Historique des parties.
- Plusieurs thèmes.
- Personnalisation des pions.
- Progression XP.
- Niveaux du joueur.
- Récompenses.
- Mode plein écran.
- PWA installable.
- Fonctionnement Offline.

Les données doivent être conservées localement.

Prévoir une gestion des versions des sauvegardes afin de préserver les anciennes données lors des évolutions du projet.

---

# 13. ARCHITECTURE ET QUALITÉ DU CODE

Séparer clairement :

- Moteur de règles.
- Gestion du plateau.
- Gestion des joueurs.
- Intelligence artificielle.
- Algorithme Minimax.
- Élagage Alpha-Bêta.
- Évaluation stratégique.
- Gestion des animations.
- Gestion audio.
- Gestion des paramètres.
- Sauvegarde.
- Statistiques.
- Interface utilisateur.

Le code doit être :

- Propre.
- Commenté.
- Structuré.
- Maintenable.
- Optimisé.
- Facile à faire évoluer.

Ne jamais mélanger les règles du jeu avec le rendu graphique.

Préserver une séparation claire entre le moteur, l'interface et les données.

---

# 14. FONCTIONNEMENT 100 % OFFLINE

Le jeu doit être entièrement utilisable sans connexion Internet après installation et récupération des ressources.

Mettre en place :

- Service Worker.
- Cache des fichiers locaux.
- Manifest PWA.
- Gestion des mises à jour.
- Installation PWA.
- Vérification des dépendances locales.
- Gestion du mode Offline.
- Sauvegardes locales.

Aucune dépendance distante.

Aucun appel API externe.

Aucun chargement Cloud.

IMPORTANT :

Prévoir un lancement via un serveur HTTP local, car les Service Workers ne fonctionnent généralement pas avec une simple ouverture file://.

Fournir une méthode de lancement simple.

Après installation, déconnexion Internet et mise en cache des ressources, toutes les fonctionnalités du jeu doivent rester opérationnelles.

Le moteur Minimax doit continuer à fonctionner normalement.

---

# 15. TESTS ET VALIDATION TECHNIQUE

Effectuer des tests réels avant de considérer le projet terminé.

Tester :

- Déplacements des pions.
- Déplacements des dames.
- Captures obligatoires.
- Prises multiples.
- Prise majoritaire.
- Promotions.
- Conditions de victoire.
- Conditions de match nul.
- Répétitions de position.
- Alternance des joueurs.
- Coups illégaux.
- Annulation d'un coup.
- Sauvegarde.
- Reprise d'une partie.
- Mode deux joueurs.
- Tous les niveaux de difficulté.
- Performances de l'IA.
- Fonctionnement du Web Worker.
- Absence de blocage de l'interface.
- Fonctionnement sans Internet.
- Responsive mobile.
- Absence d'erreurs JavaScript.

Prévoir des tests automatisés pour le moteur de règles et les algorithmes.

Ne pas déclarer une fonctionnalité opérationnelle si elle n'a pas été vérifiée.

---

# 16. LIVRABLES OBLIGATOIRES

Fournir le projet complet avec :

1. index.html.
2. style.css.
3. script.js.
4. Tous les fichiers JavaScript complémentaires.
5. Toutes les dépendances locales.
6. Toutes les ressources graphiques.
7. Tous les fichiers audio.
8. Le Service Worker.
9. Le manifest PWA.
10. Un README détaillé.
11. Un script de préparation des dépendances si nécessaire.
12. Un rapport de tests.

Le README doit expliquer :

- Comment installer le jeu.
- Comment récupérer les dépendances.
- Comment lancer le jeu.
- Comment jouer.
- Comment sélectionner la difficulté.
- Comment utiliser le mode deux joueurs.
- Comment activer le mode plein écran.
- Comment utiliser le jeu sans Internet.

---

# 17. EXIGENCES FINALES ABSOLUES

Je ne veux pas une maquette graphique.

Je veux un véritable jeu de dames entièrement fonctionnel.

Aucun bouton fictif.

Aucune fonctionnalité placeholder.

Aucun chargement depuis un CDN.

Aucun appel à une API distante.

Aucun système d'intelligence artificielle Cloud.

L'intelligence artificielle doit être programmée en JavaScript avec Minimax et Alpha-Bêta.

Elle doit fonctionner sans Internet et sans logiciel d'IA supplémentaire.

Tous les niveaux de difficulté doivent être réellement opérationnels.

Les règles internationales doivent être respectées.

Le jeu doit rester fluide pendant les calculs de l'ordinateur.

Ne jamais remplacer une véritable fonctionnalité par une simple simulation visuelle.

---

# 18. MÉTHODE DE DÉVELOPPEMENT OBLIGATOIRE – PROJET EN 10 PHASES

## PRINCIPE FONDAMENTAL

NE PAS essayer de développer l'intégralité du jeu en une seule génération de code.

Le projet doit être réalisé progressivement, selon une méthodologie professionnelle de développement logiciel.

Tu dois agir comme un chef de projet technique et un développeur senior.

Découper le développement en phases indépendantes, cohérentes et vérifiables.

Chaque phase doit être développée, testée, corrigée et validée avant de passer à la suivante.

Ne jamais sacrifier la qualité du code pour accélérer artificiellement le développement.

## RÈGLE DE FONCTIONNEMENT

Pour chaque phase :

1. Analyser les besoins.
2. Présenter brièvement les objectifs.
3. Identifier les fichiers à créer ou modifier.
4. Développer le code complet de la phase.
5. Intégrer les fonctionnalités dans l'architecture existante.
6. Vérifier la compatibilité avec les phases précédentes.
7. Effectuer les tests nécessaires.
8. Corriger les erreurs détectées.
9. Présenter un bilan des fonctionnalités opérationnelles.
10. Attendre ma validation avant de commencer la phase suivante.

Ne jamais recommencer le projet depuis zéro à chaque phase.

Conserver les fichiers existants et les améliorer progressivement.

Préserver toutes les fonctionnalités déjà validées.

Ne jamais supprimer une fonctionnalité opérationnelle sans raison technique et sans me prévenir.

## PHASE 0 – ARCHITECTURE ET PRÉPARATION

Objectifs :

- Définir l'architecture générale.
- Organiser les dossiers.
- Définir les responsabilités de chaque fichier.
- Identifier les dépendances nécessaires.
- Préparer la stratégie Offline.
- Définir les conventions de programmation.
- Préparer le système de tests.

Livrables :

- Arborescence complète.
- Description des modules.
- Liste des dépendances.
- Plan de développement.
- Architecture technique.

Ne pas développer toutes les fonctionnalités à cette étape.

Attendre ma validation.

## PHASE 1 – PRÉPARATION DES DÉPENDANCES LOCALES

Objectifs :

- Récupérer Bootstrap 5.
- Récupérer Lucide ou Font Awesome.
- Récupérer les polices.
- Préparer les ressources graphiques.
- Préparer les ressources audio.
- Installer les éventuelles bibliothèques complémentaires.
- Vérifier les licences.
- Supprimer toute dépendance CDN.

Créer les dossiers locaux et vérifier les fichiers téléchargés.

Livrables :

- Dossier vendor.
- Dossier assets.
- Liste des versions.
- Rapport de vérification des dépendances.

Attendre ma validation.

## PHASE 2 – DÉVELOPPEMENT DU MOTEUR DE JEU

Objectif : créer un moteur de dames internationales 10x10 parfaitement fonctionnel, indépendamment de l'interface graphique.

Développer :

- Représentation du plateau.
- Gestion des 20 pions par joueur.
- Déplacements.
- Captures obligatoires.
- Prises multiples.
- Prise majoritaire.
- Promotion en dame.
- Déplacements des dames.
- Génération des coups légaux.
- Gestion des séquences de capture.
- Détection des victoires.
- Détection des matchs nuls.
- Historique des coups.
- Annulation d'un coup.

Créer des tests automatisés couvrant les règles internationales.

Livrables :

- Moteur de jeu opérationnel.
- Module de règles.
- Batterie de tests.
- Rapport des résultats.

Aucune interface graphique complexe à cette étape.

Attendre ma validation.

## PHASE 3 – DÉVELOPPEMENT DE L'INTELLIGENCE ARTIFICIELLE

Objectif : créer une véritable IA capable de jouer intelligemment aux dames.

Développer :

- Minimax.
- Élagage Alpha-Bêta.
- Fonction d'évaluation stratégique.
- Gestion des captures.
- Évaluation des positions.
- Analyse des menaces.
- Recherche progressive.
- Ordonnancement des coups.
- Table de transposition.
- Zobrist Hashing.
- Évaluation des fins de partie.
- Limitation du temps de réflexion.

Créer quatre niveaux :

- Facile.
- Normal.
- Difficile.
- Expert.

Utiliser un Web Worker pour ne pas bloquer l'interface.

Tester l'IA sur différentes situations de jeu.

Vérifier systématiquement que chaque coup choisi est légal.

Livrables :

- Moteur IA opérationnel.
- Module Minimax.
- Module Alpha-Bêta.
- Paramètres des difficultés.
- Web Worker.
- Tests de performance.
- Rapport de validation.

Attendre ma validation.

## PHASE 4 – CRÉATION DE L'INTERFACE GRAPHIQUE

Objectif : construire l'identité visuelle premium de CHECKERS LEGEND 2026.

Développer :

- Écran d'accueil.
- Logo.
- Menus.
- Plateau graphique.
- Pions.
- Cases.
- Sélection des pièces.
- Affichage des coups possibles.
- Informations des joueurs.
- Statistiques.
- Historique.
- Menus de configuration.

Intégrer progressivement le moteur de jeu déjà validé.

Respecter la direction artistique définie dans le cahier des charges.

Livrables :

- index.html.
- style.css.
- Modules graphiques JavaScript.
- Interface responsive.
- Intégration du moteur de jeu.

Attendre ma validation.

## PHASE 5 – INTÉGRATION COMPLÈTE DE L'IA

Objectif : connecter le moteur IA à l'interface graphique.

Développer :

- Communication avec le Web Worker.
- Gestion des temps de réflexion.
- Affichage de l'animation de réflexion.
- Sélection automatique des coups.
- Gestion des difficultés.
- Synchronisation entre le moteur et le plateau.
- Gestion des erreurs.
- Annulation des recherches en cours.

Tester des parties complètes contre l'ordinateur.

Vérifier que les coups affichés correspondent toujours aux coups réellement exécutés par le moteur.

Livrables :

- Jeu contre l'ordinateur opérationnel.
- Quatre niveaux fonctionnels.
- Tests complets d'intégration.

Attendre ma validation.

## PHASE 6 – ANIMATIONS ET EXPÉRIENCE PREMIUM

Objectif : apporter la finition visuelle et sonore.

Développer :

- Animations des déplacements.
- Effets de capture.
- Animations de promotion.
- Effets lumineux.
- Particules.
- Confettis.
- Sons.
- Transitions.
- Feedback visuel.
- Effets de victoire.

Ajouter les options d'activation et de désactivation.

Veiller à préserver les performances.

Attendre ma validation.

## PHASE 7 – SAUVEGARDES ET FONCTIONNALITÉS BONUS

Développer :

- LocalStorage ou IndexedDB.
- Sauvegarde automatique.
- Reprise de partie.
- Historique des parties.
- Statistiques.
- Progression XP.
- Niveaux.
- Récompenses.
- Personnalisation des thèmes.
- Paramètres du joueur.
- Mode plein écran.

Tester la persistance des données après fermeture du navigateur.

Attendre ma validation.

## PHASE 8 – INSTALLATION PWA ET FONCTIONNEMENT OFFLINE

Objectif : rendre le jeu totalement autonome après installation et récupération des ressources.

Développer :

- manifest.json.
- service-worker.js.
- Cache des ressources.
- Gestion des mises à jour.
- Installation PWA.
- Vérification des dépendances locales.
- Gestion du mode Offline.

Vérifier qu'aucune ressource externe n'est nécessaire.

Effectuer des tests réels après déconnexion d'Internet.

Le moteur Minimax doit continuer à fonctionner normalement.

Attendre ma validation.

## PHASE 9 – TESTS GÉNÉRAUX ET OPTIMISATION

Effectuer une validation complète du projet.

Tester :

- Toutes les règles internationales.
- Toutes les fonctionnalités.
- Tous les boutons.
- Les quatre niveaux de difficulté.
- Plusieurs parties complètes.
- Les sauvegardes.
- Les animations.
- Les sons.
- Le responsive design.
- Les performances de l'IA.
- Le fonctionnement Offline.
- L'installation PWA.
- L'absence d'erreurs JavaScript.
- L'absence de dépendances distantes.

Corriger tous les problèmes identifiés.

Livrer un rapport de tests final.

Ne jamais déclarer une fonctionnalité validée si elle n'a pas été testée.

## PHASE 10 – LIVRAISON FINALE

Fournir :

- Le projet complet.
- Tous les fichiers sources.
- Toutes les dépendances locales.
- Toutes les ressources.
- Les fichiers PWA.
- Les tests.
- Le README.
- Les instructions d'installation.
- Les instructions de lancement.
- Les instructions de fonctionnement Offline.

Vérifier que le projet est cohérent et entièrement exécutable.

---

# 19. GESTION DES VALIDATIONS ENTRE LES PHASES

Cette règle est obligatoire.

À la fin de chaque phase, présenter un bilan contenant :

### 1. Travail effectué

Liste des fonctionnalités développées.

### 2. Fichiers créés ou modifiés

Liste des fichiers concernés.

### 3. Tests effectués

Liste des tests réellement exécutés.

### 4. Résultats

- Tests réussis.
- Tests échoués.
- Problèmes corrigés.
- Problèmes restants.

### 5. État de la phase

- Terminée.
- En attente de correction.
- En attente de validation.

Ne jamais passer automatiquement à la phase suivante.

Attendre explicitement mon accord.

Je dois pouvoir demander des modifications à une phase déjà développée avant de la valider.

Si une correction concerne une phase précédente, effectuer la correction sans détruire les éléments des phases suivantes.

Maintenir une architecture stable et cohérente tout au long du projet.

---

# 20. GESTION DE LA CONTINUITÉ DU PROJET

Conserver une trace du développement dans un fichier PROJECT_STATUS.md.

Ce fichier doit contenir :

- Numéro de la phase actuelle.
- Phases terminées.
- Phases validées.
- Fichiers existants.
- Fonctionnalités opérationnelles.
- Problèmes connus.
- Résultats des derniers tests.
- Prochaines étapes.

Mettre à jour ce fichier à la fin de chaque phase.

À chaque reprise du travail :

1. Lire PROJECT_STATUS.md.
2. Examiner les fichiers existants.
3. Vérifier l'état réel du projet.
4. Identifier les fonctionnalités déjà développées.
5. Reprendre exactement à la phase en cours.

Ne jamais supposer que le projet est vide.

Ne jamais écraser des fichiers existants sans nécessité.

Ne jamais remplacer du code fonctionnel par du code incomplet.

Si l'environnement ne conserve pas les fichiers entre les sessions, fournir un état de reprise détaillé et demander les fichiers nécessaires.

---

# 21. COMPORTEMENT ATTENDU DE L'IA DÉVELOPPEUSE

Tu dois fonctionner comme un véritable développeur professionnel travaillant avec un client.

Tu développes une phase, tu testes, tu présentes les résultats et tu attends mon accord.

Tu ne dois jamais générer toutes les phases en une seule réponse.

Tu ne dois jamais passer à la phase suivante sans validation explicite.

Tu dois signaler honnêtement les limitations techniques.

Tu dois privilégier :

- La qualité du code.
- La stabilité.
- La fiabilité.
- Les performances.
- La qualité de l'IA.
- La cohérence de l'architecture.
- L'expérience utilisateur.

Le but est de construire progressivement un véritable jeu commercial premium, et non de produire rapidement une simple démonstration.

---

# 22. INSTRUCTION DE DÉMARRAGE

Commence immédiatement par la PHASE 0 : ARCHITECTURE ET PRÉPARATION DU PROJET.

Pour cette première phase :

1. Analyse l'ensemble du cahier des charges.
2. Propose l'architecture technique définitive.
3. Présente l'arborescence complète.
4. Définis les responsabilités de chaque module.
5. Identifie les dépendances nécessaires.
6. Présente le plan de tests.
7. Identifie les éventuels risques techniques.
8. Présente les livrables de cette phase.

Ne commence pas encore les autres phases.

Termine en présentant le bilan de la PHASE 0 et attends ma validation explicite avant de poursuivre.

# OBJECTIF FINAL

Créer CHECKERS LEGEND 2026 :

Un jeu de dames internationales premium, spectaculaire, moderne, doté d'un véritable moteur de jeu et d'une intelligence artificielle Minimax + Alpha-Bêta performante.

Le jeu doit être autonome, sans Cloud, sans API distante, sans abonnement et entièrement utilisable hors ligne après installation.

Le résultat final doit être digne d'un véritable jeu commercial professionnel sorti en 2026.