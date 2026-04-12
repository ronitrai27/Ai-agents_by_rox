import "dotenv/config";
import { tool } from "@langchain/core/tools";
import { ChatOpenAI } from "@langchain/openai";
import { MemorySaver, interrupt, Command } from "@langchain/langgraph";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { HumanMessage } from "@langchain/core/messages";
import { z } from "zod";
import * as readline from "readline";

// ─────────────────────────────────────────────────────────────────────────────
//  CONSOLE HELPERS
// ─────────────────────────────────────────────────────────────────────────────

const C = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  gray: "\x1b[90m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  white: "\x1b[97m",
};

const log = (tag: string, color: string, msg: string) =>
  console.log(`${color}${C.bold}[${tag}]${C.reset} ${color}${msg}${C.reset}`);

const divider = (label = "") =>
  console.log(
    `\n${C.gray}${"─".repeat(20)} ${label} ${"─".repeat(20)}${C.reset}\n`,
  );

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
      { name: "MVP Launch", date: "2025-06-15", done: false },
      { name: "Beta Release", date: "2025-07-30", done: false },
    ],
    velocity: { lastSprint: 34, avgSprint: 30, trend: "improving" },
  },

  sprints: [
    {
      id: "SP-5",
      name: "Sprint 5",
      status: "active",
      startDate: "2025-04-07",
      endDate: "2025-04-21",
      goal: "Ship ROXO agent v1 + dashboard redesign",
      storyPoints: { total: 42, completed: 18, remaining: 24 },
    },
    {
      id: "SP-4",
      name: "Sprint 4",
      status: "completed",
      startDate: "2025-03-24",
      endDate: "2025-04-06",
      storyPoints: { total: 38, completed: 34, remaining: 0 },
    },
  ],

  tasks: [
    {
      id: "T-201",
      title: "Build ROXO main agent",
      status: "in-progress",
      assignee: "ali",
      sprintId: "SP-5",
      points: 8,
    },
    {
      id: "T-202",
      title: "Dashboard redesign",
      status: "todo",
      assignee: "sara",
      sprintId: "SP-5",
      points: 5,
    },
    {
      id: "T-203",
      title: "Fix auth bug",
      status: "blocked",
      assignee: null,
      sprintId: "SP-5",
      points: 3,
    },
    {
      id: "T-204",
      title: "Write API docs",
      status: "todo",
      assignee: null,
      sprintId: null,   // not in any sprint yet
      points: 2,
    },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
//  SUBAGENT 1 — Project Basics Intel
//  Tools: get_tasks, get_sprints
// ─────────────────────────────────────────────────────────────────────────────

const getTasks = tool(
  async ({ sprintId, status }: { sprintId?: string; status?: string }) => {
    log("TOOL:getTasks", C.cyan, `sprint=${sprintId ?? "all"} status=${status ?? "all"}`);
    let tasks = fakeDB.tasks;
    if (sprintId) tasks = tasks.filter((t) => t.sprintId === sprintId);
    if (status) tasks = tasks.filter((t) => t.status === status);
    return JSON.stringify(tasks, null, 2);
  },
  {
    name: "get_tasks",
    description: "Fetch tasks. Optionally filter by sprintId or status.",
    schema: z.object({
      sprintId: z.string().optional(),
      status: z.string().optional(),
    }),
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

const projectBasicsSubagent = createReactAgent({
  llm: new ChatOpenAI({ model: "gpt-4.1-nano", temperature: 0 }),
  tools: [getTasks, getSprints],
  prompt: `You are the Project Basics Intel subagent for WEkraft.
Your job: gather and summarize task and sprint data only.
Never modify anything. Be concise and data-driven.
Highlight: blocked tasks, unassigned tasks, sprint progress.`,
});

// ─────────────────────────────────────────────────────────────────────────────
//  SUBAGENT 2 — Insights Intel
//  Tools: get_project_details, get_deadline_velocity
// ─────────────────────────────────────────────────────────────────────────────

const getProjectDetails = tool(
  async () => {
    log("TOOL:getProjectDetails", C.cyan, "Fetching project details");
    return JSON.stringify(
      { name: fakeDB.project.name, description: fakeDB.project.description, status: fakeDB.project.status, milestones: fakeDB.project.milestones },
      null,
      2,
    );
  },
  {
    name: "get_project_details",
    description: "Get project name, description, status and milestones.",
    schema: z.object({}),
  },
);

const getDeadlineVelocity = tool(
  async () => {
    log("TOOL:getDeadlineVelocity", C.cyan, "Fetching deadline + velocity");
    return JSON.stringify(
      { deadline: fakeDB.project.deadline, velocity: fakeDB.project.velocity },
      null,
      2,
    );
  },
  {
    name: "get_deadline_velocity",
    description: "Get project deadline and sprint velocity trend.",
    schema: z.object({}),
  },
);

const insightsSubagent = createReactAgent({
  llm: new ChatOpenAI({ model: "gpt-4.1-nano", temperature: 0 }),
  tools: [getProjectDetails, getDeadlineVelocity],
  prompt: `You are the Insights Intel subagent for WEkraft.
Your job: analyze project health — deadlines, milestones, and velocity trends.
Never modify anything. Give actionable insights. Flag risks clearly.`,
});

// ─────────────────────────────────────────────────────────────────────────────
//  WRAP SUBAGENTS AS TOOLS for the Main Agent
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
  const stream = agent.streamEvents(
    { messages: [{ role: "user", content: query }] },
    { ...config, version: "v2" },
  );

  let output = "";

  for await (const event of stream) {
    if (event.event === "on_tool_start") {
      log(`${agentName}→TOOL`, color, `Calling: ${event.name}`);
    }
    if (event.event === "on_tool_end") {
      log(`${agentName}←TOOL`, color, `Done: ${event.name}`);
    }
    if (event.event === "on_chat_model_stream" && event.data?.chunk?.content) {
      const content = event.data.chunk.content;
      if (typeof content === "string" && content) {
        process.stdout.write(`${color}${content}${C.reset}`);
        output += content;
      }
    }
  }

  console.log();
  divider(`${agentName} DONE`);

  const finalState = await agent.getState(config);
  const lastMsg = finalState.values?.messages?.at(-1);
  return lastMsg?.content ?? output ?? `${agentName} returned no output.`;
}

const askProjectBasics = tool(
  async ({ query, threadId }: { query: string; threadId: string }) => {
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
  async ({ query, threadId }: { query: string; threadId: string }) => {
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
//  WRITE TOOL — Add Task to Sprint (HITL)
// ─────────────────────────────────────────────────────────────────────────────

const addTaskToSprint = tool(
  async ({
    taskId,
    sprintId,
    reason,
  }: {
    taskId: string;
    sprintId: string;
    reason: string;
  }) => {
    log("WRITE:addTaskToSprint", C.yellow, `⚡ HITL — add ${taskId} → ${sprintId}`);

    // HITL pause — will surface as __interrupt__ in state
    const approved = interrupt({
      action: "add_task_to_sprint",
      taskId,
      sprintId,
      reason,
      message: `📋 Add task ${taskId} to sprint ${sprintId}?\n   Reason: ${reason}`,
    });

    if (!approved) return `❌ Rejected: Task ${taskId} was NOT added to ${sprintId}.`;

    const task = fakeDB.tasks.find((t) => t.id === taskId);
    if (!task) return `Task ${taskId} not found.`;

    task.sprintId = sprintId;
    log("WRITE:addTaskToSprint", C.green, `✅ Task ${taskId} added to ${sprintId}`);
    return `✅ Task "${task.title}" (${taskId}) successfully added to sprint ${sprintId}.\nReason: ${reason}`;
  },
  {
    name: "add_task_to_sprint",
    description: "Add an existing task to a sprint. Requires human approval (HITL).",
    schema: z.object({
      taskId: z.string().describe("Task ID e.g. T-204"),
      sprintId: z.string().describe("Sprint ID e.g. SP-5"),
      reason: z.string().describe("Why this task belongs in this sprint"),
    }),
  },
);

// ─────────────────────────────────────────────────────────────────────────────
//  MAIN AGENT — ROXO
// ─────────────────────────────────────────────────────────────────────────────

const checkpointer = new MemorySaver();

const roxo = createReactAgent({
  llm: new ChatOpenAI({ model: "gpt-4.1-nano", temperature: 0 }),
  tools: [askProjectBasics, askInsights, addTaskToSprint],
  checkpointSaver: checkpointer,
  messageModifier: `You are ROXO, the AI PM agent for WEkraft — an intelligent, senior engineering manager assistant.

ARCHITECTURE:
- ask_project_basics  → read-only subagent (tasks, sprints)
- ask_insights        → read-only subagent (project health, deadline, velocity)
- add_task_to_sprint  → WRITE tool, requires human approval (HITL)

WORKFLOW:
1. Always GATHER DATA first via subagents before deciding anything
2. ANALYZE what you found
3. ACT only when you have enough context — use add_task_to_sprint when needed
4. Always pass the current threadId when calling subagents

Be concise, data-driven, and always justify write actions with data.`,
});

// ─────────────────────────────────────────────────────────────────────────────
//  HITL APPROVAL HANDLER
// ─────────────────────────────────────────────────────────────────────────────

async function handleInterrupt(interruptPayloads: any[]): Promise<boolean> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q: string) => new Promise<string>((res) => rl.question(q, res));

  divider("⏸  HUMAN APPROVAL REQUIRED");

  let approved = true;
  for (const item of interruptPayloads) {
    const msg = item.message ?? JSON.stringify(item);
    console.log(`\n${C.yellow}${C.bold}ACTION:${C.reset} ${item.action ?? "unknown"}`);
    console.log(`${C.white}${msg}${C.reset}\n`);
    const answer = await ask(`${C.bold}Approve? (y/n): ${C.reset}`);
    approved = ["y", "yes"].includes(answer.toLowerCase().trim());
    log("HITL", approved ? C.green : C.red, approved ? "✅ Approved" : "❌ Rejected");
  }

  rl.close();
  return approved;
}

// ─────────────────────────────────────────────────────────────────────────────
//  STREAM HELPER — shared by first run + resume
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
    if (event.event === "on_chat_model_stream" && event.data?.chunk?.content) {
      const content = event.data.chunk.content;
      if (typeof content === "string" && content) {
        process.stdout.write(`${C.white}${content}${C.reset}`);
        buffer += content;
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

  // First stream pass
  await streamAgent({ messages: [new HumanMessage(userMessage)] }, config);

  // Check for pending HITL interrupts
  let state = await roxo.getState(config);

  // Loop handles multiple sequential write actions in one turn
  while (true) {
    const pendingInterrupts = (state?.tasks ?? [])
      .flatMap((t: any) => t.interrupts ?? [])
      .map((i: any) => i.value);

    if (!pendingInterrupts.length) break;

    const approved = await handleInterrupt(pendingInterrupts);
    divider("▶  RESUMING");

    await streamAgent(new Command({ resume: approved }), config);

    state = await roxo.getState(config);
  }

  divider("✅ TURN COMPLETE");
}

// ─────────────────────────────────────────────────────────────────────────────
//  MULTI-TURN CONSOLE LOOP
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  console.clear();
  divider("🚀 ROXO — WEkraft AI PM Agent");

  console.log(`${C.gray}
  ARCHITECTURE:
  ┌──────────────────────────────────────────┐
  │           ROXO  (main agent)             │
  │  • ask_project_basics  → subagent [READ] │
  │  • ask_insights        → subagent [READ] │
  │  • add_task_to_sprint          [HITL ⏸]  │
  └──────────────────────────────────────────┘

  Example queries:
  1. Give me a full sprint overview
  2. Are we at risk of missing our deadline?
  3. Add the unassigned auth bug task to Sprint 5
  4. What tasks are blocked right now?

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