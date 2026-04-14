"use client";

import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { FileText, Loader2, CheckCircle2, Download, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";

interface DocumentStatusCardProps {
  statusData: {
    agent: string;
    status: string;
    filename?: string;
    path?: string;
    is_done?: boolean;
    start_time?: number;
  };
}

export function DocumentStatusCard({ statusData }: DocumentStatusCardProps) {
  const [elapsed, setElapsed] = useState<string>("0.0s");

  useEffect(() => {
    if (!statusData.start_time || statusData.is_done) return;
    const interval = setInterval(() => {
      const seconds = (Date.now() / 1000 - statusData.start_time!).toFixed(1);
      setElapsed(`${seconds}s`);
    }, 100);
    return () => clearInterval(interval);
  }, [statusData.start_time, statusData.is_done]);

  const isRendering = statusData.agent === "doc_render" && !statusData.is_done;
  const isComplete = statusData.is_done;

  return (
    <div className={cn(
      "my-3 p-4 border font-mono transition-all duration-500",
      isComplete 
        ? "border-emerald-500/30 bg-emerald-500/5 shadow-[0_0_20px_rgba(16,185,129,0.05)]" 
        : "border-neutral-800 bg-neutral-900/20"
    )}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className={cn(
            "p-2 rounded-lg",
            isComplete ? "bg-emerald-500/20 text-emerald-400" : "bg-neutral-800 text-neutral-400"
          )}>
            {isComplete ? <CheckCircle2 className="w-5 h-5" /> : <Loader2 className="w-5 h-5 animate-spin" />}
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-widest text-neutral-500 font-bold">
              {statusData.agent?.replace("_", " ")}
            </div>
            <div className={cn(
              "text-xs font-bold",
              isComplete ? "text-emerald-400" : "text-neutral-200"
            )}>
              {statusData.status}
            </div>
          </div>
        </div>
        {!isComplete && (
          <div className="text-[10px] font-bold text-neutral-500 bg-neutral-800 px-2 py-1">
            {elapsed}
          </div>
        )}
      </div>

      {statusData.filename && (
        <div className="flex items-center justify-between p-3 bg-black/40 border border-neutral-800 rounded-sm">
          <div className="flex items-center gap-3 overflow-hidden">
            <FileText className="w-4 h-4 text-neutral-500 shrink-0" />
            <span className="text-xs text-neutral-300 truncate font-bold uppercase tracking-tight">
              {statusData.filename}.docx
            </span>
          </div>
          
          {isComplete && (
            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-[10px] uppercase border border-neutral-800 text-neutral-400 hover:text-emerald-400"
                onClick={() => {
                   // Mock download / Logic can be added here if path is public
                   alert(`Downloading document: ${statusData.filename}.docx`);
                }}
              >
                <Download className="w-3 h-3 mr-2" />
                Download
              </Button>
            </div>
          )}
        </div>
      )}

      {!isComplete && isRendering && (
        <div className="mt-4 h-1 bg-neutral-800 overflow-hidden rounded-full">
          <div className="h-full bg-emerald-500 animate-pulse w-full" />
        </div>
      )}
    </div>
  );
}
