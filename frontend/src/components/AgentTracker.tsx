// src/components/AgentTracker.tsx
"use client";

const STAGES = [
  "Understand",
  "Plan",
  "Retrieve",
  "Reason",
  "Validate",
  "Generate",
] as const;

export default function AgentTracker({ activeIndex }: { activeIndex: number }) {
  return (
    <div className="flex items-center gap-0 mb-2">
      {STAGES.map((stage, i) => {
        const done = i < activeIndex;
        const active = i === activeIndex;
        return (
          <div key={stage} className="flex items-center flex-1 last:flex-none">
            <div className="flex flex-col items-start gap-1.5 min-w-fit">
              <span
                className={`h-1.5 w-1.5 rounded-full transition-colors ${
                  done
                    ? "bg-[#2FD9C3]"
                    : active
                    ? "bg-[#2FD9C3] animate-pulse"
                    : "bg-[#1E262C]"
                }`}
              />
              <span
                className={`text-xs font-mono whitespace-nowrap transition-colors ${
                  done || active ? "text-[#8B98A3]" : "text-[#3A434B]"
                }`}
              >
                {stage}
              </span>
            </div>
            {i < STAGES.length - 1 && (
              <div
                className={`h-px flex-1 mx-2 mb-4 transition-colors ${
                  done ? "bg-[#2FD9C3]/40" : "bg-[#1E262C]"
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}