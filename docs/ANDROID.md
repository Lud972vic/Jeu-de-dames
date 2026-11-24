# Jouer sur Android — un seul fichier

> **Copiez `dist/checkers-legend-offline.html` sur votre téléphone, ouvrez-le
> avec Chrome, et jouez.** Aucun serveur, aucun hébergement, aucun APK.

## Pourquoi un seul fichier ?

Ouvrir `index.html` depuis un gestionnaire de fichiers Android charge la page
en `file://`. Chrome bloque alors les fichiers voisins (scripts, CSS, polices,
sons) : le jeu ne démarre pas.

Le fichier unique de `dist/` ne charge **rien d'externe** : tout est intégré
dans la page — code, styles, polices, images, sons, IA et système de sauvegarde.
Il fonctionne donc hors ligne, sans permission spéciale et sans application
tierce à installer.

## Utilisation

1. Copiez `dist/checkers-legend-offline.html` sur le téléphone (câble, cloud, messagerie…).
2. Ouvrez le fichier avec **Chrome**.
3. Jouez. La progression est conservée localement sur l'appareil.

## Régénérer le fichier

Après une modification du projet :

```bash
npm run build:offline
```

Le fichier `dist/checkers-legend-offline.html` est alors reconstruit
automatiquement avec le code et les ressources à jour.

## Dépannage rapide

| Symptôme | Solution |
|---|---|
| Écran blanc | Vous avez ouvert `index.html` : utilisez le fichier de `dist/` à la place |
| Pas de son | Touchez l'écran une fois (politique audio d'Android), puis vérifiez le volume |
| IA lente | Choisissez une difficulté plus basse dans les paramètres |
| Partie perdue | Les données sont liées au fichier et au navigateur : ne supprimez pas les données du site |
