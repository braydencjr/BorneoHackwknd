import google.generativeai as genai
import json
from app.core.config import get_settings

settings = get_settings()
genai.configure(api_key=settings.GEMINI_API_KEY)

async def categorize_receipt(text: str):

    model = genai.GenerativeModel("models/gemini-2.5-flash")

    prompt = f"""
You are a financial receipt analyzer.

Extract:
1. spending category
2. total amount
3. transaction type (income or expense)

Definitions:
- income = money received (salary, refund, payment received)
- expense = money spent (shopping, medical, food, transport)

Allowed categories:
Food, Entertainment, Transport, Shopping, Health, Others

Receipt text:
{text}

Return ONLY JSON:

{{
  "category": "Health",
  "total": 155.00,
  "type": "expense"
}}
"""

    response = model.generate_content(prompt)

    try:
        clean = response.text.replace("```json", "").replace("```", "").strip()
        return json.loads(clean)
    except:
        print("Gemini raw output:", response.text)
        return {
            "category": "Others",
            "total": 0
        }