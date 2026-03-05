import random

otp_store = {}

def generate_otp(email: str):
    otp = str(random.randint(100000, 999999))
    otp_store[email] = otp
    return otp


def verify_otp(email: str, otp: str):
    if otp_store.get(email) == otp:
        del otp_store[email]
        return True
    return False