# graph.py — Multi-Agent Research System
#
# Architecture (mirrors Anthropic's research agent diagram):
#   supervisor (LeadResearcher) ──► assign_tool (conditional edge using Send)
#       │
#       ├─► researcher_a node  → ReAct subagent (Tavily web + Scholar search)
#       ├─► researcher_b node  → ReAct subagent (Tavily web + Patents/News search)
#       └─► citation_agent     → post-processing node (no LLM loop, pure formatting)
#
# HITL fires after supervisor decides research is complete:
#   supervisor calls `create_document` tool → interrupt() pauses graph
#   user reviews report preview → approves → .docx is written to disk
#
# State carries:
#   messages      — full conversation (MessagesState default)
#   research_plan — supervisor's initial plan (string)
#   findings      — accumulated findings from subagents (list of dicts)
#   final_report  — synthesized markdown report (string)
#   iterations    — how many research loops have run (int, cap at MAX_ITERATIONS)
import os
import json
import operator
import time
from typing import Annotated

from langchain_core.messages import HumanMessage, ToolMessage, SystemMessage, AIMessage
from langchain_core.tools import tool
from langchain_openai import ChatOpenAI
from langgraph.graph import StateGraph, MessagesState, START, END
from langgraph.prebuilt import create_react_agent
from langgraph.types import interrupt, Send
from langgraph.config import get_stream_writer
from langgraph.checkpoint.memory import InMemorySaver
from tavily import TavilyClient
import serpapi
from mem0 import MemoryClient
from dotenv import load_dotenv

load_dotenv()

_tavily = TavilyClient(api_key=os.environ["TAVILY_API_KEY"])
_serp_client = serpapi.Client(api_key=os.environ["SERPAPI_API_KEY"])
_mem0 = MemoryClient()  # uses MEM0_API_KEY from env

print(f"[init] Tavily client ready")
print(f"[init] SerpAPI client ready: {os.environ['SERPAPI_API_KEY'][:8]}...")
print(f"[init] Mem0 client ready")

MAX_ITERATIONS = 3

# ─────────────────────────────────────────────────────────────────────────────
# 1.  STATE
# ─────────────────────────────────────────────────────────────────────────────


# class ResearchState(MessagesState):
#     research_plan: str
#     findings: list  # This causes the error!
#     final_report: str
#     iterations: int
class ResearchState(MessagesState):
    research_plan: str  # supervisor's breakdown of the query
    findings: Annotated[list, operator.add]  # [{agent, query, summary, sources: []}]
    active_statuses: Annotated[dict, operator.ior]  # { agent_id: status_dict }
    hitl_data: dict  # Backup of the last interrupt payload for persistent UI
    final_report: str  # markdown report after synthesis
    iterations: Annotated[int, operator.add]  # loop counter
    user_id: str


# ─────────────────────────────────────────────────────────────────────────────
# 2.  REAL TOOLS
# ─────────────────────────────────────────────────────────────────────────────


@tool
def tavily_web_search(query: str, max_results: int = 5) -> dict:
    """Search the web using Tavily for current information, articles, and general knowledge.
    Returns a list of results with title, url, and content snippet."""
    print(f"[tavily_web_search] ▶ CALLED — query={query}")
    try:
        response = _tavily.search(
            query=query,
            max_results=max_results,
            search_depth="advanced",
            include_raw_content=False,
        )
        results = [
            {
                "title": r.get("title", ""),
                "url": r.get("url", ""),
                "snippet": r.get("content", "")[:500],
                "score": r.get("score", 0),
            }
            for r in response.get("results", [])
        ]
        print(f"[tavily_web_search] ✓ DONE — {len(results)} results")
        return {"query": query, "results": results}
    except Exception as e:
        print(f"[tavily_web_search] ✗ ERROR: {e}")
        return {"query": query, "results": [], "error": str(e)}


@tool
def tavily_extract(url: str) -> dict:
    """Extract full content from a specific URL using Tavily.
    Use this to get the complete text of a promising article or source."""
    print(f"[tavily_extract] ▶ CALLED — url={url}")
    try:
        response = _tavily.extract(urls=[url])
        result = response.get("results", [{}])[0]
        content = result.get("raw_content", "")[:3000]
        print(f"[tavily_extract] ✓ DONE — {len(content)} chars")
        return {"url": url, "content": content}
    except Exception as e:
        print(f"[tavily_extract] ✗ ERROR: {e}")
        return {"url": url, "content": "", "error": str(e)}


@tool
def serp_scholar_search(query: str) -> dict:
    """Search Google Scholar for academic papers and peer-reviewed research.
    Use for finding scientific studies, citations, and authoritative academic sources.
    """
    print(f"[serp_scholar_search] ▶ CALLED — query={query}")
    data = _serp_client.search(
        {
            "engine": "google_scholar",
            "q": query,
            "num": 5,
        }
    )
    results = [
        {
            "title": r.get("title", ""),
            "link": r.get("link", ""),
            "snippet": r.get("snippet", ""),
            "year": r.get("publication_info", {}).get("summary", ""),
        }
        for r in data.get("organic_results", [])
    ]
    print(f"[serp_scholar_search] ✓ DONE — {len(results)} results")
    return {"query": query, "results": results}


@tool
def serp_patent_search(query: str) -> dict:
    """Search Google Patents for patents related to the research topic.
    Use when researching technology, inventions, or IP landscape.

    IMPORTANT: query must be short, technical keywords only (3-6 words).
    Good: "propulsion electromagnetic field control"
    Bad: "patents related to alien technology or UFOs"""
    print(f"[serp_patent_search] ▶ CALLED — query={query}")
    try:
        data = _serp_client.search(
            {
                "engine": "google_patents",
                "q": query,
                "num": 5,
            }
        )
        results = [
            {
                "title": r.get("title", ""),
                "patent_id": r.get("patent_id", ""),
                "link": r.get("pdf", ""),
                "assignee": r.get("assignee", ""),
                "filing_date": r.get("filing_date", ""),
                "snippet": r.get("snippet", ""),
            }
            for r in data.get("organic_results", [])
        ]
        print(f"[serp_patent_search] ✓ DONE — {len(results)} results")
        return {"query": query, "results": results}
    except Exception as e:
        print(f"[serp_patent_search] ✗ ERROR: {e}")
        return {"query": query, "results": [], "error": str(e)}


@tool
def serp_news_search(query: str) -> dict:
    """Search Google News for recent news articles and current events.
    Use for fact-checking, recency verification, or breaking developments."""
    print(f"[serp_news_search] ▶ CALLED — query={query}")
    data = _serp_client.search(
        {
            "engine": "google",
            "tbm": "nws",
            "q": query,
            "num": 5,
        }
    )
    results = [
        {
            "title": r.get("title", ""),
            "link": r.get("link", ""),
            "source": r.get("source", ""),
            "date": r.get("date", ""),
            "snippet": r.get("snippet", ""),
        }
        for r in data.get("news_results", [])
    ]
    print(f"[serp_news_search] ✓ DONE — {len(results)} results")
    return {"query": query, "results": results}


# ─────────────────────────────────────────────────────────────────────────────
# 3.  SUPERVISOR ROUTING TOOLS  (descriptors only — intercepted by assign_tool)
# ─────────────────────────────────────────────────────────────────────────────


@tool
def ask_researcher_a(query: str, aspect: str) -> str:
    """Delegate to Researcher A — web + academic search specialist.
    Use for: general web research, academic papers, scholarly sources, background info.
    aspect: short label for what this researcher is covering (e.g. 'market landscape')
    """
    return f"{query}||{aspect}"  # intercepted by assign_tool


@tool
def ask_researcher_b(query: str, aspect: str) -> str:
    """Delegate to Researcher B — patents + news + verification specialist.
    Use for: patent landscape, recent news, fact verification, current developments.
    aspect: short label for what this researcher is covering (e.g. 'patent landscape')
    """
    return f"{query}||{aspect}"  # intercepted by assign_tool


@tool
def create_document(
    report_markdown: str,
    filename: str,
    summary: str,
) -> str:
    """HITL tool — creates the final research report as a downloadable .docx file.
    Call this ONLY when research is fully complete and synthesized.
    report_markdown: the complete formatted report in markdown
    filename: desired filename without extension (e.g. 'ai_research_report')
    summary: 2-3 sentence summary shown to user for approval before doc is created"""
    return f"{filename}||{summary}||{report_markdown}"  # intercepted by assign_tool


# ─────────────────────────────────────────────────────────────────────────────
# 4.  LLM MODELS
# ─────────────────────────────────────────────────────────────────────────────

# Supervisor uses a more powerful model — it plans, synthesizes, decides
_supervisor_llm = ChatOpenAI(
    model=os.getenv("SUPERVISOR_MODEL", "gpt-4.1-mini"),
    temperature=0.2,
    streaming=True,
)

# Subagents use a faster/cheaper model — they just search and summarize
_subagent_llm = ChatOpenAI(
    model=os.getenv("SUBAGENT_MODEL", "gpt-4.1-nano"),
    temperature=0,
    streaming=True,
)


# ─────────────────────────────────────────────────────────────────────────────
# 5.  REACT SUBAGENTS
# ─────────────────────────────────────────────────────────────────────────────

researcher_a_subagent = create_react_agent(
    model=_subagent_llm,
    tools=[tavily_web_search, tavily_extract, serp_scholar_search],
    name="researcher_a",
    prompt=(
        "You are Researcher A, a web and academic research specialist. "
        "Your job is to thoroughly research the given query using web search and academic sources. "
        "Steps: 1) Run web searches with different angles. 2) Extract full content from the most "
        "promising URLs. 3) Search Google Scholar for peer-reviewed backing. "
        "Return a structured summary with: key findings, important facts/stats, "
        "and a list of all sources used (title + url). Be thorough but concise."
    ),
)

researcher_b_subagent = create_react_agent(
    model=_subagent_llm,
    tools=[tavily_web_search, serp_patent_search, serp_news_search],
    name="researcher_b",
    prompt=(
        "You are Researcher B, a patents, news, and verification specialist. "
        "Your job is to research recent developments, verify claims, and explore the IP landscape. "
        "Steps: 1) Search recent news to find current state. 2) Search patents if technology is involved. "
        "3) Use web search to cross-check or verify important claims. "
        "Return a structured summary with: recent developments, any patents found, "
        "verified/disputed claims, and all sources used (title + url)."
    ),
)


# ─────────────────────────────────────────────────────────────────────────────
# 6.  SUPERVISOR NODE
# ─────────────────────────────────────────────────────────────────────────────

SUPERVISOR_SYSTEM = """You are the Lead Researcher — a world-class research director who plans, delegates, synthesizes, and decides.
 
 Your research workflow:
 1. PLAN: On first message, think through the research topic. Break it into 2 aspects to investigate in parallel.
 2. DELEGATE: Use ask_researcher_a (web + academic) and ask_researcher_b (patents + news) simultaneously. Give each a specific aspect to investigate with a clear query.
 3. SYNTHESIZE: When both researchers report back, evaluate the findings. Decide: is the research sufficient, or do you need another round?
 4. LOOP (max {max_iter} times): If more depth is needed, delegate again with refined queries targeting gaps.
 5. FINALIZE: When research is complete, synthesize ALL findings and call create_document with the full report.
 
 Rules:
 - Do NOT print the final report in your message content. Only call create_document with the report.
 - In your message content, only provide a brief status update (e.g., "Research phase complete. Synthesizing final report...")
 - Always delegate to BOTH researchers in parallel when starting or continuing research.
 - Your final report should be well-structured with sections: Executive Summary, Key Findings, Detailed Analysis, Sources.
 - Think step by step before deciding whether to continue or finalize.
 """.format(
    max_iter=MAX_ITERATIONS
)


def supervisor(state: ResearchState) -> dict:
    print(
        f"[supervisor] messages={len(state['messages'])}, iterations={state.get('iterations', 0)}"
    )

    messages_list = state["messages"]

    # ── GUARD: passthrough after HITL ──
    for msg in reversed(messages_list):
        if hasattr(msg, "name") and msg.name == "create_document":
            print("[supervisor] Resuming after HITL — passing through silently")
            return {"messages": [AIMessage(content=msg.content)]}

    # ── mem0 persistent memory would be injected here ──
    # Skipped for now: user is anonymous (no auth), so no user_id to scope memories.
    # When auth is added: fetch memories via _mem0.search(query, user_id=user_id)
    # and append as memory_block to SUPERVISOR_SYSTEM prompt.

    messages = [SystemMessage(content=SUPERVISOR_SYSTEM)] + messages_list

    llm_with_tools = _supervisor_llm.bind_tools(
        [ask_researcher_a, ask_researcher_b, create_document]
    )
    response = llm_with_tools.invoke(messages)

    if any(
        tc["name"] == "create_document" for tc in getattr(response, "tool_calls", [])
    ):
        print("[supervisor] create_document detected — silencing message content")
        response.content = "Research phase complete. Finalizing report for approval..."

    print(
        f"--- SUPERVISOR: DECISION MADE ({len(response.tool_calls or [])} tool(s) assigned) ---"
    )
    return {"messages": [response]}


# ─────────────────────────────────────────────────────────────────────────────
# 7.  ROUTING EDGE
# ─────────────────────────────────────────────────────────────────────────────


def assign_tool(state: ResearchState):
    """
    Reads the supervisor's last message.
    Routes each tool_call to the correct node via Send.
    If no tool_calls → supervisor is done → END.
    """
    last_message = state["messages"][-1]
    if not getattr(last_message, "tool_calls", None):
        print("[assign_tool] No tool calls → END")
        return END

    sends = []
    for tool_call in last_message.tool_calls:
        name = tool_call["name"]
        print(f"[assign_tool] routing tool_call={name}")
        match name:
            case "ask_researcher_a":
                sends.append(Send("researcher_a", tool_call))
            case "ask_researcher_b":
                sends.append(Send("researcher_b", tool_call))
            case "create_document":
                # ✅ Inject findings from state so hitl_document can use them
                enriched = dict(tool_call)
                enriched["_findings"] = state.get("findings", [])
                print(
                    f"[assign_tool] injecting {len(enriched['_findings'])} findings into hitl_document"
                )
                sends.append(Send("hitl_document", enriched))

    return sends if sends else END


# ─────────────────────────────────────────────────────────────────────────────
# 8.  SUBAGENT NODES
# ─────────────────────────────────────────────────────────────────────────────


async def researcher_a(tool_call: dict) -> dict:
    """Runs Researcher A ReAct subagent and returns findings as ToolMessage."""
    writer = get_stream_writer()
    args = tool_call["args"]
    query = args.get("query", "")
    aspect = args.get("aspect", "general research")
    print(f">>> RESEARCHER_A: STARTING [{aspect}]   query={query}")

    writer(
        {
            "active_statuses": {
                "researcher_a": {
                    "agent": "researcher_a",
                    "status": f"Phase: Researching {aspect}",
                    "query": query,
                    "start_time": time.time(),
                }
            }
        }
    )

    result = await researcher_a_subagent.ainvoke(
        {
            "messages": [
                HumanMessage(
                    content=f"Research this thoroughly: {query}\nAspect focus: {aspect}"
                )
            ]
        }
    )
    final_answer = result["messages"][-1].content
    writer(
        {
            "active_statuses": {
                "researcher_a": {
                    "agent": "researcher_a",
                    "status": f"Complete: {aspect}",
                    "is_done": True,
                }
            }
        }
    )

    print(f"<<< RESEARCHER_A: COMPLETED")

    return {
        "messages": [
            ToolMessage(
                content=final_answer,
                tool_call_id=tool_call["id"],
                name="ask_researcher_a",
            )
        ],
        "findings": [
            {
                "agent": "researcher_a",
                "aspect": aspect,
                "query": query,
                "summary": final_answer,
            }
        ],
        "iterations": 1,  # will be added via reducer
    }


async def researcher_b(tool_call: dict) -> dict:
    """Runs Researcher B ReAct subagent and returns findings as ToolMessage."""
    writer = get_stream_writer()
    args = tool_call["args"]
    query = args.get("query", "")
    aspect = args.get("aspect", "verification and patents")
    print(f">>> RESEARCHER_B: STARTING [{aspect}]")

    writer(
        {
            "active_statuses": {
                "researcher_b": {
                    "agent": "researcher_b",
                    "status": f"Phase: Investigating {aspect}",
                    "query": query,
                    "start_time": time.time(),
                }
            }
        }
    )

    result = await researcher_b_subagent.ainvoke(
        {
            "messages": [
                HumanMessage(
                    content=f"Research this thoroughly: {query}\nAspect focus: {aspect}"
                )
            ]
        }
    )
    final_answer = result["messages"][-1].content
    writer(
        {
            "active_statuses": {
                "researcher_b": {
                    "agent": "researcher_b",
                    "status": f"Complete: {aspect}",
                    "is_done": True,
                }
            }
        }
    )

    print(f"<<< RESEARCHER_B: COMPLETED")

    return {
        "messages": [
            ToolMessage(
                content=final_answer,
                tool_call_id=tool_call["id"],
                name="ask_researcher_b",
            )
        ],
        "findings": [
            {
                "agent": "researcher_b",
                "aspect": aspect,
                "query": query,
                "summary": final_answer,
            }
        ],
    }


# ─────────────────────────────────────────────────────────────────────────────
# 9.  CITATION AGENT NODE  (post-processing, not a ReAct loop)
#     Runs after HITL approval, before doc creation.
#     Scans the report and inserts inline citations [1], [2]...
# ─────────────────────────────────────────────────────────────────────────────


async def citation_agent(report_markdown: str, findings: list) -> str:
    """
    Takes the synthesized report and all findings (which contain source URLs),
    asks the LLM to insert inline citations, returns the cited report.
    Not a ReAct agent — single LLM call, pure post-processing.
    """
    print(
        f"[citation_agent] Processing report len={len(report_markdown)}, findings={len(findings)}"
    )

    # Collect all sources from all findings
    all_sources = []
    for finding in findings:
        summary = finding.get("summary", "")
        # Extract URLs from summaries (simple heuristic — supervisor's report will have them)
        import re

        urls = re.findall(r"https?://[^\s\)\"\']+", summary)
        for url in urls:
            if url not in [s["url"] for s in all_sources]:
                all_sources.append({"url": url, "agent": finding.get("agent", "")})

    sources_text = "\n".join([f"[{i+1}] {s['url']}" for i, s in enumerate(all_sources)])

    citation_prompt = f"""You are a Citation Agent. Your job is to insert inline citations into a research report.

SOURCES FOUND:
{sources_text}

REPORT TO CITE:
{report_markdown}

Instructions:
- Insert inline citations like [1], [2] etc. after claims that match a source URL
- Add a "## References" section at the end with all cited sources numbered
- Do not change any content — only add citation numbers and the references section
- Add Links if there at end of the report.
- If a claim cannot be matched to a source, leave it uncited
- Return only the updated report, no preamble

Return the complete report with citations inserted."""

    response = await _subagent_llm.ainvoke([HumanMessage(content=citation_prompt)])
    cited_report = response.content
    print(f"[citation_agent] Done. cited_report_len={len(cited_report)}")
    return cited_report


# ─────────────────────────────────────────────────────────────────────────────
# 10. HITL DOCUMENT NODE
#     Intercepts the supervisor's create_document call.
#     1. Runs citation agent on the report
#     2. Pauses for user approval (interrupt)
#     3. On approve → writes .docx via Node.js docx library
#     4. Returns ToolMessage with download path
# ─────────────────────────────────────────────────────────────────────────────


async def hitl_document(tool_call: dict) -> dict:
    """
    HITL node for document creation.
    Shows the user a preview + summary before committing to file creation.
    """
    writer = get_stream_writer()
    args = tool_call["args"]
    raw_report = args.get("report_markdown", "")
    filename = args.get("filename", "research_report").replace(" ", "_")
    summary = args.get("summary", "Research complete.")

    # ✅ Pull findings injected by assign_tool
    findings = tool_call.get("_findings", [])
    print(f"[hitl_document] Starting — filename={filename}, findings={len(findings)}")

    # ── STEP 1: Citation agent runs BEFORE interrupt ─────────────────────────
    writer(
        {
            "active_statuses": {
                "citation_agent": {
                    "agent": "citation_agent",
                    "status": "Adding citations and references...",
                    "start_time": time.time(),
                }
            }
        }
    )

    cited_report = await citation_agent(raw_report, findings)  # ✅ real findings!

    writer(
        {
            "active_statuses": {
                "citation_agent": {
                    "agent": "citation_agent",
                    "status": "Complete: Citations inserted.",
                    "is_done": True,
                }
            }
        }
    )

    print(f"[hitl_document] Citation done. Interrupting for HITL approval.")

    # ── STEP 2: Show user the CITED preview for approval ────────────────────
    hitl_payload = {
        "type": "document_approval",
        "message": "Research complete. Citations have been added. Review and approve to download.",
        "summary": summary,
        "filename": filename,
        "report_preview": (
            cited_report[:1000] + "..." if len(cited_report) > 1000 else cited_report
        ),
        "word_count": len(cited_report.split()),
        "citations_added": True,  # ✅ UI can show "citations ready" badge
    }

    writer({"hitl_data": hitl_payload})
    print(f"[hitl_document] Interrupt triggered. Waiting for approval...")

    # ── BREAKPOINT ───────────────────────────────────────────────────────────
    approval = interrupt(hitl_payload)
    # ── RESUME ───────────────────────────────────────────────────────────────

    print(f"[hitl_document] Resumed. Approval value: {approval}")

    # ── STEP 3: On approve → write docx with cited report ───────────────────
    if str(approval).lower() == "approve":
        # Signal to frontend: doc rendering has started
        writer(
            {
                "active_statuses": {
                    "doc_render": {
                        "agent": "doc_render",
                        "status": "rendering",  # ← your frontend watches this
                        "filename": filename,
                        "start_time": time.time(),
                    }
                }
            }
        )

        output_path = f"/tmp/{filename}.docx"
        success = await _write_docx(cited_report, filename, output_path)

        writer(
            {
                "active_statuses": {
                    "doc_render": {
                        "agent": "doc_render",
                        "status": "complete",
                        "filename": filename,
                        "path": output_path,
                        "is_done": True,
                    }
                }
            }
        )

        content = (
            (
                f"✅ Report ready: {filename}.docx\n"
                f"Path: {output_path}\n"
                f"Words: {len(cited_report.split())}"
            )
            if success
            else "⚠️ Approval received but docx creation failed."
        )
    else:
        content = "❌ Cancelled. Ask me to refine or recreate the report."

    return {
        "messages": [
            ToolMessage(
                content=content,
                tool_call_id=tool_call["id"],
                name="create_document",
            )
        ],
        "final_report": cited_report,
    }


async def _write_docx(report_markdown: str, filename: str, output_path: str) -> bool:
    """
    Converts the markdown report to a proper .docx using the docx npm library.
    Writes a Node.js script, executes it, returns success bool.
    """
    import subprocess
    import tempfile
    import re

    print(f"[_write_docx] Writing {output_path}")

    # Parse markdown into sections for structured docx
    lines = report_markdown.split("\n")
    js_children = []

    for line in lines:
        line_escaped = json.dumps(line)  # handles quotes, backslashes etc.
        if line.startswith("## "):
            title = json.dumps(line[3:])
            js_children.append(
                f"new Paragraph({{ heading: HeadingLevel.HEADING_2, children: [new TextRun({{ text: {title}, bold: true }})] }})"
            )
        elif line.startswith("# "):
            title = json.dumps(line[2:])
            js_children.append(
                f"new Paragraph({{ heading: HeadingLevel.HEADING_1, children: [new TextRun({{ text: {title}, bold: true }})] }})"
            )
        elif line.startswith("- ") or line.startswith("* "):
            text = json.dumps(line[2:])
            js_children.append(
                f'new Paragraph({{ numbering: {{ reference: "bullets", level: 0 }}, children: [new TextRun({text})] }})'
            )
        elif line.strip() == "":
            js_children.append('new Paragraph({ children: [new TextRun("")] })')
        else:
            # Check for bold **text**
            text = json.dumps(line)
            js_children.append(f"new Paragraph({{ children: [new TextRun({text})] }})")

    children_str = ",\n        ".join(js_children)

    js_script = f"""
const {{ Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, LevelFormat }} = require('docx');
const fs = require('fs');

const doc = new Document({{
  numbering: {{
    config: [
      {{
        reference: "bullets",
        levels: [{{
          level: 0,
          format: LevelFormat.BULLET,
          text: "•",
          alignment: AlignmentType.LEFT,
          style: {{ paragraph: {{ indent: {{ left: 720, hanging: 360 }} }} }}
        }}]
      }}
    ]
  }},
  styles: {{
    default: {{ document: {{ run: {{ font: "Arial", size: 24 }} }} }},
    paragraphStyles: [
      {{
        id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: {{ size: 36, bold: true, font: "Arial", color: "1a1a2e" }},
        paragraph: {{ spacing: {{ before: 360, after: 240 }}, outlineLevel: 0 }}
      }},
      {{
        id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: {{ size: 28, bold: true, font: "Arial", color: "16213e" }},
        paragraph: {{ spacing: {{ before: 240, after: 180 }}, outlineLevel: 1 }}
      }}
    ]
  }},
  sections: [{{
    properties: {{
      page: {{
        size: {{ width: 12240, height: 15840 }},
        margin: {{ top: 1440, right: 1440, bottom: 1440, left: 1440 }}
      }}
    }},
    children: [
        {children_str}
    ]
  }}]
}});

Packer.toBuffer(doc).then(buffer => {{
  fs.writeFileSync({json.dumps(output_path)}, buffer);
  console.log('SUCCESS: ' + {json.dumps(output_path)});
}}).catch(err => {{
  console.error('ERROR: ' + err.message);
  process.exit(1);
}});
"""

    # Write JS to temp file and run
    with tempfile.NamedTemporaryFile(mode="w", suffix=".js", delete=False) as f:
        f.write(js_script)
        tmp_js = f.name

    try:
        result = subprocess.run(
            ["node", tmp_js], capture_output=True, text=True, timeout=30
        )
        print(f"[_write_docx] node stdout={result.stdout}, stderr={result.stderr}")
        return "SUCCESS" in result.stdout
    except Exception as e:
        print(f"[_write_docx] ERROR: {e}")
        return False
    finally:
        os.unlink(tmp_js)


# ─────────────────────────────────────────────────────────────────────────────
# 11. BUILD THE GRAPH
# ─────────────────────────────────────────────────────────────────────────────

checkpointer = InMemorySaver()


def build_graph():
    g = StateGraph(ResearchState)

    # Register all nodes
    g.add_node("supervisor", supervisor)
    g.add_node("researcher_a", researcher_a)
    g.add_node("researcher_b", researcher_b)
    g.add_node("hitl_document", hitl_document)

    # Entry point
    g.add_edge(START, "supervisor")

    # Supervisor fans out to research nodes or document creation
    g.add_conditional_edges("supervisor", assign_tool)

    # Both researchers report back to supervisor for synthesis / loop decision
    g.add_edge("researcher_a", "supervisor")
    g.add_edge("researcher_b", "supervisor")

    # After HITL document creation, supervisor gives final response to user
    g.add_edge("hitl_document", "supervisor")

    return g.compile(checkpointer=checkpointer)


graph = build_graph()
print("[graph] Research MAS graph compiled successfully")
