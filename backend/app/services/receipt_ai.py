import asyncio
import json
import google.generativeai as genai
from app.core.config import get_settings

settings = get_settings()
genai.configure(api_key=settings.GEMINI_API_KEY)


async def categorize_receipt(text: str) -> dict:
    model = genai.GenerativeModel("models/gemini-2.5-flash")

    prompt = f"""You are a financial receipt analyzer.

Extract from the receipt text:
- category (one of: Food, Entertainment, Transport, Shopping, Health, Others)
- total amount (a number, e.g. 18.50)
- transaction type: "income" if money was received, "expense" if money was spent

Rules for finding the total:
- Prefer the final payment amount.
- Look for keywords like TOTAL, PAYMENT, AMOUNT, GRAND TOTAL.
- If the receipt shows "Amount" and "Change", calculate:
  total = amount_paid - change
- Ignore invoice line items or subtotals.

Receipt text:
{text}

Return ONLY valid JSON with these exact keys, no markdown, no explanation:
{{
  "category": "Food",
  "total": 18.50,
  "type": "expense"
}}"""

    try:
        # google-generativeai is sync under the hood — run in executor to not block event loop
        loop = asyncio.get_event_loop()
        response = await loop.run_in_executor(
            None, lambda: model.generate_content(prompt)
        )

        clean = response.text.strip()
        # Strip markdown code fences if Gemini adds them
        if clean.startswith("```"):
            clean = clean.split("```")[1]
            if clean.startswith("json"):
                clean = clean[4:]
        clean = clean.strip()

        parsed = json.loads(clean)

        # Validate and sanitise fields
        return {
            "category": str(parsed.get("category", "Others")),
            "total": float(parsed.get("total", 0)),
            "type": str(parsed.get("type", "expense")),
        }

    except Exception as e:
        print(f"[receipt_ai] Gemini error: {e}")
        return {
            "category": "Others",
            "total": 0.0,
            "type": "expense",
        }