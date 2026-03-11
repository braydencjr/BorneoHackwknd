import asyncio
from app.core.security import verify_password

# Database rows provided by user:
# 1|braydencjr05@gmail.com|brayden|$2b$12$O/gNL/0DkbyiAzwC9ExYl.wfYobfwjtdYrJHU8VVSuQAufk2rfGv6|1
# 2|23096507@siswa.um.edu.my|brayden|$2b$12$PGuZi01U6sNOiQQ6cuRX8OwLwfunz.S0sIFQh6Rg5eFU1JneQA30.|1

hashed1 = "$2b$12$O/gNL/0DkbyiAzwC9ExYl.wfYobfwjtdYrJHU8VVSuQAufk2rfGv6"
hashed2 = "$2b$12$PGuZi01U6sNOiQQ6cuRX8OwLwfunz.S0sIFQh6Rg5eFU1JneQA30."

print("Verifying braydencjr05@gmail.com with 'abc123':", verify_password("abc123", hashed1))
print("Verifying 23096507@siswa.um.edu.my with 'abc123':", verify_password("abc123", hashed2))
