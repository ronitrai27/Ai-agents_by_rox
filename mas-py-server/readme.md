ResearchState adds findings, final_report, iterations on top of MessagesState. The findings list accumulates across loops so the citation agent has all sources at the end.
Different LLMs per layer — supervisor gets gpt-4.1 for planning/synthesis, subagents get gpt-4.1-mini for search/summarize. Cheaper where it matters less.
Citation Agent is not a ReAct agent — it's a single LLM call that runs inside hitl_document before the interrupt fires. No tool loop needed, just text processing. This matches the Anthropic diagram where CitationAgent is downstream of the main loop.
HITL carries a rich payload — report_preview, word_count, summary so your frontend can show a proper approval card, not just "approve/cancel."
_write_docx uses the same Node.js docx pattern from the skill — parses markdown headers/bullets into proper docx structure.

Principal = Supervisor
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



## errors
INFO:     Finished server process [42180]
[init] Tavily client ready
[init] SerpAPI client ready: d7f7e6ac...
[graph] Research MAS graph compiled successfully
[SERVER] FastAPI app initialized
[SERVER] FastAPI app initialized
INFO:     Started server process [53704]
INFO:     Waiting for application startup.
INFO:     Application startup complete.

means on save - eveything is loaded 
but error came - and stream ended !

[generate_events] ERROR: 400 Client Error: Bad Request for url: https://serpapi.com/search?engine=google_patents&q=patents+related+to+alien+technology+or+UFOs&num=5&api_key=d7f7e6ac4c1d658185f43db94c766526ddd8b7b4418088e4c7cd716c3d067539

[error_event] ERROR: 400 Client Error: Bad Request for url: https://serpapi.com/search?engine=google_patents&q=patents+related+to+alien+technology+or+UFOs&num=5&api_key=d7f7e6ac4c1d658185f43db94c766526ddd8b7b4418088e4c7cd716c3d067539

[generate_events] Stream ended for thread_id=e639ef15-7df9-4b39-8794-fe329d60e539

[tavily_web_search] ✓ DONE — 5 results

[tavily_web_search] ✓ DONE — 5 results

[serp_news_search] ✓ DONE — 10 results

[tavily_web_search] ✓ DONE — 5 results
