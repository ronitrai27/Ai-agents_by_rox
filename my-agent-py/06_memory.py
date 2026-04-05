# ============================================================
# LESSON 6: MEMORY
# Agents forget everything between calls.
# Memory = carrying conversation history across turns.
# ============================================================
from dotenv import load_dotenv
from langchain.chat_models import init_chat_model
from langchain_core.tools import tool
from langchain_core.messages import HumanMessage, SystemMessage
from langgraph.prebuilt import create_react_agent   # ← was here before v1
from langgraph.checkpoint.memory import MemorySaver

load_dotenv()

model = init_chat_model("gpt-4.1-nano", temperature=0)

@tool
def get_project(name: str) -> dict:
    """Get details about a project by name."""
    return {"name": name, "status": "active", "sprint": "Sprint 8", "team_size": 4}

@tool
def add_note(project: str, note: str) -> str:
    """Add a note to a project."""
    return f"Note added to {project}: '{note}'"

tools = [get_project, add_note]

# ── Without memory (stateless) ───────────────────────────────
# stateless_agent = create_react_agent(model, tools)

# r1 = stateless_agent.invoke({"messages": [HumanMessage("My project is called Phoenix.")]})
# r2 = stateless_agent.invoke({"messages": [HumanMessage("What project are we talking about?")]})

# print("Stateless — turn 2:")
# print(r2["messages"][-1].content)
# "I don't have information about any specific project..."  ← forgets!


# ---------------------------------------
# ── With memory (stateful) ───────────────────────────────────
# MemorySaver = in-memory checkpointer (use Postgres in production)
# thread_id = a unique ID per conversation session
memory = MemorySaver()
agent = create_react_agent(model, tools, checkpointer=memory)

# Same thread_id = same conversation = shared memory
config = {"configurable": {"thread_id": "rahul-session-1"}}

# Turn 1
agent.invoke(
    {"messages": [HumanMessage("My project is called Phoenix.")]},
    config=config,
)

# Turn 2 — agent remembers!
r = agent.invoke(
    {"messages": [HumanMessage("What do you know about my project?")]},
    config=config,
)
print("\nWith memory — turn 2:")
print(r["messages"][-1].content)
# "Your project is called Phoenix..." ← remembers!

# Turn 3 — continues naturally
r = agent.invoke(
    {"messages": [HumanMessage("Get its details and add a note: 'sprint review Friday 3pm'")]},
    config=config,
)
print("\nTurn 3:")
print(r["messages"][-1].content)


# KEY INSIGHT: MemorySaver is thread-scoped (short-term memory).
# This is Phase 1 memory — conversation history within a session.
# In Phase 2 (LangGraph), you get cross-session long-term memory
# via the Store API. That's where agents get truly persistent.