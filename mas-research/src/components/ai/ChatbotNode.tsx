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
              "group relative flex flex-col gap-3 py-4 px-6 transition-all duration-300",
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
                <div className="text-[10px] font-bold uppercase text-neutral-500 tracking-[0.2em]">
                  {isAI ? "AI_RESEARCH_ASSISTANT" : "USER_OPERATOR"}
                </div>
              </div>

              {isAI && msg.content && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity text-neutral-500 hover:text-emerald-400"
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

            {isAI && (
              <div className="absolute top-0 right-0 p-1">
                <div className="text-[8px] text-neutral-800 font-bold uppercase tracking-tighter">
                  Rights: Research_Agent_v1
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// --------------------------------------------------------------------
// import { AgentState } from "@/components/ai/AgentTypes";
// import { User, Sparkles, Brain } from "lucide-react";
// import { cn } from "@/lib/utils";
// import ReactMarkdown from "react-markdown";
// import remarkGfm from "remark-gfm";

// interface ChatbotNodeProps {
//   nodeState: Partial<AgentState>;
// }

// export function ChatbotNode({ nodeState }: ChatbotNodeProps) {
//   const getMessageTheme = (type: string) => {
//     switch (type) {
//       case "ai":
//       case "assistant":
//         return {
//           icon: <Brain className="h-5 w-5 text-blue-600" />,
//           container: "bg-white border border-blue-50",
//           bubble: "text-gray-800",
//           iconBg: "bg-blue-50",
//         };
//       case "user":
//       case "human":
//         return {
//           icon: <User className="h-5 w-5 text-gray-600" />,
//           container: "bg-gray-50/50 border border-gray-100",
//           bubble: "text-gray-700",
//           iconBg: "bg-gray-100",
//         };
//       default:
//         return {
//           icon: <Sparkles className="h-5 w-5 text-purple-600" />,
//           container: "bg-white border border-purple-50",
//           bubble: "text-gray-800",
//           iconBg: "bg-purple-50",
//         };
//     }
//   };

//   return (
//     <div className="space-y-6 my-6">
//       {nodeState?.messages?.map((msg, index) => {
//         const theme = getMessageTheme(msg.type);
//         return (
//           <div
//             key={msg.id ?? index}
//             className={cn(
//               "flex items-start gap-4 p-4 rounded-3xl transition-all duration-300",
//               theme.container,
//             )}
//           >
//             <div
//               className={cn(
//                 "flex-shrink-0 flex items-center justify-center w-10 h-10 rounded-2xl shadow-sm",
//                 theme.iconBg,
//               )}
//             >
//               {theme.icon}
//             </div>
//             <div className="flex-1 min-w-0 pt-1">
//               <div className="prose prose-sm max-w-none">
//                 <ReactMarkdown
//                   remarkPlugins={[remarkGfm]}
//                   components={{
//                     p: ({ children }) => (
//                       <p className="mb-4 last:mb-0 leading-relaxed text-sm">
//                         {children}
//                       </p>
//                     ),
//                     h1: ({ children }) => (
//                       <h1 className="text-xl font-bold mb-4 text-gray-900 border-b pb-2">
//                         {children}
//                       </h1>
//                     ),
//                     h2: ({ children }) => (
//                       <h2 className="text-lg font-bold mb-3 text-gray-800">
//                         {children}
//                       </h2>
//                     ),
//                     ul: ({ children }) => (
//                       <ul className="list-disc pl-5 mb-4 space-y-2">
//                         {children}
//                       </ul>
//                     ),
//                     ol: ({ children }) => (
//                       <ol className="list-decimal pl-5 mb-4 space-y-2">
//                         {children}
//                       </ol>
//                     ),
//                     code: ({ children, className }) => {
//                       const isInline = !className?.includes("language-");
//                       return (
//                         <code
//                           className={cn(
//                             "font-mono text-xs rounded px-1.5 py-0.5",
//                             isInline
//                               ? "bg-gray-100 text-gray-800"
//                               : "block bg-gray-900 text-gray-100 p-4 my-4 overflow-x-auto shadow-inner",
//                           )}
//                         >
//                           {children}
//                         </code>
//                       );
//                     },
//                   }}
//                 >
//                   {msg.content}
//                 </ReactMarkdown>
//               </div>
//             </div>
//           </div>
//         );
//       })}
//     </div>
//   );
// }
