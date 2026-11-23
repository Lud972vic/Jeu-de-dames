# Jouer sur Android — guide pratique

> Ce jeu est une **PWA** (application web), pas un programme Android natif.
> Il existe trois façons de le lancer sur un téléphone Android. Les deux
> méthodes « copier le dossier » et « APK PWABuilder sans hébergement » ne
> peuvent pas fonctionner ; explications et solutions ci-dessous.

---

## Pourquoi ça ne marche pas quand on copie le dossier ?

Si vous ouvrez `index.html` depuis un gestionnaire de fichiers, le téléphone
charge la page en `file://`. Chrome Android bloque alors le chargement des
fichiers voisins (`vendor/`, `js/`, `assets/`, polices…) : les scripts et le CSS
ne s'exécutent pas, d'où l'écran blanc ou l'interface « morte ».

Dans le détail :

- les balises `<script src="js/...">` et `<link href="style.css">` sont refusées ;
- le **Service Worker** est désactivé sur `file://` (pas de cache hors ligne) ;
- `fetch('assets/sounds/...')` est bloqué (les sons deviennent silencieux) ;
- le **Web Worker** de l'IA ne peut pas être créé (un repli sur le thread
  principal existe, mais il ne règle pas le problème des fichiers bloqués).

---

## Pourquoi l'APK généré par PWABuilder ne marche pas ?

L'APK produit par PWABuilder est une **Trusted Web Activity** : une fenêtre
Android qui **ouvre une URL HTTPS**. Il ne contient **aucun fichier du jeu**.

Pour qu'il fonctionne, il faut obligatoirement :

1. héberger le dossier sur une URL HTTPS **publique** ;
2. générer l'APK **depuis cette URL** (pas depuis `http://localhost:8080` :
   sur le téléphone, `localhost` désigne le téléphone lui-même) ;
3. déposer `assetlinks.json` sur le domaine, avec l'empreinte SHA-256 de la clé
   de signature utilisée lors de la génération.

Sans cela, l'APK s'ouvre sur une page d'erreur ou sur la page d'accueil du
navigateur, mais jamais sur le jeu.

---

## Option 1 — Le fichier HTML unique (le plus simple, sans hébergement)

Cette option réglera le cas « j'ai copié le dossier sur mon téléphone » :
**un seul fichier** contient le code, les styles, les polices, les images,
les sons et le Worker. Il n'y a plus aucun fichier voisin à charger.

### Sur l'ordinateur

```bash
npm run build:offline
# équivalent : node scripts/build-offline-html.js
```

Résultat : `dist/checkers-legend-offline.html` (environ 1,1 Mo).

### Sur le téléphone

1. Transférez **ce fichier unique** (USB, Google Drive, WhatsApp à vous-même,
   email…). Inutile de copier tout le dossier.
2. Ouvrez-le avec **Chrome** (pas avec un éditeur de texte ou un lecteur
   générique). Android Chrome affichera une URL `file:///.../checkers-legend-offline.html`.
3. Le jeu démarre, **même sans connexion**.

Vous pouvez ensuite, dans le menu Chrome `⋮`, choisir « Ajouter à l'écran
d'accueil » pour obtenir un raccourci avec votre icône.

### Limites de cette option

- pas d'installation PWA complète (pas de Service Worker sur `file://`) ;
- si Chrome refuse le Worker en `blob:`, l'IA bascule automatiquement sur le
  thread principal : le jeu reste jouable, mais l'attente peut être un peu plus
  sensible sur les difficultés élevées ;
- les sons sont intégrés sous forme de données, ils fonctionnent après la
  première interaction (politique audio d'Android).

---

## Option 2 — La vraie PWA installable (recommandée pour un usage quotidien)

C'est l'usage prévu par le projet : une icône, un plein écran, et le jeu
disponible hors ligne après le premier chargement.

1. Créez un dépôt GitHub et poussez **tout le dossier** (le fichier `.nojekyll`
   est déjà inclus).
2. Dans le dépôt : **Settings → Pages → Deploy from a branch → main / root**.
3. Notez l'URL obtenue : `https://<votre-pseudo>.github.io/<votre-depot>/`.
4. Sur le téléphone, ouvrez cette URL dans **Chrome**.
5. Menu `⋮` → **« Ajouter à l'écran d'accueil »** (ou « Installer l'application »).
6. Après ce premier chargement, coupez le réseau : le jeu fonctionne toujours.

Le manifeste utilise des chemins relatifs (`"./"`), donc l'installation
fonctionne aussi dans un sous-dossier comme `.../JeuxDeDames/`.

---

## Option 3 — L'APK PWABuilder (si vous tenez absolument à un APK)

1. Hébergez d'abord le site en HTTPS public (voir option 2). Vérifiez que
   `https://<votre-url>/manifest.json` s'affiche bien.
2. Collez **cette URL** dans [PWABuilder](https://www.pwabuilder.com/) et
   vérifiez que l'outil détecte bien une PWA valide (manifeste + Service Worker).
3. **Package for stores → Android**. Choisissez un identifiant unique, par
   exemple `com.lud972vic.checkerslegend`.
4. Téléchargez le **keystore** généré et conservez-le précieusement : il vous
   faudra la même clé pour toute mise à jour. PWABuilder affiche l'empreinte
   `SHA-256` du certificat.
5. Créez le fichier `.well-known/assetlinks.json` à la racine du site hébergé :

   ```json
   [
     {
       "relation": ["delegate_permission/common.handle_all_urls"],
       "target": {
         "namespace": "android_app",
         "package_name": "com.lud972vic.checkerslegend",
         "sha256_cert_fingerprints": [
           "AA:BB:CC:DD:EE:FF:..."
         ]
       }
     }
   ]
   ```

6. Remplacez l'empreinte par la vôtre, repoussez le fichier et vérifiez que
   `https://<votre-url>/.well-known/assetlinks.json` répond bien (code 200).
   Le bouton « Validate » de PWABuilder permet de confirmer la liaison.
7. Téléchargez l'APK, envoyez-le sur le téléphone et installez-le (Android
   demandera d'autoriser les sources inconnues pour ce fichier).

**Important :** cet APK reste un wrapper Internet. Sans réseau lors du premier
lancement, il n'affichera rien. Le mode hors ligne ne devient disponible
qu'après que le Service Worker a mis le jeu en cache. Pour un APK totalement
autonome (fichiers embarqués), il faut un autre outil (Capacitor, Cordova,
Android Studio avec WebView) — ce n'est pas ce que produit PWABuilder.

---

## Dépannage rapide

| Symptôme | Cause probable | Solution |
|---|---|---|
| Écran blanc en ouvrant `index.html` | `file://` + fichiers voisins bloqués | Utiliser le fichier unique (option 1) |
| L'APK affiche une erreur de page | URL générée = `localhost` ou site non publié | Régénérer depuis l'URL HTTPS publique |
| Barre d'adresse visible dans l'APK | `assetlinks.json` absent ou mauvaise empreinte | Corriger `.well-known/assetlinks.json` avec la clé utilisée |
| Pas de son | Première interaction pas encore faite | Toucher l'écran, vérifier le volume et le réglage « Sons » |
| IA lente sur Expert | Téléphone peu puissant + repli thread principal | Passer en Difficulté/Normal ou utiliser la PWA (option 2) |
| « Ajouter à l'écran d'accueil » absent | Site ouvert en `file://` ou hors HTTPS | Passer par l'URL HTTPS (option 2) |
