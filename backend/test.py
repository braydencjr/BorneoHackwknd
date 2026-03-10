from google import genai
from app.core.config import get_settings

settings = get_settings()

client = genai.Client(api_key=settings.GEMINI_API_KEY)

for m in client.models.list():
    print(m.name, "->", m.supported_generation_methods)