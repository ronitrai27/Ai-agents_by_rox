"use client";

import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";

interface ResearchAgentNodeProps {
  agentId: string;
  statusData: {
    agent: string;
    model?: string;
    status: string;
    query?: string;
    start_time?: number;
    is_done?: boolean;
  };
}

export function ResearchAgentNode({ agentId, statusData }: ResearchAgentNodeProps) {
  const [elapsed, setElapsed] = useState<string>("0.0s");

  useEffect(() => {
    if (!statusData.start_time || statusData.is_done) return;

    const interval = setInterval(() => {
      const seconds = (Date.now() / 1000 - statusData.start_time!).toFixed(1);
      setElapsed(`${seconds}s`);
    }, 100);

    return () => clearInterval(interval);
  }, [statusData.start_time, statusData.is_done]);

  const displayTime = statusData.is_done ? "" : elapsed;

  return (
    <div className={cn(
      "my-3 p-4 border font-mono transition-all duration-500",
      statusData.is_done 
        ? "border-neutral-900 bg-neutral-900/10 opacity-60" 
        : "border-neutral-800 bg-background text-neutral-100 shadow-[0_0_20px_rgba(0,0,0,0.5)]"
    )}>
      <div className="flex justify-between items-center opacity-40 mb-3 border-b border-neutral-900 pb-2">
        <div className="flex gap-3">
          <span className="text-[10px] font-bold tracking-widest">{statusData.agent?.toUpperCase()}</span>
          {statusData.model && <span className="text-neutral-500 text-[9px] font-bold">[{statusData.model}]</span>}
        </div>
        <div className="flex gap-4">
          {displayTime && <span className="text-neutral-400 font-bold tabular-nums text-[10px]">{displayTime}</span>}
          <div className="flex items-center gap-2">
            {!statusData.is_done && <div className="w-1 h-1 bg-emerald-500 rounded-full animate-pulse" />}
            <span className={cn("text-[10px] font-bold tracking-tighter", 
              statusData.is_done ? "text-neutral-600" : "text-emerald-500"
            )}>
              [{statusData.is_done ? "COMPLETED" : "EXECUTING"}]
            </span>
          </div>
        </div>
      </div>
      <div className="space-y-1.5">
        <div className="flex items-start gap-3">
          <span className="text-[9px] text-neutral-600 font-black mt-0.5">TASK //</span>
          <span className="text-xs text-neutral-300 leading-tight uppercase tracking-tight">{statusData.status}</span>
        </div>
        {statusData.query && (
          <div className="flex items-start gap-3 opacity-80">
            <span className="text-[9px] text-neutral-600 font-black mt-0.5">ARGS //</span>
            <span className="text-[10px] text-neutral-500 truncate leading-tight italic">{statusData.query}</span>
          </div>
        )}
      </div>
    </div>
  );
}
