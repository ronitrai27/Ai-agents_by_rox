import { useState } from "react";
import { AgentState } from "@/components/ai/AgentTypes";
import { cn } from "@/lib/utils";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Copy, Check, User, Bot } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ChatbotNodeProps {
  nodeState: Partial<AgentState>;
}

export function ChatbotNode({ nodeState }: ChatbotNodeProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="space-y-4 my-1 font-mono">
      {nodeState?.messages?.map((msg, index) => {
        const isAI = msg.type === "ai";
        const msgId = msg.id ?? `msg-${index}`;

        return (
          <div
            key={msgId}
            className={cn(
              "group relative flex flex-col gap-3 py-4 px-6 transition-all duration-300 font-sans",
              isAI ? "" : "",
            )}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div
                  className={cn(
                    "p-1 rounded",
                    isAI
                      ? "bg-emerald-500/10 text-emerald-500"
                      : "bg-neutral-800 text-neutral-400",
                  )}
                >
                  {isAI ? <Bot size={12} /> : <User size={12} />}
                </div>
                <div className="text-[11px] font-mono font-bold uppercase text-neutral-500 tracking-[0.2em]">
                  {isAI ? "AI_RESEARCH_ASSISTANT" : "USER_OPERATOR"}
                </div>
              </div>

              {isAI && msg.content && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6  transition-opacity text-neutral-500 hover:text-emerald-400"
                  onClick={() => copyToClipboard(msg.content, msgId)}
                >
                  {copiedId === msgId ? (
                    <Check size={12} />
                  ) : (
                    <Copy size={12} />
                  )}
                </Button>
              )}
            </div>

            <div
              className={cn(
                "text-sm leading-relaxed max-w-none prose prose-invert prose-emerald",
                isAI ? "text-neutral-200" : "text-neutral-400 italic",
              )}
            >
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {msg.content}
              </ReactMarkdown>
            </div>
          </div>
        );
      })}
    </div>
  );
}
