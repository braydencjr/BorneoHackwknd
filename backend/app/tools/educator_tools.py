"""
Interactive Educator canvas tools.
Called exclusively by the interactive_educator subagent.

Also exposes `request_lesson_approval` — used by the MAIN agent to gate
educator delegation behind human approval (HITL via LangGraph interrupt).
"""
import json
from langchain.tools import tool
from langgraph.types import interrupt


@tool
def request_lesson_approval(topic: str) -> str:
    """
    Pause execution and ask the user whether they want to open an interactive
    lesson on this topic.  ALWAYS call this tool BEFORE delegating to the
    interactive_educator subagent — never delegate without approval first.

    Returns a plain-text verdict that the main agent must obey:
      • "APPROVED" — proceed to delegate to interactive_educator via task tool.
      • "REJECTED" — answer the user's question yourself in 3-5 sentences;
                      do NOT call the task tool or the educator at all.
    """
    decision: dict = interrupt({  # type: ignore[assignment]
        "type": "lesson_approval",
        "topic": topic,
        "message": f"The AI wants to open an interactive lesson on **{topic}**. Approve?",
    })
    if decision.get("approved"):
        return f"APPROVED. Proceed with the interactive lesson on '{topic}'."
    reason = decision.get("reason", "User chose to skip the lesson")
    return (
        f"REJECTED. Do NOT delegate to interactive_educator. "
        f"Answer the user's question about '{topic}' directly yourself in "
        f"3-5 sentences. Reason: {reason}"
    )


@tool
async def generate_canvas(title: str, html: str) -> str:
    """
    Publish a polished interactive HTML canvas (slide deck / micro-lesson)
    to the user's chat interface. The canvas opens as a full-screen modal.

    title: Short display title shown on the canvas card thumbnail in chat.
           e.g. "Emergency Fund 101" or "Your Job-Loss Survival Plan"

    html:  A COMPLETE, self-contained HTML document string.
           REQUIREMENTS:
           - Must start with <!DOCTYPE html> and be a full <html>...</html> doc
           - All CSS must be in a <style> block inside <head>
           - All JavaScript must be in a <script> block before </body>
           - Google Fonts @import inside <style> is allowed (needs internet)
           - No other external CDN scripts or fetch() calls
           - Mobile-responsive: viewport <meta> tag required
           - 4–7 swipeable slides with bottom navigation
           - Must have passed validate_html() with "OK" before calling this
    """
    data = {
        "card": "canvas",
        "title": title,
        "html": html,
    }
    return json.dumps(data)
