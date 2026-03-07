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
- category
- total amount
- transaction type

Transaction type:
income = money received
expense = money spent

Allowed categories:
Food, Entertainment, Transport, Shopping, Health, Others

Receipt text:
{text}

Return ONLY valid JSON:

{{
"category": "Food",
"total": 18.50,
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