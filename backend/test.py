import google.generativeai as genai
from app.core.config import get_settings

settings = get_settings()

genai.configure(api_key=settings.GEMINI_API_KEY)

for m in genai.list_models():
    print(m.name, "->", m.supported_generation_methods)