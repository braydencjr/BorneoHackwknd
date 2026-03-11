import asyncio
import json
import google.generativeai as genai
from app.core.config import get_settings

settings = get_settings()
genai.configure(api_key=settings.GEMINI_API_KEY)


async def classify_notification(title: str, text: str) -> dict:
    """
    Use Gemini AI to classify a TNG eWallet notification as one of:
      - "general"          → promotional / informational (ignored)
      - "outgoing_payment" → money was spent
      - "incoming_money"   → money was received

    For outgoing_payment / incoming_money, also extract:
      - amount (float)
      - merchant_name (str)
      - category (str)
      - description (str)
    """
    model = genai.GenerativeModel("models/gemini-2.5-flash")

    prompt = f"""You are a financial notification classifier for the Touch 'n Go (TNG) eWallet app.

Given a notification from the TNG eWallet app, classify it as one of:
- "general" — promotional content, ads, announcements, system updates, or any non-transactional notification
- "outgoing_payment" — the user spent money (payment to merchant, bill payment, transfer out, top-up to another service)
- "incoming_money" — the user received money (refund, cashback credited, money received from another user, reload)

If the classification is "outgoing_payment" or "incoming_money", also extract:
- amount: the transaction amount as a number (e.g. 15.90)
- merchant_name: the merchant, recipient, or sender name
- category: one of Food, Transport, Shopping, Entertainment, Utilities, Health, Transfer, Reload, Others
- description: a brief one-line summary of the transaction

Notification title: {title}
Notification text: {text}

Return ONLY valid JSON with these exact keys, no markdown, no explanation:
{{
  "classification": "outgoing_payment",
  "amount": 15.90,
  "merchant_name": "McDonald's",
  "category": "Food",
  "description": "Payment to McDonald's"
}}

If the notification is "general", return:
{{
  "classification": "general",
  "amount": null,
  "merchant_name": null,
  "category": null,
  "description": null
}}"""

    try:
        loop = asyncio.get_event_loop()
        response = await loop.run_in_executor(
            None, lambda: model.generate_content(prompt)
        )

        clean = response.text.strip()
        if clean.startswith("```"):
            clean = clean.split("```")[1]
            if clean.startswith("json"):
                clean = clean[4:]
        clean = clean.strip()

        parsed = json.loads(clean)

        classification = str(parsed.get("classification", "general"))
        if classification not in ("general", "outgoing_payment", "incoming_money"):
            classification = "general"

        result = {"classification": classification}

        if classification != "general":
            result["amount"] = float(parsed.get("amount") or 0)
            result["merchant_name"] = str(parsed.get("merchant_name") or "Unknown")
            result["category"] = str(parsed.get("category") or "Others")
            result["description"] = str(parsed.get("description") or "")
        else:
            result["amount"] = None
            result["merchant_name"] = None
            result["category"] = None
            result["description"] = None

        return result

    except Exception as e:
        print(f"[notification_ai] Gemini error: {e}")
        return {
            "classification": "general",
            "amount": None,
            "merchant_name": None,
            "category": None,
            "description": None,
        }
