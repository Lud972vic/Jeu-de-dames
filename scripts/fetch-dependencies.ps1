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

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot   # racine du projet (parent de scripts/)
Set-Location $Root

Write-Host "=== CHECKERS LEGEND 2026 — Récupération des dépendances ===" -ForegroundColor Cyan
Write-Host "Racine du projet : $Root`n"

$script:failures = New-Object System.Collections.ArrayList

function Download-File {
    param([string]$Url, [string]$Dest)
    $destDir = Split-Path -Parent $Dest
    if (-not (Test-Path $destDir)) { New-Item -ItemType Directory -Force -Path $destDir | Out-Null }
    Write-Host "  -> $Url"
    try {
        curl.exe -sL --fail --max-time 120 -o $Dest $Url
        if ($LASTEXITCODE -ne 0) { throw "curl exit code $LASTEXITCODE" }
        $size = (Get-Item $Dest).Length
        if ($size -lt 100) { throw "fichier trop petit ($size octets) — probablement une erreur de téléchargement" }
        Write-Host "     OK ($size octets) -> $Dest" -ForegroundColor Green
    } catch {
        Write-Host "     ÉCHEC : $($_.Exception.Message)" -ForegroundColor Red
        [void]$script:failures.Add([PSCustomObject]@{ Url = $Url; Dest = $Dest; Error = $_.Exception.Message })
    }
}

# ------------------------------------------------------------
# 1. Bootstrap 5 (CSS + JS bundle) — licence MIT
# ------------------------------------------------------------
$BootstrapVersion = '5.3.9'
Write-Host "`n[1/4] Bootstrap $BootstrapVersion (MIT)" -ForegroundColor Yellow
Download-File "https://cdn.jsdelivr.net/npm/bootstrap@$BootstrapVersion/dist/css/bootstrap.min.css" "vendor/bootstrap/css/bootstrap.min.css"
Download-File "https://cdn.jsdelivr.net/npm/bootstrap@$BootstrapVersion/dist/js/bootstrap.bundle.min.js" "vendor/bootstrap/js/bootstrap.bundle.min.js"

# ------------------------------------------------------------
# 2. Icônes Lucide (SVG individuels) — licence ISC
#    Seules les icônes réellement utilisées sont téléchargées.
# ------------------------------------------------------------
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
foreach ($icon in $icons) {
    Download-File "https://cdn.jsdelivr.net/npm/lucide-static@$LucideVersion/icons/$icon.svg" "assets/icons/$icon.svg"
}

# ------------------------------------------------------------
# 3. Polices (Orbitron + Rajdhani, subset latin) — licence OFL (SIL Open Font License)
#    Via @fontsource (fichiers .woff2 individuels)
# ------------------------------------------------------------
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
foreach ($font in $fonts) {
    $family = if ($font -like 'orbitron*') { '@fontsource/orbitron' } else { '@fontsource/rajdhani' }
    Download-File "https://cdn.jsdelivr.net/npm/${family}@$FontSourceVersion/files/$font" "assets/fonts/$font"
}

# ------------------------------------------------------------
# 4. Vérification finale
# ------------------------------------------------------------
Write-Host "`n[4/4] Vérification des fichiers téléchargés" -ForegroundColor Yellow
$vendorFiles = @(
    'vendor/bootstrap/css/bootstrap.min.css',
    'vendor/bootstrap/js/bootstrap.bundle.min.js'
)
foreach ($f in $vendorFiles) {
    if (Test-Path $f) {
        $size = (Get-Item $f).Length
        Write-Host "  OK : $f ($size octets)" -ForegroundColor Green
    } else {
        Write-Host "  MANQUANT : $f" -ForegroundColor Red
        [void]$script:failures.Add([PSCustomObject]@{ Url = '(local check)'; Dest = $f; Error = 'fichier absent' })
    }
}
$iconCount = (Get-ChildItem assets/icons/*.svg -ErrorAction SilentlyContinue | Measure-Object).Count
$fontCount = (Get-ChildItem assets/fonts/*.woff2 -ErrorAction SilentlyContinue | Measure-Object).Count
Write-Host "  Icônes SVG : $iconCount / $($icons.Count) attendues"
Write-Host "  Polices .woff2 : $fontCount / $($fonts.Count) attendues"

Write-Host "`n=== Résumé ===" -ForegroundColor Cyan
if ($script:failures.Count -eq 0) {
    Write-Host "Toutes les dépendances ont été téléchargées avec succès." -ForegroundColor Green
    exit 0
} else {
    Write-Host "ÉCHECS : $($script:failures.Count) fichier(s) non récupéré(s) :" -ForegroundColor Red
    foreach ($f in $script:failures) { Write-Host "  - $($f.Dest) : $($f.Error)" -ForegroundColor Red }
    exit 1
}
