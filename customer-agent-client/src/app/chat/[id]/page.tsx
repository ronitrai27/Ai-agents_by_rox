"use client";

import { useState, useEffect, useRef } from "react";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  ArrowUp,
  Square,
  ArrowDown,
  Ellipsis,
  AlertTriangle,
  Shield,
  Activity,
  Terminal,
  Settings,
  ChevronLeft,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { AppCheckpoint, GraphNode } from "@/lib/langGraph/types";
import {
  AgentState,
  InterruptValue,
  ResumeValue,
} from "@/components/ai/AgentTypes";
import { ChatbotNode } from "@/components/ai/ChatbotNode";
import ApprovalCard from "@/components/ai/ApprovalCard";
import { useLangGraphAgent } from "@/lib/langGraph/useLangGraphAgent";

import { OrderAgentNode } from "@/components/ai/OrderAgentNode";
import { RefundAgentNode } from "@/components/ai/RefundAgentNode";

const EXAMPLE_MESSAGES = [
  "What is the status of order ORD-001?",
  "Show all orders for John",
  "Process a refund for ORD-002",
  "Cancel order ORD-003",
];

export default function ChatPage() {
  const params = useParams<{ id: string }>();
  const [threadId] = useState(params.id);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [inputValue, setInputValue] = useState("");
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true);
  const [restoreError, setRestoreError] = useState(false);

  const { status, appCheckpoints, run, resume, restore, stop, restoring } =
    useLangGraphAgent<AgentState, InterruptValue, ResumeValue>();

  // Restore thread on mount
  useEffect(() => {
    if (threadId) {
      restore(threadId).catch(() => setRestoreError(true));
    }
  }, [threadId]);

  // Focus input when idle
  useEffect(() => {
    if (status !== "running" && !restoring) {
      inputRef.current?.focus();
    }
  }, [status, restoring]);

  // Auto-scroll on new content
  useEffect(() => {
    if (shouldAutoScroll) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [appCheckpoints, shouldAutoScroll]);

  // Scroll button visibility
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handler = () => {
      const isAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
      setShowScrollButton(!isAtBottom);
      setShouldAutoScroll(isAtBottom);
    };
    el.addEventListener("scroll", handler);
    return () => el.removeEventListener("scroll", handler);
  }, []);

  const sendMessage = (content: string) => {
    if (!content.trim() || status === "running" || restoring) return;
    setRestoreError(false);
    run({
      thread_id: threadId,
      state: { messages: [{ type: "user", content }] },
    });
  };

  const handleResume = (resumeValue: ResumeValue) => {
    resume({ thread_id: threadId, resume: resumeValue });
  };

  const renderNode = (
    checkpoint: AppCheckpoint<AgentState, InterruptValue>,
    node: GraphNode<AgentState>,
  ): React.ReactNode => {
    switch (node.name) {
      case "__start__":
      case "supervisor":
        // Supervisor produces the assistant message bubbles
        return <ChatbotNode nodeState={node.state} />;

      case "order_agent":
        return <OrderAgentNode nodeState={node.state} />;

      case "refund_agent":
        return <RefundAgentNode nodeState={node.state} />;

      case "update_order":
        // HITL — only renders when graph is paused waiting for approval
        if (!checkpoint.interruptValue) return null;
        return (
          <ApprovalCard
            interruptValue={checkpoint.interruptValue}
            onResume={handleResume}
          />
        );

      default:
        return null;
    }
  };

  const isDisabled = status === "running" || restoring;

  return (
    <div className="flex flex-col h-screen bg-neutral-100 text-slate-900 font-mono">
      <header className="flex-shrink-0 bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between shadow-sm z-20">
        <div className="flex items-center gap-4">
          <h1 className="text-lg font-sans font-bold tracking-tight">
            ROX - Customer Agent
          </h1>
          <div className="h-4 w-px bg-slate-200" />

          <div className="flex items-center gap-2 text-slate-500">
            <Activity className="w-4 h-4" />
            <div className="flex flex-col">
              <span className="text-[9px] uppercase tracking-tighter leading-none text-slate-400">
                System Status
              </span>
              <span
                className={cn(
                  "text-[10px] font-bold uppercase",
                  status === "running" ? "text-amber-500" : "text-emerald-500",
                )}
              >
                {status === "running" ? "Executing..." : "Ready"}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-6">
          <div className="hidden md:flex flex-col items-end">
            <span className="text-[9px] text-slate-400 uppercase tracking-tighter">
              Current Session
            </span>
            <span className="text-[10px] font-bold text-slate-600">
              {threadId?.slice(0, 12)}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-slate-400"
            >
              <Settings className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </header>

      {/* Messages Viewport */}
      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-200"
      >
        <div className="max-w-4xl mx-auto w-full px-6 py-10 space-y-8">
          {/* System Welcome Message (Sticky at top of history) */}
          <div className="flex items-center gap-2 text-[10px] text-slate-400 justify-center mb-10">
            <Terminal className="w-3 h-3" />
            <span className="uppercase tracking-[0.2em]">
              Secure Session Initialized // v2.4.0
            </span>
          </div>
          {appCheckpoints.map((checkpoint) =>
            checkpoint.error ? (
              <div
                key={checkpoint.checkpointConfig.configurable.checkpoint_id}
                className="text-sm text-red-500 font-medium p-2 bg-red-50 rounded-md flex items-center gap-2"
              >
                <AlertTriangle className="h-4 w-4" />
                Something went wrong. Please try again.
              </div>
            ) : (
              checkpoint.nodes.map((node, i) => (
                <div
                  key={`${checkpoint.checkpointConfig.configurable.checkpoint_id}-${i}`}
                >
                  {renderNode(checkpoint, node)}
                </div>
              ))
            ),
          )}

          {(status === "running" || restoring) && (
            <div className="flex items-center justify-center p-4">
              <Ellipsis className="w-6 h-6 text-muted-foreground animate-pulse" />
            </div>
          )}

          {status === "error" && (
            <div className="text-sm text-red-500 font-medium p-2 bg-red-50 rounded-md flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              Error running agent.
            </div>
          )}

          {restoreError && (
            <div className="text-sm text-red-500 font-medium p-2 bg-red-50 rounded-md flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              Could not restore chat. Is the agent server running?
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Floating Scroll Button */}
      {showScrollButton && (
        <Button
          className="fixed bottom-32 right-10 rounded-full shadow-xl animate-in fade-in zoom-in slide-in-from-bottom-2"
          size="icon"
          variant="secondary"
          onClick={() =>
            messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
          }
        >
          <ArrowDown className="w-5 h-5" />
        </Button>
      )}

      {/* Modernized Input Footer */}
      <footer className="flex-shrink-0 p-6 bg-gradient-to-t from-white via-white to-transparent pb-8">
        <div className="max-w-4xl mx-auto">
          {/* Quick Actions */}
          <div className="flex flex-wrap gap-2 mb-4 justify-center">
            {EXAMPLE_MESSAGES.map((msg) => (
              <Button
                key={msg}
                variant="outline"
                size="sm"
                onClick={() => sendMessage(msg)}
                disabled={isDisabled}
                className="text-[10px] font-bold uppercase tracking-wider h-8 bg-white/50 backdrop-blur border-slate-200 hover:bg-slate-900 hover:text-white transition-all shadow-sm"
              >
                {msg}
              </Button>
            ))}
          </div>

          <div className="group relative bg-white rounded-xl border border-slate-300 shadow-lg focus-within:border-slate-900 focus-within:ring-4 focus-within:ring-slate-900/5 transition-all overflow-hidden">
            <div className="absolute left-4 top-4 text-slate-300">
              <Terminal className="w-5 h-5" />
            </div>
            <Textarea
              ref={inputRef}
              className="w-full min-h-[60px] pl-12 pr-24 py-4 resize-none border-none focus-visible:ring-0 bg-transparent text-sm"
              placeholder="System command or query..."
              value={inputValue}
              disabled={isDisabled}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage(inputValue);
                  setInputValue("");
                }
              }}
            />

            <div className="absolute right-3 bottom-3 flex items-center gap-2">
              {status === "running" ? (
                <Button
                  className="rounded-xl h-10 w-10 shadow-lg"
                  size="icon"
                  variant="destructive"
                  onClick={() => stop(threadId)}
                >
                  <Square className="h-4 w-4" />
                </Button>
              ) : (
                <Button
                  className="rounded-xl h-10 w-10 shadow-lg bg-slate-900 hover:bg-slate-800"
                  size="icon"
                  disabled={!inputValue.trim() || restoring}
                  onClick={() => {
                    sendMessage(inputValue);
                    setInputValue("");
                  }}
                >
                  <ArrowUp className="h-5 h-5" />
                </Button>
              )}
            </div>
          </div>

          <div className="mt-3 flex items-center justify-center gap-4 text-[9px] text-slate-400 uppercase tracking-widest font-bold">
            <span>LangGraph Core</span>
            <span className="w-1 h-1 rounded-full bg-slate-200" />
            <span>Subagent Mesh</span>
            <span className="w-1 h-1 rounded-full bg-slate-200" />
            <span>GPT-4o Optimized</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
