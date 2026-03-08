"""
otp_service.py
Stores OTPs in a JSON file so they survive uvicorn --reload restarts.
Each entry has a timestamp; OTPs older than OTP_TTL_SECONDS are considered expired.
"""

import json
import os
import random
import time

OTP_TTL_SECONDS = 600          # 10 minutes
OTP_FILE = os.path.join(os.path.dirname(__file__), ".otp_store.json")


def _load() -> dict:
    try:
        with open(OTP_FILE) as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return {}


def _save(store: dict) -> None:
    with open(OTP_FILE, "w") as f:
        json.dump(store, f)


def generate_otp(email: str) -> str:
    store = _load()
    otp = str(random.randint(100000, 999999))
    store[email] = {"otp": otp, "ts": time.time()}
    _save(store)
    return otp


def verify_otp(email: str, otp: str) -> bool:
    store = _load()
    entry = store.get(email)

    if not entry:
        return False

    # Expired?
    if time.time() - entry["ts"] > OTP_TTL_SECONDS:
        del store[email]
        _save(store)
        return False

    if entry["otp"] == otp:
        return True

    return False

def delete_otp(email: str):
    store = _load()
    if email in store:
        del store[email]
        _save(store)