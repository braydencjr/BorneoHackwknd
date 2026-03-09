import smtplib
from email.message import EmailMessage
import os
from app.core.config import settings

EMAIL_ADDRESS = settings.EMAIL_ADDRESS
EMAIL_PASSWORD = settings.EMAIL_PASSWORD

def send_email(to_email, otp):
    if not EMAIL_ADDRESS or not EMAIL_PASSWORD:
        raise ValueError(
            "EMAIL_ADDRESS and EMAIL_PASSWORD must be set in the backend .env file. "
            "Please add your Gmail address to EMAIL_ADDRESS."
        )

    msg = EmailMessage()
    msg.set_content(f"Your OTP code is: {otp}")

    msg["Subject"] = "Your OTP Code"
    msg["From"] = EMAIL_ADDRESS
    msg["To"] = to_email

    try:
        with smtplib.SMTP_SSL("smtp.gmail.com", 465) as smtp:
            smtp.login(EMAIL_ADDRESS, EMAIL_PASSWORD)
            smtp.send_message(msg)
    except smtplib.SMTPAuthenticationError as e:
        raise ValueError(f"Email authentication failed. Check EMAIL_ADDRESS and EMAIL_PASSWORD in .env. Error: {e}")
    except smtplib.SMTPException as e:
        raise ValueError(f"Failed to send email: {e}")