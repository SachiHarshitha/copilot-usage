<#
.SYNOPSIS
  Release a new version of the Copilot Usage VS Code extension via GitHub Actions.

.DESCRIPTION
  1. Validates the version argument (must be semver like 0.2.0).
  2. Updates the version in apps/vscode-extension/package.json.
  3. Builds the VSIX to verify everything compiles.
  4. Commits the version bump.
  5. Creates a git tag (ext-v0.2.0).
  6. Pushes commit + tag to origin, triggering the extension release workflow.

.PARAMETER Version
  The new version number (e.g. 0.2.0). Do NOT include the "v" prefix.

.PARAMETER DryRun
  Show what would happen without making any changes.

.EXAMPLE
  .\scripts\release-extension.ps1 -Version 0.2.0
  .\scripts\release-extension.ps1 -Version 0.3.0 -DryRun
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [string]$Version,

    [switch]$DryRun
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# ── Resolve paths ─────────────────────────────────────────────────

$RepoRoot    = Split-Path -Parent $PSScriptRoot
$PackageJson = Join-Path $RepoRoot "apps" "vscode-extension" "package.json"
$BuildScript = Join-Path $RepoRoot "scripts" "build-vsix.ps1"

if (-not (Test-Path $PackageJson)) {
    Write-Error "Cannot find $PackageJson — run from the repo root."
}

# ── Validate version format ───────────────────────────────────────

if ($Version -notmatch '^\d+\.\d+\.\d+$') {
    Write-Error "Version must be semver (e.g. 0.2.0). Got: $Version"
}

$Tag = "ext-v$Version"

# ── Check for clean working tree ──────────────────────────────────

Push-Location $RepoRoot
try {
    $dirty = git status --porcelain
    if ($dirty) {
        Write-Error "Working tree is dirty. Commit or stash changes first.`n$dirty"
    }

    # Ensure we're on master/main
    $branch = git rev-parse --abbrev-ref HEAD
    if ($branch -ne "master" -and $branch -ne "main") {
        Write-Warning "You are on branch '$branch', not master/main."
    }

    # Check tag doesn't already exist
    $existingTag = git tag -l $Tag
    if ($existingTag) {
        Write-Error "Tag $Tag already exists. Choose a different version."
    }

    # ── Read current version ──────────────────────────────────────

    $pkgContent = Get-Content $PackageJson -Raw
    if ($pkgContent -match '"version"\s*:\s*"([^"]+)"') {
        $currentVersion = $Matches[1]
    }
    else {
        Write-Error "Could not find version in $PackageJson"
    }

    Write-Host ""
    Write-Host "  copilot-usage extension release" -ForegroundColor Cyan
    Write-Host "  ──────────────────────────────────" -ForegroundColor DarkGray
    Write-Host "  Current version : $currentVersion"
    Write-Host "  New version     : $Version"
    Write-Host "  Tag             : $Tag"
    Write-Host "  Dry run         : $DryRun"
    Write-Host ""

    if ($DryRun) {
        Write-Host "  [DRY RUN] No changes will be made." -ForegroundColor Yellow
        return
    }

    # ── Bump version in package.json ──────────────────────────────

    $pkgContent = $pkgContent -replace '("version"\s*:\s*)"[^"]+"', "`$1`"$Version`""
    Set-Content -Path $PackageJson -Value $pkgContent -NoNewline
    Write-Host "  [1/5] Version bumped to $Version" -ForegroundColor Green

    # ── Build VSIX to verify ──────────────────────────────────────

    Write-Host "  [2/5] Building VSIX..." -ForegroundColor Yellow
    & $BuildScript
    if ($LASTEXITCODE -ne 0) {
        Write-Error "VSIX build failed. Fix errors before releasing."
    }
    Write-Host "  [2/5] VSIX built successfully" -ForegroundColor Green

    # ── Commit ────────────────────────────────────────────────────

    git add $PackageJson
    git commit -m "release(extension): v$Version"
    Write-Host "  [3/5] Committed version bump" -ForegroundColor Green

    # ── Tag ───────────────────────────────────────────────────────

    git tag -a $Tag -m "Extension release $Tag"
    Write-Host "  [4/5] Created tag $Tag" -ForegroundColor Green

    # ── Push ──────────────────────────────────────────────────────

    git push origin $branch --tags
    Write-Host "  [5/5] Pushed to origin" -ForegroundColor Green

    Write-Host ""
    Write-Host "  Extension release triggered! Watch progress at:" -ForegroundColor Cyan
    Write-Host "  https://github.com/SachiHarshitha/copilot-usage/actions" -ForegroundColor DarkCyan
    Write-Host ""

}
finally {
    Pop-Location
}
