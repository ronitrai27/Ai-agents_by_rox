import "dotenv/config";
import { createAgent, humanInTheLoopMiddleware, tool } from "langchain";
import { ChatOpenAI } from "@langchain/openai";
import { MemorySaver, Command } from "@langchain/langgraph";
import { HumanMessage } from "@langchain/core/messages";
import { z } from "zod";
import * as readline from "readline";

// ─────────────────────────────────────────────────────────────────────────────
//  CONSOLE HELPERS
// ─────────────────────────────────────────────────────────────────────────────

const C = {
  reset: "\x1b[0m", bold: "\x1b[1m", gray: "\x1b[90m",
  cyan: "\x1b[36m", green: "\x1b[32m", yellow: "\x1b[33m",
  red: "\x1b[31m", blue: "\x1b[34m", magenta: "\x1b[35m", white: "\x1b[97m",
};

const log = (tag: string, color: string, msg: string) =>
  console.log(`${color}${C.bold}[${tag}]${C.reset} ${color}${msg}${C.reset}`);

const divider = (label = "") =>
  console.log(`\n${C.gray}${"─".repeat(20)} ${label} ${"─".repeat(20)}${C.reset}\n`);

// ─────────────────────────────────────────────────────────────────────────────
//  FAKE DATABASE
// ─────────────────────────────────────────────────────────────────────────────

const fakeDB = {
  project: {
    name: "WEkraft",
    description: "AI-powered project management platform",
    deadline: "2025-09-01",
    status: "on-track",
    milestones: [
      { name: "MVP Launch",   date: "2025-06-15", done: false },
      { name: "Beta Release", date: "2025-07-30", done: false },
    ],
    velocity: { lastSprint: 34, avgSprint: 30, trend: "improving" },
  },
  sprints: [
    {
      id: "SP-5", name: "Sprint 5", status: "active",
      startDate: "2025-04-07", endDate: "2025-04-21",
      goal: "Ship ROXO agent v1 + dashboard redesign",
      storyPoints: { total: 42, completed: 18, remaining: 24 },
    },
    {
      id: "SP-4", name: "Sprint 4", status: "completed",
      startDate: "2025-03-24", endDate: "2025-04-06",
      storyPoints: { total: 38, completed: 34, remaining: 0 },
    },
  ],
  tasks: [
    { id: "T-201", title: "Build ROXO main agent", status: "in-progress", assignee: "ali",  sprintId: "SP-5", points: 8 },
    { id: "T-202", title: "Dashboard redesign",    status: "todo",        assignee: "sara", sprintId: "SP-5", points: 5 },
    { id: "T-203", title: "Fix auth bug",          status: "blocked",     assignee: null,   sprintId: "SP-5", points: 3 },
    { id: "T-204", title: "Write API docs",        status: "todo",        assignee: null,   sprintId: null,   points: 2 },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
//  SUBAGENT 1 TOOLS — Project Basics (tasks + sprints)
// ─────────────────────────────────────────────────────────────────────────────

const getTasks = tool(
  async ({ sprintId, status }: { sprintId?: string; status?: string }) => {
    log("TOOL:getTasks", C.cyan, `sprint=${sprintId ?? "all"} status=${status ?? "all"}`);
    let tasks = fakeDB.tasks;
    if (sprintId) tasks = tasks.filter((t) => t.sprintId === sprintId);
    if (status)   tasks = tasks.filter((t) => t.status   === status);
    return JSON.stringify(tasks, null, 2);
  },
  {
    name: "get_tasks",
    description: "Fetch tasks. Optionally filter by sprintId or status.",
    schema: z.object({ sprintId: z.string().optional(), status: z.string().optional() }),
  },
);

const getSprints = tool(
  async () => {
    log("TOOL:getSprints", C.cyan, "Fetching all sprints");
    return JSON.stringify(fakeDB.sprints, null, 2);
  },
  {
    name: "get_sprints",
    description: "Fetch all sprints — active, completed etc.",
    schema: z.object({}),
  },
);

// ─────────────────────────────────────────────────────────────────────────────
//  SUBAGENT 2 TOOLS — Insights (project details + velocity)
// ─────────────────────────────────────────────────────────────────────────────

const getProjectDetails = tool(
  async () => {
    log("TOOL:getProjectDetails", C.magenta, "Fetching project details");
    const { name, description, status, milestones } = fakeDB.project;
    return JSON.stringify({ name, description, status, milestones }, null, 2);
  },
  {
    name: "get_project_details",
    description: "Get project name, description, status and milestones.",
    schema: z.object({}),
  },
);

const getDeadlineVelocity = tool(
  async () => {
    log("TOOL:getDeadlineVelocity", C.magenta, "Fetching deadline + velocity");
    const { deadline, velocity } = fakeDB.project;
    return JSON.stringify({ deadline, velocity }, null, 2);
  },
  {
    name: "get_deadline_velocity",
    description: "Get project deadline and sprint velocity trend.",
    schema: z.object({}),
  },
);

// ─────────────────────────────────────────────────────────────────────────────
//  BUILD SUBAGENTS
// ─────────────────────────────────────────────────────────────────────────────

const model = new ChatOpenAI({ model: "gpt-4.1-nano", temperature: 0, streaming: true });

const projectBasicsSubagent = createAgent({
  model,
  tools: [getTasks, getSprints],
  systemPrompt: `You are the Project Basics Intel subagent for WEkraft.
Your job: gather and summarize task and sprint data only.
Never modify anything. Be concise and data-driven.
Highlight: blocked tasks, unassigned tasks, sprint progress.`,
});

const insightsSubagent = createAgent({
  model,
  tools: [getProjectDetails, getDeadlineVelocity],
  systemPrompt: `You are the Insights Intel subagent for WEkraft.
Your job: analyze project health — deadlines, milestones, and velocity trends.
Never modify anything. Give actionable insights. Flag risks clearly.`,
});

// ─────────────────────────────────────────────────────────────────────────────
//  SUBAGENT INVOKER
//
//  FIX 1 — Double-printed text:
//  We use agent.invoke() here instead of streamEvents().
//  The subagent output was printing TWICE because streamEvents on the subagent
//  AND streamEvents on the main agent (in streamAgent()) both emitted
//  on_chat_model_stream events for the same tokens.
//  Solution: subagents use invoke() — clean single output, no stream bleed.
//  Only ROXO (main agent) uses streamEvents for live token streaming.
// ─────────────────────────────────────────────────────────────────────────────

async function invokeSubagent(
  agent: typeof projectBasicsSubagent,
  agentName: string,
  query: string,
  threadId: string,
  color: string,
) {
  divider(`${agentName} ACTIVATED`);
  log(agentName, color, `Query: "${query}"`);

  const config = { configurable: { thread_id: `${agentName}-${threadId}` } };

  // ✅ Use invoke() not streamEvents() — avoids double-printing
  //    subagent tokens into the parent stream
  const result = await agent.invoke(
    { messages: [{ role: "user", content: query }] },
    config,
  );

  const lastMsg = result.messages?.at(-1);
  const output = typeof lastMsg?.content === "string"
    ? lastMsg.content
    : JSON.stringify(lastMsg?.content ?? "no output");

  // Print subagent output cleanly once
  console.log(`${color}${output}${C.reset}`);

  divider(`${agentName} DONE`);
  return output;
}

// ─────────────────────────────────────────────────────────────────────────────
//  WRAP SUBAGENTS AS TOOLS
//
//  FIX 2 — Double-serialized input {"input":"{\"query\":...}"}:
//  createAgent passes tool args as { input: "<stringified json>" } in some
//  versions. Safest fix: accept a single `query` string (no nested object),
//  and handle threadId separately via closure or a simple string concat.
//  This avoids the serialization mismatch entirely.
// ─────────────────────────────────────────────────────────────────────────────

// ✅ Helper to safely parse input — handles both raw object and stringified JSON
function safeParseInput(raw: any): { query: string; threadId: string } {
  if (typeof raw === "string") {
    try { return JSON.parse(raw); } catch { return { query: raw, threadId: "default" }; }
  }
  if (raw && typeof raw === "object") {
    // Handle double-wrapped: { input: "{\"query\":...}" }
    if (typeof raw.input === "string") {
      try { return JSON.parse(raw.input); } catch { return { query: raw.input, threadId: "default" }; }
    }
    return raw;
  }
  return { query: String(raw), threadId: "default" };
}

const askProjectBasics = tool(
  // ✅ Accept `any` and parse safely — handles both normal and double-serialized input
  async (rawInput: any) => {
    const { query, threadId } = safeParseInput(rawInput);
    return invokeSubagent(projectBasicsSubagent, "PROJECT-BASICS", query, threadId, C.cyan);
  },
  {
    name: "ask_project_basics",
    description: "Ask the Project Basics subagent: tasks, sprints, blocked items, unassigned tasks.",
    schema: z.object({
      query: z.string().describe("What data do you need?"),
      threadId: z.string().describe("Current session thread ID"),
    }),
  },
);

const askInsights = tool(
  async (rawInput: any) => {
    const { query, threadId } = safeParseInput(rawInput);
    return invokeSubagent(insightsSubagent, "INSIGHTS", query, threadId, C.magenta);
  },
  {
    name: "ask_insights",
    description: "Ask the Insights subagent: project health, deadlines, velocity, milestone risks.",
    schema: z.object({
      query: z.string().describe("What insights do you need?"),
      threadId: z.string().describe("Current session thread ID"),
    }),
  },
);

// ─────────────────────────────────────────────────────────────────────────────
//  WRITE TOOL — Add Task to Sprint (clean, no interrupt() — handled by middleware)
// ─────────────────────────────────────────────────────────────────────────────

const addTaskToSprint = tool(
  async (rawInput: any) => {
    const { taskId, sprintId, reason } = typeof rawInput.input === "string"
      ? JSON.parse(rawInput.input)
      : rawInput;

    log("WRITE:addTaskToSprint", C.yellow, `Adding ${taskId} → ${sprintId}`);
    const task = fakeDB.tasks.find((t) => t.id === taskId);
    if (!task) return `Task ${taskId} not found.`;
    task.sprintId = sprintId;
    log("WRITE:addTaskToSprint", C.green, `✅ Task ${taskId} added to ${sprintId}`);
    return `✅ Task "${task.title}" (${taskId}) added to sprint ${sprintId}. Reason: ${reason}`;
  },
  {
    name: "add_task_to_sprint",
    description: "Add an existing task to a sprint. Requires human approval.",
    schema: z.object({
      taskId:   z.string().describe("Task ID e.g. T-204"),
      sprintId: z.string().describe("Sprint ID e.g. SP-5"),
      reason:   z.string().describe("Why this task belongs in this sprint"),
    }),
  },
);

// ─────────────────────────────────────────────────────────────────────────────
//  MAIN AGENT — ROXO
// ─────────────────────────────────────────────────────────────────────────────

const checkpointer = new MemorySaver();

const roxo = createAgent({
  model,
  tools: [askProjectBasics, askInsights, addTaskToSprint],
  checkpointer,
  systemPrompt: `You are ROXO, the AI PM agent for WEkraft.

ARCHITECTURE:
- ask_project_basics  → read-only subagent (tasks, sprints)
- ask_insights        → read-only subagent (project health, deadline, velocity)
- add_task_to_sprint  → WRITE tool, requires human approval

WORKFLOW:
1. Always GATHER DATA first via subagents before deciding anything
2. ANALYZE what you found
3. ACT only when you have enough context
4. Always pass the current threadId when calling subagents

Be concise, data-driven, and always justify write actions with data.`,

  middleware: [
    humanInTheLoopMiddleware({
      interruptOn: {
        add_task_to_sprint: true,
      },
      descriptionPrefix: "⏸  ROXO needs your approval",
    }),
  ],
});

// ─────────────────────────────────────────────────────────────────────────────
//  HITL APPROVAL HANDLER
// ─────────────────────────────────────────────────────────────────────────────

async function handleInterrupt(interruptPayloads: any[]): Promise<"approve" | "reject"> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q: string) => new Promise<string>((res) => rl.question(q, res));

  divider("⏸  HUMAN APPROVAL REQUIRED");

  for (const item of interruptPayloads) {
    const actionRequests = item.action_requests ?? [];
    const reviewConfigs  = item.review_configs  ?? [];

    for (const action of actionRequests) {
      const reviewCfg = reviewConfigs.find((r: any) => r.action_name === action.name);
      const allowed   = reviewCfg?.allowed_decisions ?? ["approve", "reject"];

      console.log(`\n${C.yellow}${C.bold}ACTION:${C.reset} ${action.name}`);
      console.log(`${C.white}${action.description ?? JSON.stringify(action.arguments)}${C.reset}`);
      console.log(`${C.gray}Args: ${JSON.stringify(action.arguments, null, 2)}${C.reset}`);
      console.log(`${C.gray}Allowed: [${allowed.join(", ")}]${C.reset}\n`);

      const answer = await ask(`${C.bold}Approve? (y/n): ${C.reset}`);
      const approved = ["y", "yes"].includes(answer.toLowerCase().trim());
      log("HITL", approved ? C.green : C.red, approved ? "✅ Approved" : "❌ Rejected");
      rl.close();
      return approved ? "approve" : "reject";
    }
  }

  rl.close();
  return "approve";
}

// ─────────────────────────────────────────────────────────────────────────────
//  MAIN AGENT STREAM HELPER
//
//  FIX 1 (cont.) — Filter out subagent token events from main stream:
//  event.metadata.langgraph_node tells us which node emitted the event.
//  When ROXO is calling a subagent tool, the subagent's model tokens
//  bubble up with a different node name. We only print tokens where the
//  node is "agent" (ROXO's own reasoning node).
// ─────────────────────────────────────────────────────────────────────────────

async function streamAgent(
  input: Parameters<typeof roxo.streamEvents>[0],
  config: Parameters<typeof roxo.streamEvents>[1],
) {
  const stream = roxo.streamEvents(input, { ...config, version: "v2" });
  let buffer = "";

  for await (const event of stream) {
    if (event.event === "on_tool_start") {
      if (buffer) { console.log(); buffer = ""; }
      log("ROXO→TOOL", C.blue, `🔧 ${event.name}`);
      if (event.data?.input) log("INPUT", C.gray, JSON.stringify(event.data.input));
    }

    if (event.event === "on_tool_end") {
      log("TOOL→ROXO", C.green, `✅ ${event.name} done`);
    }

    if (event.event === "on_chat_model_stream") {
      const node = event.metadata?.langgraph_node as string | undefined;
      // Skip subagent tokens (which bubble up in 'tools' node) 
      // but show everything else (ROXO's main reasoning).
      if (node !== "tools") {
        const content = event.data?.chunk?.content;
        if (typeof content === "string" && content) {
          process.stdout.write(`${C.white}${content}${C.reset}`);
          buffer += content;
        }
      }
    }

    if (event.event === "on_chat_model_end" && !buffer) {
      const node = event.metadata?.langgraph_node as string | undefined;
      if (node !== "tools") {
        const content = event.data?.output?.content;
        if (typeof content === "string" && content) {
          console.log(`${C.white}${content}${C.reset}`);
          buffer = content;
        }
      }
    }
  }

  if (buffer) console.log();
}

// ─────────────────────────────────────────────────────────────────────────────
//  RUN ONE TURN
// ─────────────────────────────────────────────────────────────────────────────

async function runTurn(userMessage: string, threadId: string) {
  divider(`🧠 ROXO — Thread: ${threadId}`);
  log("USER", C.blue, userMessage);
  console.log();

  const config = { configurable: { thread_id: threadId } };

  await streamAgent({ messages: [new HumanMessage(userMessage)] }, config);

  // HITL loop — handles multiple sequential write actions
  while (true) {
    const state = await roxo.getState(config);
    const pendingInterrupts = (state?.tasks ?? [])
      .flatMap((t: any) => t.interrupts ?? [])
      .map((i: any) => i.value);

    if (!pendingInterrupts.length) break;

    const decision = await handleInterrupt(pendingInterrupts);
    divider("▶  RESUMING");

    await streamAgent(
      new Command({ resume: { decisions: [{ type: decision }] } }),
      config,
    );
  }

  divider("✅ TURN COMPLETE");
}

// ─────────────────────────────────────────────────────────────────────────────
//  MULTI-TURN CONSOLE LOOP
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  console.clear();
  divider("🚀 ROXO v2 — fixed");

  console.log(`${C.gray}
  BUGS FIXED:
  1. Double-printed subagent text → subagents now use invoke() not streamEvents()
  2. Double-serialized tool input → safeParseInput() handles both formats
  3. ROXO retrying on garbled output → fixed by fixing 1 + 2

  ARCHITECTURE:
  ┌──────────────────────────────────────────┐
  │           ROXO  (main agent)             │
  │  • ask_project_basics  → subagent [READ] │
  │  • ask_insights        → subagent [READ] │
  │  • add_task_to_sprint          [HITL ⏸]  │
  └──────────────────────────────────────────┘

  Example queries:
  1. Show me all tasks
  2. Are we at risk of missing our deadline?
  3. Add the unassigned API docs task to Sprint 5

  Type 'quit' to exit.
${C.reset}`);

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q: string) => new Promise<string>((res) => rl.question(q, res));
  const threadId = `roxo-${Date.now()}`;
  log("SESSION", C.gray, `Thread: ${threadId}`);

  while (true) {
    const input = await ask(`\n${C.bold}${C.blue}You: ${C.reset}`);
    if (!input.trim()) continue;
    if (["quit", "exit"].includes(input.toLowerCase())) {
      console.log(`\n${C.gray}Goodbye! 👋${C.reset}`);
      rl.close();
      break;
    }
    try {
      await runTurn(input, threadId);
    } catch (err: any) {
      log("ERROR", C.red, err.message ?? String(err));
    }
  }
}

main().catch(console.error);