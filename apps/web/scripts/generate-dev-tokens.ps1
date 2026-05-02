<#
.SYNOPSIS
    Generates cryptographic secrets for local development and writes them to .env.

.DESCRIPTION
    Produces fresh random values for:
      - NEXTAUTH_SECRET           (32 bytes, base64)
      - GITHUB_TOKEN_ENCRYPTION_KEYS  (v1 key: 32 bytes, base64, JSON object)
      - ADMIN_FINGERPRINT_SALT    (32 bytes, base64)

    The target .env file is updated in-place. Keys that are already set to
    non-placeholder values are left untouched unless -Force is specified.

    Run from the repo root or from apps/web/:
        .\scripts\generate-dev-tokens.ps1
        .\scripts\generate-dev-tokens.ps1 -Force
        .\scripts\generate-dev-tokens.ps1 -PrintOnly

.PARAMETER EnvFile
    Path to the .env file to update. Defaults to .env in the same directory as this script's parent (apps/web/.env).

.PARAMETER Force
    Overwrite existing non-placeholder values.

.PARAMETER PrintOnly
    Print generated values to stdout without modifying any file.
#>
[CmdletBinding()]
param(
    [string]  $EnvFile   = (Join-Path $PSScriptRoot '..' '.env'),
    [switch]  $Force,
    [switch]  $PrintOnly
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

function New-RandomBase64 {
    param([int] $Bytes = 32)
    $buf = [byte[]]::new($Bytes)
    [System.Security.Cryptography.RandomNumberGenerator]::Fill($buf)
    return [Convert]::ToBase64String($buf)
}

function Get-EnvValue {
    param([string] $Content, [string] $Key)
    if ($Content -match "(?m)^$Key=(.*)$") {
        return $Matches[1].Trim('"').Trim("'")
    }
    return $null
}

function Set-EnvValue {
    param([string] $Content, [string] $Key, [string] $Value, [string] $Quote = '"')
    $escaped = [Regex]::Escape($Key)
    if ($Content -match "(?m)^$escaped=") {
        return $Content -replace "(?m)^$escaped=.*$", "$Key=$Quote$Value$Quote"
    } else {
        # Append if missing
        return $Content.TrimEnd() + "`n$Key=$Quote$Value$Quote`n"
    }
}

function IsPlaceholder {
    param([string] $Value)
    if ([string]::IsNullOrWhiteSpace($Value)) { return $true }
    $placeholders = @(
        'REPLACE_WITH',
        'dev-secret-change-in-production',
        'change_me',
        'your_',
        'xxx',
        ''
    )
    foreach ($p in $placeholders) {
        if ($Value -like "*$p*") { return $true }
    }
    return $false
}

# ---------------------------------------------------------------------------
# Generate tokens
# ---------------------------------------------------------------------------

$nextauthSecret        = New-RandomBase64 32
$encryptionKeyBase64   = New-RandomBase64 32
$encryptionKeysJson    = '{"v1":"' + $encryptionKeyBase64 + '"}'
$fingerprintSalt       = New-RandomBase64 32

if ($PrintOnly) {
    Write-Host ""
    Write-Host "Generated secrets (copy these into apps/web/.env):" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "NEXTAUTH_SECRET=`"$nextauthSecret`""
    Write-Host "GITHUB_TOKEN_ENCRYPTION_KEYS='$encryptionKeysJson'"
    Write-Host "GITHUB_TOKEN_ENCRYPTION_ACTIVE_KEY=`"v1`""
    Write-Host "ADMIN_FINGERPRINT_SALT=`"$fingerprintSalt`""
    Write-Host ""
    exit 0
}

# ---------------------------------------------------------------------------
# Patch .env
# ---------------------------------------------------------------------------

$envPath = Resolve-Path $EnvFile -ErrorAction SilentlyContinue
if (-not $envPath) {
    Write-Error "Cannot find .env at: $EnvFile`nRun start-dev.ps1 first to create it."
    exit 1
}

$content = Get-Content -Raw $envPath

$updated = @()

# NEXTAUTH_SECRET
$current = Get-EnvValue $content 'NEXTAUTH_SECRET'
if ($Force -or (IsPlaceholder $current)) {
    $content = Set-EnvValue $content 'NEXTAUTH_SECRET' $nextauthSecret
    $updated += 'NEXTAUTH_SECRET'
} else {
    Write-Host "  NEXTAUTH_SECRET already set — skipped (use -Force to overwrite)" -ForegroundColor DarkGray
}

# GITHUB_TOKEN_ENCRYPTION_KEYS
$current = Get-EnvValue $content 'GITHUB_TOKEN_ENCRYPTION_KEYS'
if ($Force -or (IsPlaceholder $current)) {
    $content = Set-EnvValue $content 'GITHUB_TOKEN_ENCRYPTION_KEYS' $encryptionKeysJson "'"
    $updated += 'GITHUB_TOKEN_ENCRYPTION_KEYS'
} else {
    Write-Host "  GITHUB_TOKEN_ENCRYPTION_KEYS already set — skipped" -ForegroundColor DarkGray
}

# ADMIN_FINGERPRINT_SALT
$current = Get-EnvValue $content 'ADMIN_FINGERPRINT_SALT'
if ($Force -or (IsPlaceholder $current)) {
    $content = Set-EnvValue $content 'ADMIN_FINGERPRINT_SALT' $fingerprintSalt
    $updated += 'ADMIN_FINGERPRINT_SALT'
} else {
    Write-Host "  ADMIN_FINGERPRINT_SALT already set — skipped" -ForegroundColor DarkGray
}

if ($updated.Count -eq 0) {
    Write-Host ""
    Write-Host "All secrets already populated — nothing changed." -ForegroundColor Yellow
    Write-Host "Use -Force to regenerate existing values." -ForegroundColor DarkGray
    Write-Host ""
    exit 0
}

Set-Content -Path $envPath -Value $content -NoNewline
Write-Host ""
Write-Host "Updated $envPath" -ForegroundColor Green
foreach ($key in $updated) {
    Write-Host "  + $key" -ForegroundColor Cyan
}
Write-Host ""
Write-Host "Restart the Next.js dev server to pick up the new values." -ForegroundColor Yellow
Write-Host ""
