# ============================================================
# 🎫 TICKET & ISSUE RESOLVER AGENT  — FIXED VERSION
# LangGraph hand-built ReAct loop + streaming + HITL interrupt
# ============================================================
# What's corrected vs previous version:
#   ✅ Hand-built ReAct graph (model → tools → model loop) — not create_agent
#   ✅ stream_mode=["updates","messages"] — streams tokens + tool calls live
#   ✅ interrupt() inside tools — HITL approval gate
#   ✅ Command(resume=...) resumes the graph after human decides
#   ✅ Clean console output: 💭 thinking tokens | 🔧 tool call | ✅ result
# ============================================================

import json
import uuid
from datetime import datetime
from dotenv import load_dotenv

from langchain.chat_models import init_chat_model
from langchain_core.tools import tool
from langchain_core.messages import (
    HumanMessage, AIMessage, AIMessageChunk,
    SystemMessage, ToolMessage
)
from langgraph.graph import StateGraph, MessagesState, START, END
from langgraph.checkpoint.memory import MemorySaver
from langgraph.types import interrupt, Command

load_dotenv()

# ────────────────────────────────────────────────────────────
# 🗃️  MOCK DATABASE
# ────────────────────────────────────────────────────────────

TICKETS_DB: dict = {}
MEETINGS_DB: dict = {}

# ────────────────────────────────────────────────────────────
# 🔧 TOOLS  — interrupt() lives INSIDE the ones that write data
# ────────────────────────────────────────────────────────────

@tool
def get_ticket(ticket_id: str) -> str:
    """Retrieve an existing ticket by ID (e.g. TKT-A1B2C3)."""
    ticket = TICKETS_DB.get(ticket_id)
    if not ticket:
        return json.dumps({"error": f"Ticket {ticket_id} not found."})
    return json.dumps(ticket, indent=2)


@tool
def create_ticket(title: str, description: str, priority: str = "medium") -> str:
    """
    Create a support ticket to track the user's issue.
    priority: 'low' | 'medium' | 'high' | 'critical'
    Only call this after fully understanding the issue.
    """
    # ── INTERRUPT — graph pauses here, state saved to checkpointer ──
    # Human sees the proposed ticket, can approve / reject / edit fields.
    # The dict we pass becomes interrupt_data in the REPL.
    # Whatever Command(resume=...) sends back becomes `decision` here.
    decision = interrupt({
        "action":  "create_ticket",
        "message": "Ready to create this ticket — approve?",
        "details": {
            "title":       title,
            "description": description,
            "priority":    priority,
        },
    })

    if not decision.get("approved", False):
        return json.dumps({"status": "cancelled", "reason": "Rejected by user."})

    # ── Side effects ONLY after interrupt returns with approval ──
    # Safe to write here: interrupt already fired, won't duplicate.
    ticket_id = f"TKT-{uuid.uuid4().hex[:6].upper()}"
    ticket = {
        "id":          ticket_id,
        "title":       decision.get("title",       title),
        "description": decision.get("description", description),
        "priority":    decision.get("priority",    priority),
        "status":      "open",
        "created_at":  datetime.now().strftime("%Y-%m-%d %H:%M"),
    }
    TICKETS_DB[ticket_id] = ticket
    return json.dumps({"status": "created", "ticket": ticket}, indent=2)


@tool
def book_meet(topic: str, preferred_date: str, user_name: str, user_email: str) -> str:
    """
    Book a meeting with a human support engineer.
    preferred_date: e.g. '2025-04-15 14:00'
    Only use when the issue genuinely needs human expert involvement.
    Collect user's name and email before calling.
    """
    decision = interrupt({
        "action":  "book_meet",
        "message": "Ready to book this meeting — approve?",
        "details": {
            "topic":  topic,
            "date":   preferred_date,
            "name":   user_name,
            "email":  user_email,
        },
    })

    if not decision.get("approved", False):
        return json.dumps({"status": "cancelled", "reason": "Rejected by user."})

    meet_id = f"MEET-{uuid.uuid4().hex[:6].upper()}"
    meeting = {
        "id":            meet_id,
        "topic":         decision.get("topic",  topic),
        "date":          decision.get("date",   preferred_date),
        "name":          decision.get("name",   user_name),
        "email":         decision.get("email",  user_email),
        "status":        "confirmed",
        "calendar_link": f"https://cal.example.com/{meet_id}",
    }
    MEETINGS_DB[meet_id] = meeting
    return json.dumps({"status": "booked", "meeting": meeting}, indent=2)


TOOLS   = [get_ticket, create_ticket, book_meet]
TOOLMAP = {t.name: t for t in TOOLS}

# ────────────────────────────────────────────────────────────
# 🤖 MODEL
# ────────────────────────────────────────────────────────────

model = init_chat_model("gpt-4.1-nano", temperature=0).bind_tools(TOOLS)

SYSTEM = """You are a friendly, efficient support agent.

How to work:
1. Understand the issue through conversation first — ask 1-2 clarifying questions.
2. Try to resolve it yourself with advice.
3. If the issue needs tracking → create_ticket (after fully understanding it).
4. If the user needs a human expert → collect their name + email, then book_meet.
5. Use get_ticket when a user gives you a ticket ID.

Be warm, concise, conversational. Never jump straight to creating tickets."""

# ────────────────────────────────────────────────────────────
# 📐 LANGGRAPH — hand-built ReAct graph
# model → should_continue → tools → model (loop) → END
# ────────────────────────────────────────────────────────────

def call_model(state: MessagesState) -> dict:
    """LLM node — reads all messages, returns AI response."""
    messages = [SystemMessage(SYSTEM)] + state["messages"]
    response = model.invoke(messages)
    return {"messages": [response]}


def call_tools(state: MessagesState) -> dict:
    """Tool execution node — runs every tool_call in the last AIMessage."""
    last    = state["messages"][-1]
    results = []
    for tc in last.tool_calls:
        fn  = TOOLMAP[tc["name"]]
        out = fn.invoke(tc["args"])   # interrupt() fires inside fn if it has one
        results.append(ToolMessage(
            content=str(out),
            tool_call_id=tc["id"],
            name=tc["name"],
        ))
    return {"messages": results}


def should_continue(state: MessagesState) -> str:
    """Routing function — called after every model run."""
    last = state["messages"][-1]
    if isinstance(last, AIMessage) and last.tool_calls:
        return "tools"
    return END


builder = StateGraph(MessagesState)
builder.add_node("model", call_model)
builder.add_node("tools", call_tools)
builder.add_edge(START, "model")
builder.add_conditional_edges("model", should_continue, {"tools": "tools", END: END})
builder.add_edge("tools", "model")   # ← the ReAct loop: tools always go back to model

memory = MemorySaver()               # required — interrupt() needs checkpointing
graph  = builder.compile(checkpointer=memory)

# ────────────────────────────────────────────────────────────
# 🎬 STREAMING DISPLAY
# stream_mode=["updates","messages"]:
#   "updates"  → full node results (tool_calls, tool results, final answer)
#   "messages" → token-by-token from LLM (for live streaming answer)
# ────────────────────────────────────────────────────────────

BAR = "─" * 60

def show_chunk(chunk: tuple) -> None:
    """
    Handle one streamed chunk from graph.stream().
    chunk is a (mode, data) tuple when using multiple stream_modes.
    """
    mode, data = chunk

    # ── UPDATES mode: full node completions ─────────────────
    if mode == "updates":

        if "__interrupt__" in data:
            # Don't print anything — the REPL loop handles this
            return

        if "model" in data:
            msg = data["model"]["messages"][-1]
            # Show tool call decisions (what the agent chose to call)
            if hasattr(msg, "tool_calls") and msg.tool_calls:
                for tc in msg.tool_calls:
                    args_str = json.dumps(tc["args"])
                    print(f"\n  🔧  Calling → {tc['name']}")
                    print(f"      args: {args_str}")
            # Final answer text is already streamed token-by-token via "messages" mode
            # so we don't print it again here

        if "tools" in data:
            for tm in data["tools"]["messages"]:
                _display_tool_result(tm)

    # ── MESSAGES mode: token-by-token LLM stream ────────────
    elif mode == "messages":
        token, metadata = data
        if not isinstance(token, AIMessageChunk):
            return
        # Only stream text tokens for the model node (not tool nodes)
        if metadata.get("langgraph_node") == "model" and token.content:
            # Check it's actual text, not a tool_call chunk
            if isinstance(token.content, str):
                print(token.content, end="", flush=True)
            elif isinstance(token.content, list):
                for block in token.content:
                    if isinstance(block, dict) and block.get("type") == "text":
                        print(block.get("text", ""), end="", flush=True)


def _display_tool_result(tm: ToolMessage) -> None:
    """Pretty-print a tool result."""
    try:
        data   = json.loads(tm.content)
        status = data.get("status", "")

        if status == "cancelled":
            print(f"\n  ✗   [{tm.name}] cancelled — {data.get('reason','')}")

        elif status == "created":
            t = data["ticket"]
            print(f"\n  ✓   Ticket created → {t['id']} "
                  f"| {t['priority'].upper()} | {t['title']}")

        elif status == "booked":
            m = data["meeting"]
            print(f"\n  ✓   Meeting booked → {m['id']} on {m['date']}")
            print(f"      Confirmation link: {m['calendar_link']}")

        elif "error" in data:
            print(f"\n  ✗   [{tm.name}] {data['error']}")

        else:
            # get_ticket or other plain results
            print(f"\n  ✅  [{tm.name}] →")
            print(f"      {tm.content[:200]}")

    except Exception:
        print(f"\n  ✅  [{tm.name}] → {tm.content[:150]}")


# ────────────────────────────────────────────────────────────
# ⚠️  INTERRUPT HANDLER
# Shows the proposed action, collects approve / reject / edit
# ────────────────────────────────────────────────────────────

def handle_interrupt(payload: dict) -> dict:
    """
    Called by the REPL when graph.stream() yields an __interrupt__ chunk.
    Returns the dict that becomes interrupt()'s return value inside the tool.
    Supports:
      y / yes      → approve with original details
      n / no       → reject
      field=value  → edit a field, then loop for confirmation
    """
    action  = payload.get("action", "action")
    message = payload.get("message", "Confirm?")
    details = dict(payload.get("details", {}))   # mutable copy

    print(f"\n  {'─'*56}")
    print(f"  ⚠️   APPROVAL NEEDED — {action.replace('_',' ').upper()}")
    print(f"  {message}")
    print(f"  {'─'*56}")
    for k, v in details.items():
        print(f"    {k:<16} {v}")
    print(f"  {'─'*56}")
    print("  Commands: [y] approve   [n] reject   [field=value] edit field")

    while True:
        raw = input("  Decision ▸ ").strip()

        if raw.lower() in ("y", "yes", ""):
            print("  ✓  Approved.\n")
            return {"approved": True, **details}

        elif raw.lower() in ("n", "no"):
            print("  ✗  Rejected.\n")
            return {"approved": False}

        elif "=" in raw:
            field, _, value = raw.partition("=")
            field = field.strip()
            value = value.strip()
            if field in details:
                details[field] = value
                print(f"  ✎  {field} updated → '{value}'")
                for k, v in details.items():
                    print(f"    {k:<16} {v}")
            else:
                print(f"  Unknown field. Valid fields: {list(details.keys())}")
        else:
            print("  Type y, n, or field=value")


# ────────────────────────────────────────────────────────────
# 🔁 CORE TURN RUNNER
# The while True loop is the HITL engine:
#   stream → hit interrupt → collect decision → resume → stream again
# ────────────────────────────────────────────────────────────

def run_turn(user_input: str, config: dict) -> None:
    print(f"\n{BAR}")
    print(f"  You: {user_input}")
    print(BAR)

    # First iteration uses the user message.
    # After an interrupt, this becomes Command(resume=decision).
    current_input = {"messages": [HumanMessage(user_input)]}

    while True:
        interrupted    = False
        interrupt_data = None
        answer_started = False

        for chunk in graph.stream(
            current_input,
            config,
            stream_mode=["updates", "messages"],  # both modes simultaneously
        ):
            mode, data = chunk

            # Detect interrupt in updates stream
            if mode == "updates" and "__interrupt__" in data:
                interrupted    = True
                interrupt_data = data["__interrupt__"][0].value
                continue

            # Print a newline before the first answer token
            if mode == "messages":
                token, meta = data
                if (isinstance(token, AIMessageChunk)
                        and meta.get("langgraph_node") == "model"
                        and token.content
                        and not answer_started):
                    # Check it's a text token, not a tool call chunk
                    is_text = (
                        isinstance(token.content, str) or
                        (isinstance(token.content, list) and
                         any(b.get("type") == "text" for b in token.content
                             if isinstance(b, dict)))
                    )
                    if is_text:
                        print(f"\n  🤖  ", end="")
                        answer_started = True

            show_chunk(chunk)

        if answer_started:
            print()   # newline after streamed answer

        if not interrupted:
            break     # graph reached END cleanly

        # ── Graph paused at interrupt() — ask human now ──────
        decision      = handle_interrupt(interrupt_data)
        current_input = Command(resume=decision)
        answer_started = False
        # Loop back → graph resumes from checkpoint, tool sees decision

    print()


# ────────────────────────────────────────────────────────────
# 💬 CLI REPL
# ────────────────────────────────────────────────────────────

def main():
    print("\n" + "═" * 60)
    print("  🎫  SUPPORT AGENT — LangGraph ReAct + HITL Interrupts")
    print("═" * 60)
    print("  Describe your issue. The agent will try to help,")
    print("  and ask for your approval before taking any action.")
    print("  Type 'exit' to quit.\n")
    print("  Suggested openers:")
    print("    → My payments keep failing after the last update")
    print("    → Can you check ticket TKT-ABC123?")
    print("    → I need to speak to a billing expert\n")

    # thread_id scopes MemorySaver — same ID = full conversation memory
    config = {"configurable": {"thread_id": f"support-{uuid.uuid4().hex[:8]}"}}

    while True:
        try:
            user_input = input("You ▸ ").strip()
        except (EOFError, KeyboardInterrupt):
            print("\n\n  Bye!")
            break

        if not user_input:
            continue
        if user_input.lower() in ("exit", "quit", "q"):
            print("\n  Bye!")
            break

        run_turn(user_input, config)


if __name__ == "__main__":
    main()