<#
.SYNOPSIS
  Release a new version of copilot-usage to PyPI via GitHub Actions.

.DESCRIPTION
  1. Validates the version argument (must be semver like 0.2.0).
  2. Updates the version in pyproject.toml and src/copilot_usage/__init__.py.
  3. Commits the version bump.
  4. Creates a git tag (v0.2.0).
  5. Pushes commit + tag to origin, triggering the release workflow.

.PARAMETER Version
  The new version number (e.g. 0.2.0). Do NOT include the "v" prefix.

.PARAMETER DryRun
  Show what would happen without making any changes.

.EXAMPLE
  .\scripts\release.ps1 -Version 0.2.0
  .\scripts\release.ps1 -Version 0.3.0 -DryRun
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

$RepoRoot   = Split-Path -Parent $PSScriptRoot
$Pyproject  = Join-Path $RepoRoot "apps" "cli" "pyproject.toml"
$InitFile   = Join-Path $RepoRoot "apps" "cli" "src" "copilot_usage" "__init__.py"

if (-not (Test-Path $Pyproject)) {
    Write-Error "Cannot find $Pyproject — run from the repo root."
}
if (-not (Test-Path $InitFile)) {
    Write-Error "Cannot find $InitFile — unexpected repo layout."
}

# ── Validate version format ───────────────────────────────────────

if ($Version -notmatch '^\d+\.\d+\.\d+$') {
    Write-Error "Version must be semver (e.g. 0.2.0). Got: $Version"
}

$Tag = "v$Version"

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

    $pyprojectContent = Get-Content $Pyproject -Raw
    if ($pyprojectContent -match 'version\s*=\s*"([^"]+)"') {
        $currentVersion = $Matches[1]
    }
    else {
        Write-Error "Could not find version in $Pyproject"
    }

    Write-Host ""
    Write-Host "  copilot-usage release" -ForegroundColor Cyan
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

    # ── Bump version in pyproject.toml ────────────────────────────

    $pyprojectContent = $pyprojectContent -replace '(version\s*=\s*)"[^"]+"', "`$1`"$Version`""
    Set-Content -Path $Pyproject -Value $pyprojectContent -NoNewline

    # ── Bump version in __init__.py ───────────────────────────────

    $initContent = Get-Content $InitFile -Raw
    $initContent = $initContent -replace '__version__\s*=\s*"[^"]+"', "__version__ = `"$Version`""
    Set-Content -Path $InitFile -Value $initContent -NoNewline

    Write-Host "  [1/4] Version bumped to $Version" -ForegroundColor Green

    # ── Commit ────────────────────────────────────────────────────

    git add $Pyproject $InitFile
    git commit -m "release: v$Version"
    Write-Host "  [2/4] Committed version bump" -ForegroundColor Green

    # ── Tag ───────────────────────────────────────────────────────

    git tag -a $Tag -m "Release $Tag"
    Write-Host "  [3/4] Created tag $Tag" -ForegroundColor Green

    # ── Push ──────────────────────────────────────────────────────

    git push origin $branch --tags
    Write-Host "  [4/4] Pushed to origin" -ForegroundColor Green

    Write-Host ""
    Write-Host "  Release triggered! Watch progress at:" -ForegroundColor Cyan
    Write-Host "  https://github.com/SachiHarshitha/copilot-usage/actions" -ForegroundColor DarkCyan
    Write-Host ""

}
finally {
    Pop-Location
}
