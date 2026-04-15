
```
██╗      █████╗ ███╗   ██╗ ██████╗  ██████╗ ██████╗  █████╗ ██████╗ ██╗  ██╗
██║     ██╔══██╗████╗  ██║██╔════╝ ██╔════╝ ██╔══██╗██╔══██╗██╔══██╗██║  ██║
██║     ███████║██╔██╗ ██║██║  ███╗██║  ███╗██████╔╝███████║██████╔╝███████║
██║     ██╔══██║██║╚██╗██║██║   ██║██║   ██║██╔══██╗██╔══██║██╔═══╝ ██╔══██║
███████╗██║  ██║██║ ╚████║╚██████╔╝╚██████╔╝██║  ██║██║  ██║██║     ██║  ██║
╚══════╝╚═╝  ╚═╝╚═╝  ╚═══╝ ╚═════╝  ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝     ╚═╝  ╚═╝
```
 
# 🧠 LangGraph Multi-Agent Systems with Nextjs connection. No SDK. No Templates, ALL CUSTOM BUILD
 
**The only repo where LangGraph agents run raw, stream real, and think deep.**
**Available in TypeScript AND Python. Because why choose one language when you can dominate both.**

---

---
 
<!-- Agent Framework -->
[![LangGraph](https://img.shields.io/badge/LangGraph-Custom_Multi--Agents-blueviolet?style=for-the-badge&logo=data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCI+PHBhdGggZmlsbD0id2hpdGUiIGQ9Ik0xMiAyQzYuNDggMiAyIDYuNDggMiAxMnM0LjQ4IDEwIDEwIDEwIDEwLTQuNDggMTAtMTBTMTcuNTIgMiAxMiAyem0tMiAxNWwtNS01IDEuNDEtMS40MUwxMCAxNC4xN2w3LjU5LTcuNTlMMTkgOGwtOSA5eiIvPjwvc3ZnPg==)](https://langchain-ai.github.io/langgraph/)
[![LangChain](https://img.shields.io/badge/LangChain-Powered-1C3C3C?style=for-the-badge)](https://langchain.com)
[![LangSmith](https://img.shields.io/badge/LangSmith-Traced_%F0%9F%94%AD-orange?style=for-the-badge)](https://smith.langchain.com)
[![Mem0](https://img.shields.io/badge/Mem0-Memory_Layer-8B5CF6?style=for-the-badge)](https://mem0.ai)
 
<!-- Languages & Runtime -->
[![TypeScript](https://img.shields.io/badge/TypeScript-YES-3178C6?style=for-the-badge&logo=typescript)](https://www.typescriptlang.org/)
[![Python](https://img.shields.io/badge/Python-YES-FFD43B?style=for-the-badge&logo=python)](https://python.org)
[![Next.js](https://img.shields.io/badge/Next.js-SSE_Streaming-000?style=for-the-badge&logo=next.js)](https://nextjs.org)
 
<!-- LLMs -->
[![OpenAI](https://img.shields.io/badge/OpenAI-GPT_Powered-412991?style=for-the-badge&logo=openai)](https://openai.com)
[![Anthropic](https://img.shields.io/badge/Anthropic-Claude-CC785C?style=for-the-badge)](https://anthropic.com)
 
<!-- Tools & APIs -->
[![Tavily](https://img.shields.io/badge/Tavily-AI_Search-00C2A8?style=for-the-badge)](https://tavily.com)
[![SerpAPI](https://img.shields.io/badge/SerpAPI-Scholar_%7C_Patents_%7C_News-4285F4?style=for-the-badge)](https://serpapi.com)
[![Firecrawl](https://img.shields.io/badge/Firecrawl-Web_Scraping-FF6B35?style=for-the-badge)](https://firecrawl.dev)
 
 
---
 
⭐ **Star this repo if you're tired of wrapper tutorials.** ⭐
 
---
 
```
╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║   📚  FOR LEARNING & TESTING PURPOSES ONLY                   ║
║                                                              ║
║   Got questions? Found a bug? Just wanna talk agents?        ║
║   Feel free to reach out — always happy to connect.          ║
║                                                              ║
║   📧  raironit127@gmail.com                                  ║
║   💼  linkedin.com/in/rox-aa53a1300                          ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
```
 
---
 
> **"Everyone wraps the SDK. We write the graph."**

## Why This Repo Stands Out

Most LangGraph examples are either basic chains or over-hyped demos with heavy abstractions.  

This project is different.

It showcases **real multi-agent reasoning** using **ReAct agents**, **interrupts**, **human-in-the-loop (HITL)** flows, and **custom streaming** — all connected through clean, production-minded architecture.

### Key Highlights

- **Dual Implementation**: Full LangGraph + LangChain + LangSmith + **Mem0** in **both TypeScript** (`my-agent-ts`) and **Python** (`my-agent-py`). Side-by-side comparison for the community.
- **ReAct Agents with Multi-Agent Reasoning**: Agents that can think, use tools, reflect, and hand off to other specialized agents.
- **Human-in-the-Loop (HITL)**: Real interrupt patterns for approval, correction, or escalation.
- **Custom SSE Streaming**: Built from scratch using Next.js API routes — no LangChain SDKs, no third-party streaming wrappers.
- **Full Observability**: LangSmith tracing enabled by default.
- **Memory Layer**: Mem0 for persistent session context across interactions.(for demo purpose not integrated inside code).
- **Real Tool Calling**: Tavily, Firecrawl, SerpAPI, plus custom CRUD tools.
- **Clean Architecture**: Separate client (Next.js + pnpm) and server (Python + Poetry) layers with custom real-time log streaming.

---

 
## 📁 Repository Structure
 
```
agents/
├── assets/                        # 📸 Screenshots & diagrams
│   ├── app1.png
│   ├── app2.png
│   ├── app3.png
│   └── dia-1.png
│
├── my-agent-ts/                   # 🟦 LangGraph in TypeScript — fundamentals
├── my-agent-py/                   # 🐍 LangGraph in Python — same concepts, same power
│
├── customer-agent-client/         # 🛍️ Next.js frontend — customer service UI
├── customer-py-server/            # ⚙️ FastAPI backend — REACT agent + HITL
│
├── multi-research-client/         # 🔬 Research UI — real-time agent logs
├── multi-research-server/         # 🧠 The beast — 4-agent research orchestrator
│
├── .gitignore
├── README.md                      # You are here 📍
├── requirements.txt
└── tools_reference_card.html
```


# 🧩 Part 1 — `my-agent-ts` & `my-agent-py`
 
## The Foundation. Where It All Starts.
 
> Learn LangGraph the real way — by writing the graph yourself, in both languages.

.env setup ->
```dotenv
OPENAI_API_KEY=your_key_here
ANTHROPIC_API_KEY=your_key_here
LANGSMITH_TRACING=true
LANGSMITH_API_KEY=your_key_here
LANGSMITH_PROJECT=

--for client side--
```dotenv
NEXT_PUBLIC_AGENT_URL=http://127.0.0.1:8000  (chnage as per your domain)
```



<!-- ------------------------------- -->
for mas ---> Principal = Supervisor
The principal never does any actual research. He just reads the query that comes in, makes a plan, and assigns work. He has 3 tools on his desk — a phone to call Researcher A, a phone to call Researcher B, and a "create document" stamp. That's it. He doesn't search anything himself.

Two Vice Principals = Researcher A and Researcher B
These are the ReAct agents — meaning they actually think in a loop until they're satisfied.
Researcher A gets the call: "go find academic and web stuff about X." He then independently decides — I'll search Tavily, okay I found something interesting, let me extract that URL, now let me check Google Scholar... he keeps going until he feels the answer is complete. Then he writes up a summary and sends it back up to the Principal.
Researcher B does the same but his specialty is patents, news, and fact-checking.
Both work at the same time (parallel fan-out via Send()).

Teacher = citation_agent
Not a looping agent at all. Just one single task — takes the final report, finds all the URLs buried in it, inserts [1] [2] [3] inline citations, adds a References section at the bottom. Done. Hands it back. No back-and-forth.

Student = You (the user) — HITL
After the teacher formats the report, the graph freezes and shows you a preview. You either say "approve" or "reject". If you approve, the .docx gets written to disk. If you reject, the whole thing gets cancelled and the Principal asks what you want to change.
This freeze is the interrupt() call. The graph literally pauses its checkpoint and waits for your input before it can move forward.

The flow in one line:

You ask → Principal plans → calls both VPs in parallel → both VPs research independently using their tools → both report back to Principal → Principal synthesizes → Teacher adds citations → You approve → .docx is written → Principal gives final reply → done.



cd support_agent
poetry run python server.py

# Add your OpenAI key
echo "OPENAI_API_KEY=sk-..." > .env

# Run the server
python server.py
# or: uvicorn server:app --reload --port 8000
```

## TOOLS Html

visit -> tools_reference_card.html