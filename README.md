# BorneoHackwknd

Full-stack mobile application: **React Native (Expo)** frontend + **FastAPI** backend.

```
BorneoHackwknd/
├── frontend/      # Expo React Native app
│   ├── app/
│   ├── assets/
│   ├── components/
│   ├── constants/
│   ├── hooks/
│   ├── services/
│   ├── package.json
│   └── tsconfig.json
└── backend/       # FastAPI Python API
    ├── app/
    │   ├── main.py
    │   ├── core/          # config, security (JWT)
    │   ├── routes/        # auth, health, ...
    │   ├── schemas/       # Pydantic models
    │   └── dependencies.py
    ├── requirements.txt
    ├── Dockerfile
    └── .env.example
```

---

## Run the Backend

```bash
cd backend

# 1. Create virtual environment
python -m venv .venv

# Windows PowerShell
.venv\Scripts\Activate

# macOS / Linux
source .venv/bin/activate

# 2. Install dependencies
pip install -r requirements.txt

# 3. Copy and fill env file
cp .env.example .env   # then edit .env with your SECRET_KEY etc.

# 4. Start the dev server
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

API docs available at:
- Swagger UI: http://localhost:8000/docs
- ReDoc:       http://localhost:8000/redoc
- Health:      http://localhost:8000/health

---

## Run the Frontend

```bash
cd frontend

npm install
npm start        # opens Expo dev tools / Metro bundler
```

From Expo dev tools:
- **Physical device**: scan QR code with Expo Go app
- **Android emulator**: press `a` (Android Studio AVD must be running)
- **Web browser**: press `w`

### API base URL for development

In your `frontend/services/` files, point to:

| Environment | URL |
|---|---|
| Expo web / same machine | `http://localhost:8000` |
| Android Emulator (AVD) | `http://10.0.2.2:8000` |
| Physical device (LAN) | `http://<your-machine-LAN-IP>:8000` |

---

## Docker (backend)

```bash
cd backend
docker build -t borneohackwknd-api .
docker run -p 8000:8000 --env-file .env borneohackwknd-api
```