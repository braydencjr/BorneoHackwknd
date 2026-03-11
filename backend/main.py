# from fastapi import FastAPI
# from openai import OpenAI

# app = FastAPI()
# client = OpenAI()

# @app.post("/categorize")
# async def categorize_receipt(text: str):

#     prompt = f"""
# Extract receipt information and categorize expenses.

# Categories:
# Food, Transport, Shopping, Bills, Entertainment, Other

# Receipt text:
# {text}

# Return JSON in this format:
# {{
#   "store": "",
#   "date": "",
#   "items":[
#     {{"name":"","price":0,"category":""}}
#   ],
#   "total":0
# }}
# """

#     response = client.chat.completions.create(
#         model="gpt-4.1-mini",
#         messages=[{"role": "user", "content": prompt}]
#     )

#     return response.choices[0].message.content

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
