"use client";

import { Banknote, Clock } from "lucide-react";
import { AgentState } from "./AgentTypes";

interface RefundAgentNodeProps {
  nodeState: Partial<AgentState>;
}

export function RefundAgentNode({ nodeState }: RefundAgentNodeProps) {
  const status = nodeState.agent_status;
  const isWorking = !!status;

  return (
    <div className="flex justify-start my-2">
      <div className="w-full max-w-[280px] rounded-xl border border-rose-100 bg-white shadow-sm overflow-hidden animate-in fade-in slide-in-from-left-1 duration-200">
        {/* Compact Header */}
        <div className="px-3 py-1.5 bg-rose-50/50 border-b border-rose-50 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Banknote className="w-3.5 h-3.5 text-rose-600" />
            <span className="text-[10px] font-bold text-rose-900 font-mono uppercase tracking-tighter">
              Refund Specialist
            </span>
          </div>
          {isWorking && (
             <Clock className="w-3 h-3 text-rose-400 animate-spin" />
          )}
        </div>

        {/* Content */}
        <div className="px-3 py-2 space-y-3">
          {status?.status && (
            <div className="text-[11px] text-rose-800 font-medium leading-tight bg-rose-50/30 p-2 rounded-lg border border-rose-50/50 w-full italic">
              "{status.status}"
            </div>
          )}

          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[9px] text-gray-400 font-mono uppercase tracking-widest">
              <span>Financial Log</span>
              <span>v1.0.0</span>
            </div>
            <div className="h-[1px] bg-gray-100 w-full" />
            <div className="flex items-center gap-1.5 text-[9px] text-gray-300 font-mono truncate uppercase">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-pulse" />
                Live: Payment Gateway
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
