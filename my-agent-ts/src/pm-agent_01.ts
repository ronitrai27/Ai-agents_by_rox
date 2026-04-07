// ============================================================
// LESSON: LANGGRAPH REACT AGENT  (03_pm_agent.ts)
//
// STACK:
//   ReAct loop      — agent thinks → calls tool → observes → repeats
//   MemorySaver     — in-memory checkpointer, persists state per thread
//   HITL            — interrupt() inside assignTask tool, human approves
//   Streaming       — stream("messages","updates") — see tokens live
//
// FLOW:
//   User query
//     → agent decides which tool(s) to call
//     → tool runs (read) OR pauses for approval (write)
//     → agent sees result, reasons, responds
//     → stream tokens to console as they arrive
// ============================================================

import "dotenv/config";
import * as readline from "readline";
import { tool } from "@langchain/core/tools";
import { ChatOpenAI } from "@langchain/openai";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { MemorySaver, interrupt, Command } from "@langchain/langgraph";
import { z } from "zod";

// ── DEMO DATABASE ─────────────────────────────────────────────

const DB = {
  tasks: [
    {
      id: "T-001",
      title: "Design auth system",
      description: "OAuth2 + JWT implementation",
      assignee: "alice",
      status: "in-progress",
      priority: "high",
      durationDays: 5,
      sprintId: "SP-1",
    },
    {
      id: "T-002",
      title: "Build API rate limiter",
      description: "Redis-based sliding window rate limiter",
      assignee: "bob",
      status: "todo",
      priority: "medium",
      durationDays: 3,
      sprintId: "SP-1",
    },
    {
      id: "T-003",
      title: "Set up CI/CD pipeline",
      description: "GitHub Actions + Docker deploy to Fly.io",
      assignee: "carol",
      status: "done",
      priority: "high",
      durationDays: 2,
      sprintId: "SP-1",
    },
    {
      id: "T-004",
      title: "Database schema migration",
      description: "Migrate from v2 to v3 schema with zero downtime",
      assignee: "alice",
      status: "todo",
      priority: "high",
      durationDays: 4,
      sprintId: "SP-2",
    },
    {
      id: "T-005",
      title: "Write API documentation",
      description: "OpenAPI spec + Postman collection",
      assignee: null,
      status: "todo",
      priority: "low",
      durationDays: 2,
      sprintId: "SP-2",
    },
  ],

  issues: [
    {
      id: "I-001",
      title: "Login page crashes on Safari",
      description: "Webkit CSS issue, reproducible on Safari 16+",
      assignee: "bob",
      status: "open",
      priority: "critical",
      linkedTaskId: "T-001",
    },
    {
      id: "I-002",
      title: "API returns 500 on empty payload",
      description: "Missing null check in request body parser",
      assignee: "alice",
      status: "open",
      priority: "high",
      linkedTaskId: "T-002",
    },
    {
      id: "I-003",
      title: "Slow query on user listing endpoint",
      description: "N+1 query, needs eager loading or pagination",
      assignee: null,
      status: "open",
      priority: "medium",
      linkedTaskId: null,
    },
    {
      id: "I-004",
      title: "Memory leak in background worker",
      description: "Worker process memory grows unbounded after 6h",
      assignee: "carol",
      status: "in-progress",
      priority: "high",
      linkedTaskId: null,
    },
  ],

  sprints: [
    {
      id: "SP-1",
      name: "Sprint 12 - Auth & Infra",
      startDate: "2025-04-01",
      endDate: "2025-04-14",
      status: "active",
      goal: "Ship auth system + CI/CD setup",
      velocity: 28,
    },
    {
      id: "SP-2",
      name: "Sprint 13 - Data & Docs",
      startDate: "2025-04-15",
      endDate: "2025-04-28",
      status: "planned",
      goal: "DB migration + API documentation",
      velocity: null,
    },
  ],
};

// ── TOOL LOGGER ───────────────────────────────────────────────
// Clean console output every time a tool is called / returns

function logToolCall(name: string, input: unknown) {
  console.log(`\n${"─".repeat(50)}`);
  console.log(`🔧 TOOL CALL → ${name}`);
  console.log(`   input: ${JSON.stringify(input, null, 2)}`);
}

function logToolResult(name: string, result: unknown) {
  console.log(`✅ TOOL RESULT ← ${name}`);
  console.log(`   result: ${JSON.stringify(result, null, 2)}`);
  console.log(`${"─".repeat(50)}\n`);
}

// ── READ-ONLY TOOLS ───────────────────────────────────────────

const getTasks = tool(
  (input) => {
    logToolCall("getTasks", input);
    let tasks = DB.tasks;

    if (input.assignee) {
      tasks = tasks.filter((t) => t.assignee === input.assignee);
    }
    if (input.status) {
      tasks = tasks.filter((t) => t.status === input.status);
    }
    if (input.sprintId) {
      tasks = tasks.filter((t) => t.sprintId === input.sprintId);
    }

    const result = tasks.length > 0 ? tasks : "No tasks found for the given filters.";
    logToolResult("getTasks", result);
    return JSON.stringify(result);
  },
  {
    name: "getTasks",
    description:
      "Query project tasks. Optionally filter by assignee (name), status (todo/in-progress/done), or sprintId.",
    schema: z.object({
      assignee: z.string().optional().describe("Filter by assignee name"),
      status: z.enum(["todo", "in-progress", "done"]).optional(),
      sprintId: z.string().optional().describe("e.g. SP-1 or SP-2"),
    }),
  }
);

const getIssues = tool(
  (input) => {
    logToolCall("getIssues", input);
    let issues = DB.issues;

    if (input.status) {
      issues = issues.filter((i) => i.status === input.status);
    }
    if (input.priority) {
      issues = issues.filter((i) => i.priority === input.priority);
    }
    if (input.unassigned) {
      issues = issues.filter((i) => i.assignee === null);
    }

    const result = issues.length > 0 ? issues : "No issues found for the given filters.";
    logToolResult("getIssues", result);
    return JSON.stringify(result);
  },
  {
    name: "getIssues",
    description:
      "Query project issues. Filter by status (open/in-progress), priority (critical/high/medium/low), or unassigned:true.",
    schema: z.object({
      status: z.enum(["open", "in-progress"]).optional(),
      priority: z.enum(["critical", "high", "medium", "low"]).optional(),
      unassigned: z.boolean().optional().describe("If true, return only unassigned issues"),
    }),
  }
);

const getSprints = tool(
  (input) => {
    logToolCall("getSprints", input);
    let sprints = DB.sprints;

    if (input.status) {
      sprints = sprints.filter((s) => s.status === input.status);
    }
    if (input.sprintId) {
      sprints = sprints.filter((s) => s.id === input.sprintId);
    }

    const result = sprints.length > 0 ? sprints : "No sprints found.";
    logToolResult("getSprints", result);
    return JSON.stringify(result);
  },
  {
    name: "getSprints",
    description:
      "Query sprints. Filter by status (active/planned) or a specific sprintId (e.g. SP-1).",
    schema: z.object({
      status: z.enum(["active", "planned"]).optional(),
      sprintId: z.string().optional(),
    }),
  }
);

// ── WRITE TOOL WITH HITL ──────────────────────────────────────
// This tool MUTATES data → pause and ask human before executing

const assignTask = tool(
  async (input) => {
    logToolCall("assignTask", input);

    const task = DB.tasks.find((t) => t.id === input.taskId);
    if (!task) {
      const result = `Task ${input.taskId} not found.`;
      logToolResult("assignTask", result);
      return result;
    }

    // ── HITL: pause here, surface details to the caller ──────
    // interrupt() throws a special exception that LangGraph catches.
    // Execution saves to the checkpointer and waits.
    // The human resumes with Command({ resume: true/false })
    const approved = interrupt({
      message: `⚠️  APPROVAL REQUIRED`,
      action: "assign_task",
      taskId: task.id,
      taskTitle: task.title,
      currentAssignee: task.assignee ?? "(unassigned)",
      newAssignee: input.newAssignee,
      question: `Reassign "${task.title}" from ${task.assignee ?? "nobody"} → ${input.newAssignee}?`,
    });

    if (!approved) {
      const result = `Assignment cancelled by user.`;
      logToolResult("assignTask", result);
      return result;
    }

    // Only runs AFTER human approves
    const previous = task.assignee ?? "(unassigned)";
    task.assignee = input.newAssignee;

    const result = `Task ${task.id} ("${task.title}") reassigned: ${previous} → ${input.newAssignee}`;
    logToolResult("assignTask", result);
    return result;
  },
  {
    name: "assignTask",
    description:
      "Reassign a task to a new person. REQUIRES human approval before executing.",
    schema: z.object({
      taskId: z.string().describe("Task ID, e.g. T-001"),
      newAssignee: z.string().describe("Name of the person to assign the task to"),
    }),
  }
);

// ── AGENT SETUP ───────────────────────────────────────────────

const model = new ChatOpenAI({ model: "gpt-4.1-nano", temperature: 0 });

// MemorySaver: stores graph state per thread_id in memory.
// In production, swap this for a Redis or Postgres checkpointer.
const checkpointer = new MemorySaver();

const agent = createReactAgent({
  llm: model,
  tools: [getTasks, getIssues, getSprints, assignTask],
  checkpointer,
  prompt: `You are a senior PM assistant with full access to the project's tasks, issues, and sprints.
Current time: ${new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" })} IST

Rules:
- Always query data before answering questions about it.
- For task assignments, use the assignTask tool — it will pause for human approval.
- Be concise. Lead with the most important insight.
- When listing items, include IDs so the user can reference them.`,
});

// Thread config — same thread_id = same memory across multiple turns
const config = { configurable: { thread_id: "pm-session-001" } };

// ── STREAMING HELPER ──────────────────────────────────────────
// Streams agent response, watches for interrupts, handles HITL terminal prompt

async function runWithStreaming(input: string | Command) {
  const streamInput =
    typeof input === "string"
      ? { messages: [{ role: "user" as const, content: input }] }
      : input;

  const stream = agent.streamEvents(streamInput, {
    ...config,
    version: "v2",
  });

  let interrupted = false;
  let interruptPayload: unknown = null;
  let buffer = "";

  process.stdout.write("\n🤖 Agent: ");

  for await (const event of stream) {
    // ── Stream AI tokens live ─────────────────────────────
    if (
      event.event === "on_chat_model_stream" &&
      event.data?.chunk?.content
    ) {
      const text =
        typeof event.data.chunk.content === "string"
          ? event.data.chunk.content
          : event.data.chunk.content?.[0]?.text ?? "";
      if (text) {
        process.stdout.write(text);
        buffer += text;
      }
    }

    // ── Detect HITL interrupt ─────────────────────────────
    if (event.event === "on_chain_end") {
      const output = event.data?.output;
      if (output?.__interrupt__?.length > 0) {
        interrupted = true;
        interruptPayload = output.__interrupt__[0].value;
      }
    }
  }

  console.log("\n");

  // ── If interrupted → prompt human in terminal ─────────
  if (interrupted && interruptPayload) {
    const payload = interruptPayload as Record<string, unknown>;
    console.log("━".repeat(50));
    console.log("🛑 HUMAN-IN-THE-LOOP PAUSE");
    console.log(JSON.stringify(payload, null, 2));
    console.log("━".repeat(50));

    const answer = await promptUser(`\n❓ ${payload.question}\n   Approve? (yes/no): `);
    const approved = answer.trim().toLowerCase() === "yes";

    console.log(approved ? "\n✅ Approved — resuming agent...\n" : "\n❌ Rejected — resuming agent...\n");

    // Resume the graph with the human's decision
    await runWithStreaming(new Command({ resume: approved }));
  }
}

// Simple terminal readline prompt
function promptUser(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

// ── RUN ───────────────────────────────────────────────────────
// Two demo queries to show read + HITL write in action

console.log("═".repeat(55));
console.log("  PM AGENT — LangGraph ReAct + HITL + Streaming");
console.log("═".repeat(55));

// Query 1: read-only, no approval needed
await runWithStreaming(
  "Give me a quick status: what's in the active sprint, who has the most tasks, and are there any critical issues?"
);

// Query 2: write — triggers HITL interrupt
await runWithStreaming(
  "T-005 (API docs) has no owner. Assign it to bob."
);

// ── KEY TAKEAWAYS ─────────────────────────────────────────────
//
// createReactAgent     → prebuilt ReAct loop: think → tool → observe → repeat
//
// MemorySaver          → checkpointer that saves graph state per thread_id
//                        same thread = same memory across multiple .invoke() calls
//
// interrupt(payload)   → pauses the graph at that exact point, serializes state,
//                        surfaces payload in __interrupt__ to the caller
//                        ⚠️  Never wrap in try/catch — it works via exception
//
// Command({resume})    → resumes the paused graph with the human's answer;
//                        that value becomes the return value of interrupt()
//
// streamEvents(v2)     → fine-grained event stream: on_chat_model_stream gives
//                        you tokens; on_chain_end lets you detect __interrupt__
//
// thread_id            → your persistent cursor into checkpointed state.
//                        Change it → fresh conversation. Reuse it → same memory.