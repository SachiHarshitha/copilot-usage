# PowerShell script to bootstrap local dev for promptstreak.dev
# - Starts Docker Desktop if needed
# - Spins up PostgreSQL via Docker
# - Creates .env with dummy credentials if missing
# - Installs dependencies if needed
# - Pushes schema, seeds DB, starts dev server

$ErrorActionPreference = 'Stop'

function Assert-LastExitCode([string]$message) {
    if ($LASTEXITCODE -ne 0) {
        throw $message
    }
}

function Get-PnpmCommand() {
    $candidatePaths = @(
        (Join-Path $env:APPDATA 'npm\pnpm.cmd'),
        (Join-Path $env:LOCALAPPDATA 'pnpm\pnpm.cmd')
    )

    foreach ($candidate in $candidatePaths) {
        if ($candidate -and (Test-Path $candidate)) {
            return $candidate
        }
    }

    $pnpmCommand = Get-Command pnpm -ErrorAction SilentlyContinue
    if ($pnpmCommand) {
        return $pnpmCommand.Source
    }

    $corepackCommand = Get-Command corepack -ErrorAction SilentlyContinue
    if ($corepackCommand) {
        return "$($corepackCommand.Source) pnpm"
    }

    throw "pnpm is not available. Install pnpm or ensure %APPDATA%\\npm is on PATH."
}

function Invoke-Pnpm([string[]]$Arguments) {
    if ($script:PnpmCommand.Contains(' corepack ')) {
        throw 'Unexpected pnpm command format.'
    }

    if ($script:PnpmCommand.EndsWith('corepack.exe') -or $script:PnpmCommand.EndsWith('corepack.cmd')) {
        & $script:PnpmCommand pnpm @Arguments
    } else {
        & $script:PnpmCommand @Arguments
    }

    Assert-LastExitCode "pnpm $($Arguments -join ' ') failed."
}

function Test-TcpPort([string]$HostName, [int]$Port) {
    try {
        $client = [System.Net.Sockets.TcpClient]::new()
        $async = $client.BeginConnect($HostName, $Port, $null, $null)
        $connected = $async.AsyncWaitHandle.WaitOne(1000)
        if (-not $connected) {
            $client.Close()
            return $false
        }

        $client.EndConnect($async)
        $client.Close()
        return $true
    } catch {
        return $false
    }
}

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$webRoot = Resolve-Path $PSScriptRoot

$PG_CONTAINER = "promptstreak-db"
$PG_PORT = 5432
$PG_USER = "postgres"
$PG_PASS = "postgres"
$PG_DB = "promptstreak"
$DATABASE_URL = "postgresql://${PG_USER}:${PG_PASS}@localhost:${PG_PORT}/${PG_DB}?schema=public"

$env:DATABASE_URL = $DATABASE_URL
$env:NEXTAUTH_SECRET = "dev-secret-change-in-production"
$env:NEXTAUTH_URL = "http://localhost:3000"
$env:ENABLE_DEV_LOGIN = "true"
$env:ALLOW_DEV_LOGIN_NONLOCAL = "false"
$env:ENABLE_DEV_TEST_ACCOUNT = "true"
$env:DEV_TEST_ACCOUNT_USERNAME = "localtest"
$env:DEV_TEST_ACCOUNT_DISPLAY_NAME = "Local Test User"
$env:DEV_TEST_ACCOUNT_PROFILE_PUBLIC = "true"
$env:DEV_TEST_ACCOUNT_AVATAR_URL = ""
$env:GITHUB_CLIENT_ID = "dummy-client-id"
$env:GITHUB_CLIENT_SECRET = "dummy-client-secret"
$script:PnpmCommand = Get-PnpmCommand

Push-Location $webRoot
try {
    Write-Host "[1/5] Ensuring Docker and PostgreSQL are available..."
    $dockerDesktop = "C:\Program Files\Docker\Docker\Docker Desktop.exe"

    docker version *> $null
    if ($LASTEXITCODE -ne 0) {
        if (Test-Path $dockerDesktop) {
            Write-Host "[1/5] Starting Docker Desktop..."
            Start-Process $dockerDesktop | Out-Null
            $dockerReady = $false
            for ($attempt = 0; $attempt -lt 30; $attempt++) {
                Start-Sleep -Seconds 2
                docker version *> $null
                if ($LASTEXITCODE -eq 0) {
                    $dockerReady = $true
                    break
                }
            }

            if (-not $dockerReady) {
                throw "Docker Desktop did not become ready in time."
            }
        } else {
            throw "Docker is not available. Install or start Docker Desktop, or provide a local PostgreSQL instance on localhost:${PG_PORT}."
        }
    }

    $pgRunning = docker ps --format '{{.Names}}' | Select-String $PG_CONTAINER -Quiet
    Assert-LastExitCode "Failed to query running Docker containers."

    if (-not $pgRunning) {
        $pgExists = docker ps -a --format '{{.Names}}' | Select-String $PG_CONTAINER -Quiet
        Assert-LastExitCode "Failed to query Docker containers."

        if ($pgExists) {
            Write-Host "[1/5] Starting existing PostgreSQL container..."
            docker start $PG_CONTAINER | Out-Null
            Assert-LastExitCode "Failed to start PostgreSQL container $PG_CONTAINER."
        } else {
            Write-Host "[1/5] Creating PostgreSQL container..."
            docker run --name $PG_CONTAINER -e POSTGRES_USER=$PG_USER -e POSTGRES_PASSWORD=$PG_PASS -e POSTGRES_DB=$PG_DB -p ${PG_PORT}:5432 -d postgres:15 | Out-Null
            Assert-LastExitCode "Failed to create PostgreSQL container $PG_CONTAINER."
        }
    } else {
        Write-Host "[1/5] PostgreSQL container already running."
    }

    $dbReady = $false
    for ($attempt = 0; $attempt -lt 30; $attempt++) {
        if (Test-TcpPort -HostName "localhost" -Port $PG_PORT) {
            $dbReady = $true
            break
        }
        Start-Sleep -Seconds 2
    }

    if (-not $dbReady) {
        throw "PostgreSQL did not become reachable on localhost:${PG_PORT}."
    }

    Write-Host "[2/5] Ensuring .env exists with dummy credentials..."
    $envPath = Join-Path $webRoot ".env"
    if (-not (Test-Path $envPath)) {
        @(
            'DATABASE_URL="' + $DATABASE_URL + '"'
            'NEXTAUTH_SECRET="dev-secret-change-in-production"'
            'NEXTAUTH_URL="http://localhost:3000"'
            'ENABLE_DEV_LOGIN="true"'
            'ALLOW_DEV_LOGIN_NONLOCAL="false"'
            'ENABLE_DEV_TEST_ACCOUNT="true"'
            'DEV_TEST_ACCOUNT_USERNAME="localtest"'
            'DEV_TEST_ACCOUNT_DISPLAY_NAME="Local Test User"'
            'DEV_TEST_ACCOUNT_PROFILE_PUBLIC="true"'
            'DEV_TEST_ACCOUNT_AVATAR_URL=""'
            'GITHUB_CLIENT_ID=dummy-client-id'
            'GITHUB_CLIENT_SECRET=dummy-client-secret'
        ) | Set-Content $envPath
        Write-Host "[2/5] Created .env with dummy local credentials."
    } else {
        Write-Host "[2/5] .env already exists."
    }

    Write-Host "[3/5] Installing dependencies if needed..."
    if (-not (Test-Path (Join-Path $repoRoot "node_modules"))) {
        Push-Location $repoRoot
        try {
            Invoke-Pnpm @('install')
        } finally {
            Pop-Location
        }
    } else {
        Write-Host "[3/5] Workspace dependencies already installed."
    }

    Write-Host "[4/5] Pushing schema and seeding DB..."
    Invoke-Pnpm @('db:push')
    Invoke-Pnpm @('db:seed')

    Write-Host "[5/5] Starting Next.js dev server..."
    Invoke-Pnpm @('dev')
} finally {
    Pop-Location
}
