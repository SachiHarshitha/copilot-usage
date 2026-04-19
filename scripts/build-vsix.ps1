# build-vsix.ps1 — Build the VS Code extension (.vsix) locally
# Usage: .\scripts\build-vsix.ps1 [-Clean] [-Install] [-Version 0.2.0]

param(
    [string]$Version,  # Bump version in package.json before building (e.g. 0.2.0)
    [switch]$Clean,    # Remove previous build artifacts first
    [switch]$Install   # Run npm ci before building
)

$ErrorActionPreference = "Stop"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$root      = Split-Path -Parent $scriptDir
$extDir    = Join-Path $root "apps" "vscode-extension"

Write-Host "`n=== Copilot Usage — VS Code Extension Build ===" -ForegroundColor Cyan

Push-Location $extDir

try {
    # --- Version bump ---
    if ($Version) {
        if ($Version -notmatch '^\d+\.\d+\.\d+$') {
            throw "Version must be semver (e.g. 0.2.0). Got: $Version"
        }

        $pkgPath = Join-Path $extDir "package.json"
        $pkgContent = Get-Content $pkgPath -Raw
        if ($pkgContent -match '"version"\s*:\s*"([^"]+)"') {
            $oldVersion = $Matches[1]
        } else {
            throw "Could not find version field in package.json"
        }

        $pkgContent = $pkgContent -replace '("version"\s*:\s*)"[^"]+"', "`$1`"$Version`""
        Set-Content -Path $pkgPath -Value $pkgContent -NoNewline

        Write-Host "`n  Version: $oldVersion -> $Version" -ForegroundColor Green
    } else {
        $pkgPath = Join-Path $extDir "package.json"
        $pkgContent = Get-Content $pkgPath -Raw
        if ($pkgContent -match '"version"\s*:\s*"([^"]+)"') {
            Write-Host "`n  Version: $($Matches[1])" -ForegroundColor DarkGray
        }
    }

    # --- Clean ---
    if ($Clean) {
        Write-Host "`n[1/4] Cleaning previous artifacts..." -ForegroundColor Yellow
        if (Test-Path "dist")          { Remove-Item -Recurse -Force "dist" }
        if (Test-Path "node_modules")  { Remove-Item -Recurse -Force "node_modules" }
        Get-ChildItem -Filter "*.vsix" | Remove-Item -Force
        Write-Host "  Cleaned." -ForegroundColor Green
    }

    # --- Install ---
    if ($Install -or -not (Test-Path "node_modules")) {
        Write-Host "`n[2/4] Installing dependencies..." -ForegroundColor Yellow
        npm ci
        if ($LASTEXITCODE -ne 0) { throw "npm ci failed" }
        Write-Host "  Dependencies installed." -ForegroundColor Green
    } else {
        Write-Host "`n[2/4] Skipping install (node_modules exists, use -Install to force)" -ForegroundColor DarkGray
    }

    # --- Package ---
    Write-Host "`n[3/4] Packaging VSIX..." -ForegroundColor Yellow
    npx @vscode/vsce package --allow-missing-repository --skip-license
    if ($LASTEXITCODE -ne 0) { throw "vsce package failed" }

    $vsix = Get-ChildItem -Filter "*.vsix" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if (-not $vsix) { throw "No .vsix file found after build" }

    # --- Copy to dist ---
    Write-Host "`n[4/4] Copying to project dist/ folder..." -ForegroundColor Yellow
    $distDir = Join-Path $root "dist"
    if (-not (Test-Path $distDir)) { New-Item -ItemType Directory -Path $distDir | Out-Null }
    Copy-Item $vsix.FullName (Join-Path $distDir $vsix.Name) -Force
    Write-Host "  $($vsix.Name) -> dist/" -ForegroundColor Green

    Write-Host "`n=== Build complete ===" -ForegroundColor Cyan
    Write-Host "  VSIX: $($vsix.FullName)" -ForegroundColor White
    Write-Host "  Install: code --install-extension `"$($vsix.FullName)`"" -ForegroundColor DarkGray
    Write-Host ""
} finally {
    Pop-Location
}
