// src/components/AgentPlanPanel.tsx
"use client";

const STEPS = [
  { key: "understand", label: "Classify task", tool: "Qwen3-8B" },
  { key: "plan", label: "Plan approach", tool: "LangGraph" },
  { key: "retrieve", label: "Retrieve SOP evidence", tool: "Qdrant" },
  { key: "reason", label: "Draft findings", tool: "Qwen3-8B" },
  { key: "validate", label: "Validate citations", tool: "checker" },
  { key: "generate", label: "Build Word note", tool: "python-docx" },
];

export default function AgentPlanPanel({
  stepsCompleted,
  citationCount,
}: {
  stepsCompleted: string[];
  citationCount: number;
}) {
  return (
    <aside className="w-72 shrink-0 flex flex-col gap-4 p-4">
      <div
        className="rounded-xl border p-4"
        style={{ borderColor: "var(--border)", background: "var(--panel)" }}
      >
        <span
          className="text-xs font-medium uppercase tracking-wide"
          style={{ color: "var(--text-faint)" }}
        >
          Agent plan
        </span>
        <div className="mt-3 flex flex-col gap-3">
          {STEPS.map((step) => {
            const done = stepsCompleted.includes(step.key);
            return (
              <div key={step.key} className="flex items-start gap-2.5">
                <span
                  className="mt-1.5 h-1.5 w-1.5 rounded-full shrink-0"
                  style={{
                    background: done ? "var(--accent)" : "var(--border)",
                  }}
                />
                <div>
                  <p
                    className="text-sm"
                    style={{
                      color: done ? "var(--text-primary)" : "var(--text-muted)",
                      fontWeight: done ? 500 : 400,
                    }}
                  >
                    {step.label}
                  </p>
                  <p className="text-xs font-mono" style={{ color: "var(--text-faint)" }}>
                    {step.tool}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div
        className="rounded-xl border p-4"
        style={{ borderColor: "var(--border)", background: "var(--panel)" }}
      >
        <span
          className="text-xs font-medium uppercase tracking-wide"
          style={{ color: "var(--text-faint)" }}
        >
          This run
        </span>
        <div className="mt-3 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-sm text-[var(--text-secondary)]">Steps completed</span>
            <span className="text-sm font-mono text-[var(--text-primary)]">
              {stepsCompleted.length}/6
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-[var(--text-secondary)]">Sources cited</span>
            <span className="text-sm font-mono text-[var(--text-primary)]">
              {citationCount}
            </span>
          </div>
        </div>
      </div>
    </aside>
  );
}