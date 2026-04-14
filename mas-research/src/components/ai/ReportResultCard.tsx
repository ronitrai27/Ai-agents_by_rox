"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Copy, Check, FileText, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface ReportResultCardProps {
  report: string;
  filename: string;
}

export function ReportResultCard({ report, filename }: ReportResultCardProps) {
  const [copied, setCopied] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(report);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="my-6 border border-neutral-800 bg-neutral-900/10 font-mono shadow-2xl">
      <div className="flex items-center justify-between p-4 bg-neutral-900/40 border-b border-neutral-800">
        <div className="flex items-center gap-3">
          <div className="bg-emerald-500/10 p-2 rounded border border-emerald-500/20">
            <FileText className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-neutral-500 font-bold">
              FINAL_REPORT_CORE_OUTPUT
            </div>
            <div className="text-xs text-neutral-200 font-bold truncate max-w-[200px] uppercase">
              {filename}.MD
            </div>
          </div>
        </div>
        
        <div className="flex gap-2">
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              "h-8 text-[10px] uppercase border px-3 rounded-none transition-all duration-300",
              copied ? "border-emerald-500 text-emerald-500" : "border-neutral-700 text-neutral-400 hover:border-neutral-500"
            )}
            onClick={handleCopy}
          >
            {copied ? (
              <><Check className="w-3 h-3 mr-2" /> Copied</>
            ) : (
              <><Copy className="w-3 h-3 mr-2" /> Copy Markdown</>
            )}
          </Button>
        </div>
      </div>

      <div className={cn(
        "relative overflow-hidden transition-all duration-700",
        isExpanded ? "max-h-[2000px]" : "max-h-[400px]"
      )}>
        <div className="p-6 prose prose-invert prose-sm max-w-none text-neutral-300 prose-headings:text-neutral-100 prose-headings:uppercase prose-headings:tracking-tighter prose-strong:text-emerald-400/80">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {report}
          </ReactMarkdown>
        </div>
        
        {!isExpanded && (
          <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-neutral-950 to-transparent flex items-end justify-center pb-4">
            <Button
              variant="ghost"
              size="sm"
              className="text-[10px] uppercase font-bold tracking-widest text-emerald-400 hover:text-emerald-300 bg-black/40 backdrop-blur-sm border border-emerald-500/20 px-6 h-8 rounded-none"
              onClick={() => setIsExpanded(true)}
            >
              <ChevronDown className="w-4 h-4 mr-2" />
              Expand Full Report
            </Button>
          </div>
        )}
      </div>

      {isExpanded && (
        <div className="p-4 border-t border-neutral-800 flex justify-center bg-neutral-900/20">
          <Button
            variant="ghost"
            size="sm"
            className="text-[10px] uppercase font-bold tracking-widest text-neutral-500 hover:text-neutral-300 h-8"
            onClick={() => setIsExpanded(false)}
          >
            <ChevronUp className="w-4 h-4 mr-2" />
            Collapse Preview
          </Button>
        </div>
      )}
    </div>
  );
}
