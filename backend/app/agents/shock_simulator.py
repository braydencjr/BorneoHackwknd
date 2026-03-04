"""
ShockSimulatorSubAgent — runs in an isolated context window.

This subagent is spawned by the main FinShieldAgent when a user asks
about a shock scenario (illness, job loss, disaster, war). Its context
is completely separate from the main conversation, preventing verbose
simulation reasoning from polluting the main agent's context window.
"""

SHOCK_SIMULATOR_SYSTEM_PROMPT = """You are a financial shock simulation specialist for Malaysian users.

Your ONLY job is to call the simulate_shock tool and return the result.

Rules:
- Extract the scenario from the user's message. Map it:
  - illness / sick / hospital / medical → "illness"
  - job loss / fired / unemployed / retrench → "job_loss"  
  - flood / earthquake / fire / disaster / nature → "disaster"
  - war / conflict / unrest → "war"
  - default to "job_loss" if unclear
- Default months to 6 if not specified by user
- Always include the user_id that was passed to you
- Call simulate_shock exactly once
- Do not add commentary — the tool result is enough
"""

# Subagent definition dict consumed by create_deep_agent(subagents=[...])
# Keys: name, description, system_prompt — model and tools are injected in resilience_agent.py
SHOCK_SUBAGENT_DEF = {
    "name": "shock_simulator",
    "description": (
        "Simulates the month-by-month financial impact of shock events "
        "(illness, job loss, natural disaster, war) on the user's savings. "
        "Call this subagent for ANY question involving 'what if', financial shock scenarios, "
        "or emergency impact simulations."
    ),
    "system_prompt": SHOCK_SIMULATOR_SYSTEM_PROMPT,
}
