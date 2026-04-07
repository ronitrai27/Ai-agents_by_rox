// ============================================================
// LESSON: STRUCTURED OUTPUT  (02_structured.ts)
//
// WHAT YOU'LL LEARN:
//   1. Zod enums to constrain AI output to known values
//   2. withStructuredOutput — always returns typed data, never free text
//   3. Arrays with min/max bounds — AI picks N items from your allowed list
//   4. Confidence scores + nullable fields
// ============================================================

import "dotenv/config";
import { initChatModel } from "langchain";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { z } from "zod";

const model = await initChatModel("gpt-4.1-nano", { modelProvider: "openai" });

// ── DOMAIN DATA ──────────────────────────────────────────────
const AVAILABLE_TAGS = [
  "Productivity",
  "AI",
  "Healthcare",
  "Edutech",
  "Fintech",
  "Web3",
  "Agents",
  "SaaS",
  "E-commerce",
  "Social Media",
  "Developer Tools",
  "Open Source",
  "Machine Learning",
  "Data Science",
  "Blockchain",
  "Crypto",
  "DeFi",
  "NFT",
  "Metaverse",
  "Gaming",
  "AR/VR",
  "Mobile App",
  "Web App",
  "Desktop App",
  "CLI",
  "API",
  "Library",
  "Framework",
  "CMS",
  "CRM",
  "Automation",
  "Cybersecurity",
  "Database",
  "Cloud",
  "DevOps",
  "Analytics",
  "Marketing",
  "SEO",
  "Design",
  "UX/UI",
  "Education",
  "Research",
  "Environment",
  "Sustainability",
  "Non-profit",
  "Community",
] as const;

const ROLES = [
  "frontend developer",
  "backend developer",
  "fullstack developer",
  "devops engineer",
  "site reliability engineer",
  "cloud engineer",
  "cloud architect",
  "data scientist",
  "machine learning engineer",
  "AI engineer",
  "mobile developer (iOS)",
  "mobile developer (Android)",
  "cross-platform mobile developer",
  "flutter developer",
  "react native developer",
  "game developer",
  "unity developer",
  "unreal engine developer",
  "embedded systems engineer",
  "hardware engineer",
  "robotics engineer",
  "AR/VR developer",
  "computer vision engineer",
  "blockchain developer",
  "solidity developer",
  "web3 developer",
  "cybersecurity engineer",
  "network engineer",
  "systems administrator",
  "database administrator",
  "QA engineer",
  "test automation engineer",
  "API developer",
  "kubernetes administrator",
  "salesforce developer",
  "IoT engineer",
  "MLOps engineer",
  "CRM developer",
  "generative AI engineer",
  "UX/UI designer",
  "enterprise architect",
  "software architect",
] as const;


type Role = (typeof ROLES)[number];
type Tag = (typeof AVAILABLE_TAGS)[number];

// ── SCHEMA ────────────────────────────────────────────────────

const ProjectMatch = z.object({
  relevantRoles: z
    .array(z.enum(ROLES as unknown as [string, ...string[]]))
    .min(1)
    .max(3)
    .describe("1-3 developer roles most relevant to this search query"),

  relevantTags: z
    .array(z.enum(AVAILABLE_TAGS as unknown as [string, ...string[]]))
    .min(2)
    .max(4)
    .describe("2-4 project category tags that match this search (ordered by relevance)"),

  confidence: z
    .number()
    .min(0)
    .max(1)
    .describe("Confidence score 0-1 — how well the query maps to known roles/tags"),

  similarRoles: z
    .array(z.enum(ROLES as unknown as [string, ...string[]]))
    .max(3)
    .describe("Other related roles the user might also be interested in"),
});

type ProjectMatch = z.infer<typeof ProjectMatch>;

// ── CHAIN ─────────────────────────────────────────────────────

const prompt = ChatPromptTemplate.fromMessages([
  [
    "system",
    `You are a search assistant for a developer project platform.
Available roles: ${ROLES.join(", ")}
Available tags: ${AVAILABLE_TAGS.join(", ")}

Analyze the user's search query and extract matching roles and tags.
Only return values from the provided lists. Never invent new roles or tags.`,
  ],
  ["human", "{query}"],
]);

const chain = prompt.pipe(model.withStructuredOutput(ProjectMatch));

// ── RUN ───────────────────────────────────────────────────────

const result: ProjectMatch = await chain.invoke({
  query: "looking for web3 projects with backend role",
});

console.log("Relevant Roles:", result.relevantRoles);
console.log("Relevant Tags: ", result.relevantTags);
console.log("Confidence:    ", result.confidence);
console.log("Similar Roles: ", result.similarRoles);

// ── KEY TAKEAWAYS ─────────────────────────────────────────────
//
// z.enum(ROLES)                   → AI can ONLY return values from your list
// z.array(...).min(1).max(3)      → bounds on array length, enforced by Zod
// z.enum(ROLES).nullable()        → AI returns null when nothing matches
// type X = z.infer<typeof Schema> → free TypeScript type, no duplication