# ============================================================
#  BorneoHackwknd Backend -- Init & Start Script
#  Run from anywhere: .\backend\start.ps1  or  cd backend; .\start.ps1
# ============================================================

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# Always run relative to the backend/ folder regardless of where the script was called from
Set-Location $PSScriptRoot

$VENV_DIR    = ".venv"
$PYTHON      = "$VENV_DIR\Scripts\python.exe"
$PIP         = "$VENV_DIR\Scripts\pip.exe"
$UVICORN     = "$VENV_DIR\Scripts\uvicorn.exe"
$REQ_FILE    = "requirements.txt"
$ENV_FILE    = ".env"
$ENV_EXAMPLE = ".env.example"

function Write-Step { param($msg) Write-Host "`n>> $msg" -ForegroundColor Cyan }
function Write-OK   { param($msg) Write-Host "   [OK]   $msg" -ForegroundColor Green }
function Write-Warn { param($msg) Write-Host "   [WARN] $msg" -ForegroundColor Yellow }
function Write-Fail { param($msg) Write-Host "   [FAIL] $msg" -ForegroundColor Red; exit 1 }

# ---- 1. Locate a system Python 3.10+ ----------------------------------------
Write-Step "Checking system Python"

$sysPython = $null
foreach ($candidate in @("python", "python3", "py")) {
    try {
        $ver = & $candidate --version 2>&1
        if ($ver -match "Python (\d+)\.(\d+)") {
            $major = [int]$Matches[1]
            $minor = [int]$Matches[2]
            if ($major -ge 3 -and $minor -ge 10) {
                $sysPython = $candidate
                Write-OK "Found $ver"
                break
            } else {
                Write-Warn "$ver is too old (need 3.10+)"
            }
        }
    } catch { }
}

if (-not $sysPython) {
    Write-Fail "No Python 3.10+ found. Install from https://python.org"
}

# ---- 2. Create virtual environment if missing --------------------------------
Write-Step "Checking virtual environment"

if (-not (Test-Path $PYTHON)) {
    Write-Host "   Creating .venv ..." -ForegroundColor Yellow
    & $sysPython -m venv $VENV_DIR
    if ($LASTEXITCODE -ne 0) { Write-Fail "Failed to create virtual environment" }
    Write-OK ".venv created"
} else {
    Write-OK ".venv already exists"
}

# ---- 3. Upgrade pip ----------------------------------------------------------
Write-Step "Upgrading pip"
& $PYTHON -m pip install --upgrade pip --quiet
Write-OK "pip is up to date"

# ---- 4. Install dependencies -------------------------------------------------
Write-Step "Installing dependencies from $REQ_FILE"

if (-not (Test-Path $REQ_FILE)) {
    Write-Fail "$REQ_FILE not found"
}

& $PIP install -r $REQ_FILE --quiet
if ($LASTEXITCODE -ne 0) { Write-Fail "pip install failed" }
Write-OK "All dependencies installed"

# ---- 5. Check .env -----------------------------------------------------------
Write-Step "Checking .env"

if (-not (Test-Path $ENV_FILE)) {
    if (Test-Path $ENV_EXAMPLE) {
        Copy-Item $ENV_EXAMPLE $ENV_FILE
        Write-Warn ".env was missing -- copied from .env.example"
        Write-Warn "Edit backend\.env with real values then re-run this script."
        exit 0
    } else {
        Write-Fail ".env not found and no .env.example to copy from."
    }
}
Write-OK ".env found"

# ---- 6. If MySQL, verify SSL cert files exist --------------------------------
Write-Step "Checking database configuration"

$envContent = Get-Content $ENV_FILE -Raw
$dbUrlMatch = [regex]::Match($envContent, '(?m)^DATABASE_URL\s*=\s*(.+)$')

if ($dbUrlMatch.Success) {
    $dbUrl = $dbUrlMatch.Groups[1].Value.Trim().Trim('"').Trim("'")

    if ($dbUrl -match "^mysql") {
        Write-Host "   MySQL detected -- verifying SSL cert files ..." -ForegroundColor Yellow

        $certVars   = @("MYSQL_SSL_CA", "MYSQL_SSL_CERT", "MYSQL_SSL_KEY")
        $allCertsOk = $true

        foreach ($certVar in $certVars) {
            $m = [regex]::Match($envContent, "(?m)^$certVar\s*=\s*(.+)$")

            if (-not $m.Success -or [string]::IsNullOrWhiteSpace($m.Groups[1].Value)) {
                Write-Warn "$certVar is not set in .env"
                $allCertsOk = $false
                continue
            }

            $rawPath = $m.Groups[1].Value.Trim().Trim('"').Trim("'")

            if ([System.IO.Path]::IsPathRooted($rawPath)) {
                $resolved = $rawPath
            } else {
                $resolved = Join-Path $PSScriptRoot $rawPath
            }

            if (Test-Path $resolved) {
                Write-OK "${certVar} -> $resolved"
            } else {
                Write-Warn "${certVar} file not found: $resolved"
                Write-Warn "Get the cert files from db-setup/ and ensure the path in .env is correct."
                $allCertsOk = $false
            }
        }

        if (-not $allCertsOk) {
            Write-Host ""
            Write-Host "   SSL cert issues detected. The server may fail to connect to MySQL." -ForegroundColor Yellow
            $answer = Read-Host "   Continue anyway? [y/N]"
            if ($answer -notmatch "^[Yy]") { exit 1 }
        }

    } else {
        Write-OK "DATABASE_URL: $dbUrl"
    }
} else {
    Write-Warn "DATABASE_URL not set in .env -- will use built-in default (SQLite)"
}

# ---- 7. Start uvicorn --------------------------------------------------------
Write-Step "Starting FastAPI server"
Write-Host "   API root  : http://localhost:8000" -ForegroundColor White
Write-Host "   Swagger UI: http://localhost:8000/docs" -ForegroundColor White
Write-Host "   Press Ctrl+C to stop`n" -ForegroundColor White

& $UVICORN app.main:app --reload --host 0.0.0.0 --port 8000
