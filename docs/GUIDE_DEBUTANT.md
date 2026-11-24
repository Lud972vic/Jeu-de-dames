# GUIDE DE MAINTENANCE — Pour débuter sans connaître JavaScript

> Ce guide accompagne les commentaires ajoutés dans le code. Il explique le
> **langage** et l'**organisation du projet** avec des mots simples. Aucune
> connaissance préalable n'est nécessaire.

---

## 1. Qu'est-ce que JavaScript, concrètement ?

Un site web est composé de trois couches :

| Couche | Fichier ici | Rôle | Analogie |
|--------|-------------|------|----------|
| Structure | `index.html` | Les boutons, les textes, les écrans | Les murs et les portes d'une maison |
| Apparence | `style.css` | Les couleurs, les tailles, les animations | La peinture et le mobilier |
| Comportement | `script.js` et `js/*.js` | Ce qui se passe quand on clique | Les interrupteurs et les rouages |

JavaScript est le langage qui "fait vivre" la page : il écoute les clics, calcule
les coups légaux, lance l'IA, mémorise la partie, etc.

---

## 2. Les concepts de base en 10 minutes

### 2.1 Une variable = une boîte

```js
const nombre = 10;   // valeur fixe, on ne changera pas la boîte
let compteur = 0;    // valeur variable, on pourra la modifier
compteur = compteur + 1;
```

- `const` = "constant" : la boîte est fixée une fois.
- `let` = "laisser varier" : on peut remettre une autre valeur dedans.

### 2.2 Une fonction = une recette

```js
function addition(a, b) {
  return a + b;
}
const resultat = addition(2, 3); // 5
```

Une fonction reçoit des **paramètres** (`a`, `b`) et **retourne** un résultat avec
`return`. Le projet utilise aussi une écriture courte appelée **fonction fléchée** :

```js
const addition = (a, b) => a + b;
// ou, sur plusieurs lignes :
const direBonjour = (nom) => {
  console.log('Bonjour ' + nom);
};
```

`=>` se lit "donne". C'est exactement la même idée que `function`.

### 2.3 Un objet = une fiche d'identité

```js
const joueur = {
  nom: 'Léa',
  age: 12,
  estActif: true
};
console.log(joueur.nom); // Léa
```

Un objet regroupe des informations sous des noms (`nom`, `age`). On accède à une
information avec un point : `joueur.nom`.

### 2.4 Un tableau = une liste

```js
const couleurs = ['rouge', 'bleu', 'vert'];
console.log(couleurs[0]); // rouge : on compte à partir de 0 !
```

Très important : **le premier élément porte l'index 0**, pas 1. Le plateau de dames
est un tableau de 100 cases, numérotées de 0 à 99.

### 2.5 Une condition = un embranchement

```js
if (compteur > 10) {
  console.log('Grand');
} else {
  console.log('Petit');
}
```

`else` signifie "sinon". On peut enchaîner avec `else if`.

### 2.6 Une boucle = répéter

```js
for (let i = 0; i < 10; i++) {
  console.log(i); // 0, 1, 2 ... 9
}
```

Lisez : "tant que `i` est plus petit que 10, affiche `i`, puis ajoute 1".

### 2.7 Essayer / attraper une erreur

```js
try {
  // code qui peut échouer (ex. lire une sauvegarde abîmée)
} catch (erreur) {
  console.log('Erreur :', erreur);
}
```

Cela évite que le jeu plante. Le projet utilise beaucoup `try/catch` autour du
stockage local.

### 2.8 Une classe = un plan de construction

```js
class Voiture {
  constructor(couleur) {
    this.couleur = couleur;
  }
  demarrer() {
    console.log('Vroom');
  }
}
const maVoiture = new Voiture('rouge');
```

- `class` = le plan.
- `constructor` = ce qui se passe à la création.
- `this` = l'objet en cours de construction.
- `new` = fabriquer un objet à partir du plan.

Dans le projet, `class CheckersApp` (dans `script.js`) est le "chef d'orchestre" :
un seul objet `app` pilote tout le jeu.

---

## 3. Comment le projet est organisé

### 3.1 Le chargement des scripts

`index.html` charge les fichiers JavaScript **dans un ordre précis** :

```
config/game-config.js   → constantes (tailles, difficultés, couleurs)
js/game-rules.js        → règles pures (coups légaux, captures)
js/game-engine.js       → état d'une partie, historique, annulation
js/storage-manager.js   → lecture/écriture dans localStorage
js/profile-manager.js   → profils et sauvegardes nommées
js/settings-manager.js  → réglages
js/statistics.js        → XP, statistiques, succès
js/audio-manager.js     → sons
js/animations.js        → effets visuels
js/particles-background.js → fond animé
js/board-renderer.js    → dessin du plateau
js/puzzles.js           → puzzles
js/ai-engine.js         → intelligence artificielle
script.js               → contrôleur principal
```

**Pourquoi cet ordre ?** Un fichier utilise souvent les objets créés par les
précédents. Par exemple `script.js` a besoin de `GameConfig` et `GameEngine`.
Si on inverse deux lignes, on obtient une erreur "objet introuvable".
Cet ordre est vérifié automatiquement par `tests/test-integrity.js`.

### 3.2 Le motif "IIFE" (les parenthèses autour des fichiers)

Chaque module commence par :

```js
(function (global) {
  'use strict';
  // ... code ...
  global.MonModule = MonModule;
  if (typeof module !== 'undefined' && module.exports) module.exports = MonModule;
})(typeof window !== 'undefined' ? window : globalThis);
```

Explication simple :
- On enveloppe le code dans une fonction pour ne pas "polluer" le reste de la page.
- `global` est la fenêtre du navigateur (ou `globalThis` dans Node.js).
- `'use strict'` demande plus de rigueur (erreurs sur les fautes de frappe).
- Les deux dernières lignes **exportent** le module : il est utilisable par le
  navigateur ET par les tests Node.js. C'est ce qu'on appelle un module UMD.

### 3.3 Les palavres à connaître

| Mot | Signification simple |
|-----|----------------------|
| DOM | L'arbre des éléments de la page, manipulable par JavaScript |
| `querySelector('#id')` | Trouver un élément par son identifiant |
| `addEventListener` | "Écoute cet événement et exécute cette fonction" |
| callback | Une fonction donnée à une autre, appelée plus tard |
| Promise | Un résultat pas encore disponible (ex. réponse de l'IA) |
| async / await | Écrire du code asynchrone comme du code normal |
| localStorage | Petit stockage local du navigateur, persistant |
| JSON | Format de texte pour enregistrer des objets |
| Web Worker | Un second "thread" qui calcule sans bloquer l'écran |
| Web Audio | API du navigateur pour jouer les sons |

---

## 4. Où modifier quoi ? (tâches de maintenance fréquentes)

| Je veux… | Fichier à ouvrir | Repère dans le fichier |
|----------|------------------|------------------------|
| Changer une règle de prise | `js/game-rules.js` | fonctions `getLegalMoves`, `canCapture` |
| Ajouter une difficulté IA | `config/game-config.js` + `js/ai-engine.js` | `DIFFICULTIES` |
| Ajouter un puzzle | `js/puzzles.js` | tableau `PUZZLES`, puis lancer `npm test` |
| Changer une couleur | `style.css` | variables `--cyan`, `--red`, etc. en haut |
| Ajouter un réglage | `js/settings-manager.js` (`DEFAULTS`) + `index.html` + `script.js` (`bindSettings`) | chercher un réglage existant et copier le modèle |
| Ajouter un son | `js/audio-manager.js` + `assets/sounds/` | table des sons |
| Changer une sauvegarde | `js/storage-manager.js`, `script.js` (`buildSavePayload`) | fonctions `get`/`set` |
| Modifier un test | `tests/test-*.js` | garder le même style `test('...', () => {...})` |

---

## 5. Comment lire un commentaire du projet

Les commentaires ajoutés suivent toujours le même modèle :

```js
/**
 * LeButton fait quelque chose (en une phrase).
 * @param {number} valeur - explication simple du paramètre
 * @returns {boolean} ce que la fonction donne en retour
 *
 * Explication pédagogique : ici on explique un concept JS ou une règle de jeu.
 */
```

Dans une documentation destinée à un débutant, on privilégie toujours :
1. **Ce que fait le code** (pas comment il le fait dans les moindres détails).
2. **Pourquoi il est là**.
3. **Le concept du langage** utilisé, la première fois qu'il apparaît.

---

## 6. Vérifier que rien n'est cassé

Après une modification, exécutez dans un terminal ouvert dans le dossier du projet :

```bash
npm test                     # tous les tests automatiques (81 tests)
npm run verify               # tests + intégrité des fichiers et de la PWA
npm run test:browser         # parcours dans Edge/Chrome
npm run test:browser:firefox # parcours dans Firefox
```

Si un test échoue, lisez le message : il indique le nom du test et souvent le
fichier concerné. Le plus souvent, il s'agit d'un identifiant HTML oublié ou d'un
fichier ajouté mais non référencé dans `service-worker.js` ou `index.html`.

---

## 7. Glossaire express

- **Binaire** : une valeur qui ne peut être que vraie (`true`) ou fausse (`false`).
- **Index** : position dans un tableau, commencée à 0.
- **Itération** : un tour de boucle.
- **Récursivité** : une fonction qui s'appelle elle-même (utile pour l'IA).
- **Évaluation** : calcul d'un score pour une position (combien la position est bonne).
- **Alpha-bêta** : astuce pour ignorer des branches inutiles dans l'arbre de recherche.
- **Rafle** : suite de captures consécutives avec la même pièce.
- **Promotion** : un pion qui devient dame en atteignant la dernière rangée.
- **Prise majoritaire** : obligation de choisir la suite qui capture le plus de pièces.
- **Hors ligne** : le jeu fonctionne sans Internet après un premier chargement.
- **PWA** : application web installable, qui se comporte comme une application.

---

## 8. Un conseil pour bien démarrer

N'essayez pas de tout lire d'un coup. Ouvrez `script.js`, lisez d'abord son en-tête,
puis la méthode `init()`. Suivez ensuite un seul fil : **« que se passe-t-il quand
je clique sur un pion ? »**. Vous passerez de `bindEvents` à `onSquareClick`, puis à
`selectSquare`, puis au moteur de règles. C'est le meilleur chemin pour comprendre
le projet sans se perdre.
