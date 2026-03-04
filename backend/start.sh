#!/usr/bin/env bash
# ============================================================
#  BorneoHackwknd Backend -- Init & Start Script (Mac/Linux)
#  Run from anywhere: bash backend/start.sh  or  cd backend && ./start.sh
# ============================================================

set -euo pipefail

# Always run relative to the backend/ folder regardless of where the script was called from
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

VENV_DIR=".venv"
PYTHON="$VENV_DIR/bin/python"
PIP="$VENV_DIR/bin/pip"
UVICORN="$VENV_DIR/bin/uvicorn"
REQ_FILE="requirements.txt"
ENV_FILE=".env"
ENV_EXAMPLE=".env.example"

# ---- Helpers -----------------------------------------------------------------
step() { echo; echo ">> $1"; }
ok()   { echo "   [OK]   $1"; }
warn() { echo "   [WARN] $1"; }
fail() { echo "   [FAIL] $1" >&2; exit 1; }

# ---- 1. Locate a system Python 3.10+ ----------------------------------------
step "Checking system Python"

SYS_PYTHON=""
for candidate in python3 python; do
    if command -v "$candidate" &>/dev/null; then
        ver=$("$candidate" --version 2>&1 | grep -oE '[0-9]+\.[0-9]+' | head -1)
        major=$(echo "$ver" | cut -d. -f1)
        minor=$(echo "$ver" | cut -d. -f2)
        if [ "$major" -ge 3 ] && [ "$minor" -ge 10 ]; then
            SYS_PYTHON="$candidate"
            ok "Found $("$candidate" --version 2>&1)"
            break
        else
            warn "$("$candidate" --version 2>&1) is too old (need 3.10+)"
        fi
    fi
done

[ -z "$SYS_PYTHON" ] && fail "No Python 3.10+ found. Install from https://python.org"

# ---- 2. Create virtual environment if missing --------------------------------
step "Checking virtual environment"

if [ ! -f "$PYTHON" ]; then
    echo "   Creating .venv ..."
    "$SYS_PYTHON" -m venv "$VENV_DIR" || fail "Failed to create virtual environment"
    ok ".venv created"
else
    ok ".venv already exists"
fi

# ---- 3. Upgrade pip ----------------------------------------------------------
step "Upgrading pip"
"$PYTHON" -m pip install --upgrade pip --quiet
ok "pip is up to date"

# ---- 4. Install dependencies -------------------------------------------------
step "Installing dependencies from $REQ_FILE"

[ ! -f "$REQ_FILE" ] && fail "$REQ_FILE not found"

"$PIP" install -r "$REQ_FILE" --quiet || fail "pip install failed"
ok "All dependencies installed"

# ---- 5. Check .env -----------------------------------------------------------
step "Checking .env"

if [ ! -f "$ENV_FILE" ]; then
    if [ -f "$ENV_EXAMPLE" ]; then
        cp "$ENV_EXAMPLE" "$ENV_FILE"
        warn ".env was missing -- copied from .env.example"
        warn "Edit backend/.env with real values then re-run this script."
        exit 0
    else
        fail ".env not found and no .env.example to copy from."
    fi
fi
ok ".env found"

# ---- 6. If MySQL, verify SSL cert files exist --------------------------------
step "Checking database configuration"

DB_URL=$(grep -E '^DATABASE_URL\s*=' "$ENV_FILE" | sed 's/^DATABASE_URL\s*=\s*//' | tr -d '"'"'" | xargs)

if [ -n "$DB_URL" ]; then
    if echo "$DB_URL" | grep -q "^mysql"; then
        echo "   MySQL detected -- verifying SSL cert files ..."

        ALL_CERTS_OK=true
        for CERT_VAR in MYSQL_SSL_CA MYSQL_SSL_CERT MYSQL_SSL_KEY; do
            RAW_PATH=$(grep -E "^${CERT_VAR}\s*=" "$ENV_FILE" | sed "s/^${CERT_VAR}\s*=\s*//" | tr -d '"'"'" | xargs)

            if [ -z "$RAW_PATH" ]; then
                warn "$CERT_VAR is not set in .env"
                ALL_CERTS_OK=false
                continue
            fi

            # Resolve relative paths from the backend/ directory
            if [[ "$RAW_PATH" = /* ]]; then
                RESOLVED="$RAW_PATH"
            else
                RESOLVED="$SCRIPT_DIR/$RAW_PATH"
            fi

            if [ -f "$RESOLVED" ]; then
                ok "$CERT_VAR -> $RESOLVED"
            else
                warn "$CERT_VAR file not found: $RESOLVED"
                warn "Get the cert files from db-setup/ and ensure the path in .env is correct."
                ALL_CERTS_OK=false
            fi
        done

        if [ "$ALL_CERTS_OK" = false ]; then
            echo
            echo "   SSL cert issues detected. The server may fail to connect to MySQL."
            read -r -p "   Continue anyway? [y/N] " answer
            [[ "$answer" =~ ^[Yy]$ ]] || exit 1
        fi

    else
        ok "DATABASE_URL: $DB_URL"
    fi
else
    warn "DATABASE_URL not set in .env -- will use built-in default (SQLite)"
fi

# ---- 7. Start uvicorn --------------------------------------------------------
step "Starting FastAPI server"
echo "   API root  : http://localhost:8000"
echo "   Swagger UI: http://localhost:8000/docs"
echo "   Press Ctrl+C to stop"
echo

"$UVICORN" app.main:app --reload --host 0.0.0.0 --port 8000
