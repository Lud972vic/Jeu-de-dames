# ============================================================
# CHECKERS LEGEND 2026 — Script de récupération des dépendances locales
# ------------------------------------------------------------
# Ce script télécharge toutes les dépendances nécessaires pour un
# fonctionnement 100 % offline du jeu. Il est reproductible : il peut être
# relancé à tout moment (par exemple après une mise à jour des versions).
#
# Usage :
#   powershell -ExecutionPolicy Bypass -File scripts/fetch-dependencies.ps1
#
# Prérequis : accès Internet + curl.exe (fourni avec Windows 10+).
# Aucune dépendance externe n'est installée par ce script.
# ============================================================

# ------------------------------------------------------------
# POUR UN DÉBUTANT — Rôle, concepts et mode d'emploi
# ------------------------------------------------------------
# Rôle : ce script prépare toutes les bibliothèques et polices dont le jeu a
# besoin pour fonctionner sans Internet. Il les télécharge une fois pour toutes
# dans le dossier du projet. Ensuite, le jeu utilise ces copies locales : plus
# besoin de réseau pour jouer. On peut relancer le script sans risque, par
# exemple après avoir changé les numéros de version.
#
# Concepts utilisés :
#  - PowerShell : un langage de « scripts » pour Windows. Une ligne qui
#    commence par # est un commentaire : elle est ignorée et sert à expliquer.
#    Les variables commencent par $ (par exemple $Root).
#  - $PSScriptRoot : dossier où se trouve ce fichier ; $Root est le dossier du
#    projet (son parent). Set-Location place le script dans ce dossier pour que
#    tous les chemins relatifs pointent au bon endroit.
#  - curl.exe : petit programme fourni avec Windows qui télécharge un fichier
#    depuis une adresse et l'enregistre sur le disque (-o = fichier de sortie).
#    -s = silencieux, -L = suit les redirections, --fail = échoue si le serveur
#    renvoie une erreur, --max-time = délai maximum en secondes.
#  - $LASTEXITCODE : code de sortie du dernier programme externe ; 0 = réussi.
#  - try / catch : on essaie une action ; si elle échoue, le bloc catch permet
#    d'afficher un message clair au lieu de laisser une erreur brutale.
#  - ArrayList : une liste où l'on ajoute les échecs pour les récapituler à la
#    fin. [void] empêche la liste d'afficher son contenu quand on ajoute un élément.
#  - Vérification : après téléchargement, on regarde la taille du fichier
#    (Get-Item … .Length). Un fichier trop petit est probablement une erreur.
#    Il n'y a pas d'archive à décompresser ici : chaque fichier est téléchargé
#    directement à sa destination (c'est une forme d'« extraction » simple).
#
# Mode d'emploi simple :
#  1. Ouvrez PowerShell et placez-vous à la racine du projet.
#  2. Tapez : powershell -ExecutionPolicy Bypass -File scripts/fetch-dependencies.ps1
#  3. Lisez le résumé final : « Toutes les dépendances … » ou la liste des échecs.
# ------------------------------------------------------------

# Arrêter immédiatement le script si une erreur non prévue survient.
$ErrorActionPreference = 'Stop'
# Split-Path -Parent prend le parent d'un chemin : ici le dossier du projet.
$Root = Split-Path -Parent $PSScriptRoot   # racine du projet (parent de scripts/)
# On se place dans cette racine : tous les chemins qui suivent sont relatifs à elle.
Set-Location $Root

# Write-Host affiche un message coloré dans la console (Cyan = titre).
# Le `n dans la chaîne est un retour à la ligne.
Write-Host "=== CHECKERS LEGEND 2026 — Récupération des dépendances ===" -ForegroundColor Cyan
Write-Host "Racine du projet : $Root`n"

# Liste qui mémorise les téléchargements ratés. Le préfixe $script: signifie
# « variable visible partout dans ce script », y compris dans la fonction plus bas.
$script:failures = New-Object System.Collections.ArrayList

# ------------------------------------------------------------
# Fonction utilitaire : télécharger UN fichier et vérifier qu'il est valide.
# Paramètres :
#   $Url  = adresse du fichier à télécharger ;
#   $Dest = chemin local où l'enregistrer (par exemple vendor/bootstrap/…).
# Retour : aucun valeur explicite ; elle affiche OK ou ÉCHEC et, en cas de
# problème, ajoute un détail dans la liste $script:failures.
# Notion simple : param(...) déclare les arguments reçus par la fonction.
# ------------------------------------------------------------
function Download-File {
    param([string]$Url, [string]$Dest)
    # Étape 1 : trouver le dossier de destination et le créer s'il n'existe pas.
    # Out-Null cache la sortie de New-Item pour ne pas encombrer l'écran.
    $destDir = Split-Path -Parent $Dest
    if (-not (Test-Path $destDir)) { New-Item -ItemType Directory -Force -Path $destDir | Out-Null }
    # On affiche l'adresse demandée pour que l'utilisateur voie ce qui se passe.
    Write-Host "  -> $Url"
    try {
        # Étape 2 : téléchargement proprement dit avec curl.exe. Les options
        # demandent un mode silencieux, le suivi des redirections, l'échec sur
        # erreur HTTP, un délai de 120 secondes et l'écriture dans $Dest.
        curl.exe -sL --fail --max-time 120 -o $Dest $Url
        # Étape 3 : vérification n° 1 — le code de sortie doit être 0.
        if ($LASTEXITCODE -ne 0) { throw "curl exit code $LASTEXITCODE" }
        # Étape 4 : vérification n° 2 — le fichier doit exister et peser au
        # moins 100 octets ; sinon on considère que c'est une page d'erreur.
        $size = (Get-Item $Dest).Length
        if ($size -lt 100) { throw "fichier trop petit ($size octets) — probablement une erreur de téléchargement" }
        Write-Host "     OK ($size octets) -> $Dest" -ForegroundColor Green
    } catch {
        # Étape 5 : en cas d'échec, on affiche le message et on le garde en
        # mémoire pour le résumé final. $_ représente l'erreur survenue.
        Write-Host "     ÉCHEC : $($_.Exception.Message)" -ForegroundColor Red
        [void]$script:failures.Add([PSCustomObject]@{ Url = $Url; Dest = $Dest; Error = $_.Exception.Message })
    }
}

# ------------------------------------------------------------
# 1. Bootstrap 5 (CSS + JS bundle) — licence MIT
# ------------------------------------------------------------
# Étape 1 sur 4 — Bootstrap : sa version est mise dans une variable pour ne pas
# avoir à la répéter dans chaque adresse. Les deux fichiers (CSS et JavaScript)
# sont téléchargés dans le dossier vendor/, réservé aux bibliothèques tierces.
$BootstrapVersion = '5.3.9'
Write-Host "`n[1/4] Bootstrap $BootstrapVersion (MIT)" -ForegroundColor Yellow
Download-File "https://cdn.jsdelivr.net/npm/bootstrap@$BootstrapVersion/dist/css/bootstrap.min.css" "vendor/bootstrap/css/bootstrap.min.css"
Download-File "https://cdn.jsdelivr.net/npm/bootstrap@$BootstrapVersion/dist/js/bootstrap.bundle.min.js" "vendor/bootstrap/js/bootstrap.bundle.min.js"

# ------------------------------------------------------------
# 2. Icônes Lucide (SVG individuels) — licence ISC
#    Seules les icônes réellement utilisées sont téléchargées.
# ------------------------------------------------------------
# Étape 2 sur 4 — Icônes : on ne télécharge que celles réellement utilisées par
# le jeu. La liste $icons contient leurs noms ; la boucle foreach qui suit
# appelle Download-File une fois par nom.
$LucideVersion = '1.77.0'
Write-Host "`n[2/4] Icônes Lucide $LucideVersion (ISC)" -ForegroundColor Yellow
$icons = @(
    'play', 'cpu', 'users', 'help-circle', 'settings', 'volume-2', 'volume-x',
    'pause', 'rotate-cw', 'undo', 'log-out', 'maximize', 'history', 'star',
    'timer', 'crown', 'trophy', 'user', 'medal', 'gamepad', 'x', 'menu',
    'chevron-left', 'sparkles', 'clock', 'info', 'refresh-cw', 'chess-pawn',
    'chess-queen', 'fullscreen', 'play-circle', 'pause-circle',
    'rotate-ccw', 'arrow-left', 'check', 'x-circle'
)
# Pour chaque nom de la liste, composer l'adresse et le chemin de destination
# (assets/icons/<nom>.svg), puis télécharger. $icon prend la valeur courante.
foreach ($icon in $icons) {
    Download-File "https://cdn.jsdelivr.net/npm/lucide-static@$LucideVersion/icons/$icon.svg" "assets/icons/$icon.svg"
}

# ------------------------------------------------------------
# 3. Polices (Orbitron + Rajdhani, subset latin) — licence OFL (SIL Open Font License)
#    Via @fontsource (fichiers .woff2 individuels)
# ------------------------------------------------------------
# Étape 3 sur 4 — Polices : Orbitron pour les titres, Rajdhani pour le texte.
# Chaque fichier .woff2 est une graisse particulière. La boucle plus bas choisit
# la famille selon le début du nom : c'est le rôle de « -like 'orbitron*' »
# (le * signifie « n'importe quoi après »).
$FontSourceVersion = '5.3.0'
Write-Host "`n[3/4] Polices Orbitron & Rajdhani $FontSourceVersion (OFL)" -ForegroundColor Yellow
$fonts = @(
    # Orbitron — titres / logo futuriste
    'orbitron-latin-400-normal.woff2', 'orbitron-latin-500-normal.woff2',
    'orbitron-latin-600-normal.woff2', 'orbitron-latin-700-normal.woff2',
    'orbitron-latin-800-normal.woff2', 'orbitron-latin-900-normal.woff2',
    # Rajdhani — texte courant / interface
    'rajdhani-latin-400-normal.woff2', 'rajdhani-latin-500-normal.woff2',
    'rajdhani-latin-600-normal.woff2', 'rajdhani-latin-700-normal.woff2'
)
# Pour chaque police : choisir le nom de famille, puis télécharger le fichier
# dans assets/fonts/. L'opérateur if/else sur une ligne est une forme courte
# de « si … alors … sinon … ».
foreach ($font in $fonts) {
    $family = if ($font -like 'orbitron*') { '@fontsource/orbitron' } else { '@fontsource/rajdhani' }
    Download-File "https://cdn.jsdelivr.net/npm/${family}@$FontSourceVersion/files/$font" "assets/fonts/$font"
}

# ------------------------------------------------------------
# 4. Vérification finale
# ------------------------------------------------------------
# Étape 4 sur 4 — Vérification finale : on ne se contente pas de faire
# confiance à curl, on revérifie que les fichiers attendus sont bien présents.
Write-Host "`n[4/4] Vérification des fichiers téléchargés" -ForegroundColor Yellow
$vendorFiles = @(
    'vendor/bootstrap/css/bootstrap.min.css',
    'vendor/bootstrap/js/bootstrap.bundle.min.js'
)
# Pour chacun des deux fichiers de bibliothèque : Test-Path demande « existe-t-il ? ».
# S'il manque, on l'ajoute à la liste des échecs avec la mention « local check ».
foreach ($f in $vendorFiles) {
    if (Test-Path $f) {
        $size = (Get-Item $f).Length
        Write-Host "  OK : $f ($size octets)" -ForegroundColor Green
    } else {
        Write-Host "  MANQUANT : $f" -ForegroundColor Red
        [void]$script:failures.Add([PSCustomObject]@{ Url = '(local check)'; Dest = $f; Error = 'fichier absent' })
    }
}
# Compter les fichiers réellement reçus : Get-ChildItem liste les fichiers
# correspondant au motif, Measure-Object compte combien il y en a.
# SilentlyContinue évite une erreur si le dossier n'existe pas encore.
$iconCount = (Get-ChildItem assets/icons/*.svg -ErrorAction SilentlyContinue | Measure-Object).Count
$fontCount = (Get-ChildItem assets/fonts/*.woff2 -ErrorAction SilentlyContinue | Measure-Object).Count
Write-Host "  Icônes SVG : $iconCount / $($icons.Count) attendues"
Write-Host "  Polices .woff2 : $fontCount / $($fonts.Count) attendues"

# Résumé : si la liste des échecs est vide (.Count = 0), on termine avec le
# code 0 (succès). Sinon on affiche chaque problème et on termine avec le code 1
# (échec), ce qui permet à un outil automatique de détecter l'erreur.
Write-Host "`n=== Résumé ===" -ForegroundColor Cyan
if ($script:failures.Count -eq 0) {
    Write-Host "Toutes les dépendances ont été téléchargées avec succès." -ForegroundColor Green
    exit 0
} else {
    Write-Host "ÉCHECS : $($script:failures.Count) fichier(s) non récupéré(s) :" -ForegroundColor Red
    foreach ($f in $script:failures) { Write-Host "  - $($f.Dest) : $($f.Error)" -ForegroundColor Red }
    exit 1
}
