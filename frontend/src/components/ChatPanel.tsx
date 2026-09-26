// src/components/ChatPanel.tsx
"use client";

import { useState } from "react";
import { getToken } from "@/lib/api";
import type { AgentResult } from "@/app/console/page";
import ReactMarkdown from "react-markdown";
import { Paperclip, ArrowRight } from "lucide-react";
import AgentPlanPanel from "./AgentPlanPanel";

const EXAMPLES = [
  "Summarize the attached inspection report and flag anomalies",
  "Draft an approval note for the Unit 3 pressure vessel finding",
  "Search the SOP library for pump seal replacement procedure",
];

export default function ChatPanel({
  onResult,
  onGoToReview,
}: {
  onResult: (result: AgentResult) => void;
  onGoToReview: () => void;
}) {
  const [prompt, setPrompt] = useState("");
  const [response, setResponse] = useState("");
  const [docxPath, setDocxPath] = useState("");
  const [citations, setCitations] = useState<{ source: string; score: number }[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [stepsCompleted, setStepsCompleted] = useState<string[]>([]);

  const handleSubmit = async () => {
    if (!prompt.trim()) return;

    setLoading(true);
    setError("");
    setResponse("");
    setDocxPath("");
    setCitations([]);
    setStepsCompleted([]);

    try {
      const token = getToken();
      const res = await fetch("http://localhost:8000/api/agent/run/stream", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ user_input: prompt }),
      });

      if (!res.ok || !res.body) {
        throw new Error(`Request failed with status ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";

        for (const part of parts) {
          const line = part.trim();
          if (!line.startsWith("data:")) continue;

          const event = JSON.parse(line.slice(5).trim());

          if (event.type === "step_complete") {
            setStepsCompleted(event.steps_completed ?? []);
          } else if (event.type === "done") {
            const finalResponse = event.final_output ?? "";
            const finalDocxPath = event.docx_path ?? "";
            const finalCitations = event.citations ?? [];
            setResponse(finalResponse);
            setDocxPath(finalDocxPath);
            setCitations(finalCitations);
            onResult({
              response: finalResponse,
              docxPath: finalDocxPath,
              citations: finalCitations,
            });
          } else if (event.type === "error") {
            throw new Error(event.detail ?? "Agent execution failed");
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="flex h-full">
      <div className="flex-1 flex flex-col min-w-0">
        <div className="flex-1 overflow-y-auto p-6">
          <div>
            <h1 className="text-2xl font-semibold text-[var(--text-primary)]">
              AI Assistant
            </h1>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              Ask about inspection reports, drawings or operating procedures.
              Nothing leaves this server.
            </p>
          </div>

          {!response && !loading && (
            <div className="mt-6 flex flex-col gap-2 max-w-4xl">
              {EXAMPLES.map((ex) => (
                <button
                  key={ex}
                  onClick={() => setPrompt(ex)}
                  className="text-left text-sm px-4 py-3 rounded-xl border transition-colors"
                  style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}
                >
                  {ex}
                </button>
              ))}
            </div>
          )}

          {loading && (
            <div
              className="mt-6 rounded-xl border p-4 max-w-4xl"
              style={{ borderColor: "var(--border)", background: "var(--panel)" }}
            >
              <span className="text-sm font-mono" style={{ color: "var(--text-muted)" }}>
                Processing locally... ({stepsCompleted.length}/6 steps)
              </span>
            </div>
          )}

          {error && (
            <div
              className="mt-6 rounded-xl border p-4 max-w-4xl text-sm"
              style={{ borderColor: "var(--error-border)", background: "var(--error-bg)", color: "var(--error-text)" }}
            >
              {error}
            </div>
          )}

          {response && (
            <div
              className="mt-6 rounded-xl border p-5 max-w-4xl"
              style={{ borderColor: "var(--border)", background: "var(--panel)" }}
            >
              <div className="flex flex-wrap gap-2 mb-4">
                <span
                  className="text-xs font-medium px-2.5 py-1 rounded-full"
                  style={{ background: "var(--accent-soft-bg)", color: "var(--accent-2)" }}
                >
                  Local model - qwen3:8b
                </span>
                {citations.length > 0 && (
                  <span
                    className="text-xs font-medium px-2.5 py-1 rounded-full"
                    style={{ background: "var(--accent-soft-bg)", color: "var(--accent-2)" }}
                  >
                    {citations.length} source{citations.length === 1 ? "" : "s"} cited
                  </span>
                )}
              </div>

              <div className="text-[15px] text-[var(--text-primary)] leading-relaxed [&>p]:mb-3 [&>p:last-child]:mb-0 [&_strong]:font-semibold [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:mb-3 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:mb-3 [&_li]:mb-1">
                <ReactMarkdown>{response}</ReactMarkdown>
              </div>

              {citations.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {citations.map((c, i) => (
                    <span
                      key={i}
                      className="text-xs font-mono px-2 py-1 rounded"
                      style={{ background: "var(--accent-soft-bg)", color: "var(--accent-2)" }}
                    >
                      {c.source} - {c.score.toFixed(3)}
                    </span>
                  ))}
                </div>
              )}

              {docxPath && (
                <div className="mt-4 flex gap-3">
                  <button
                    onClick={onGoToReview}
                    className="flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-lg transition-opacity hover:opacity-90"
                    style={{ background: "var(--accent)", color: "var(--accent-fg)" }}
                  >
                    Open draft in Sign-Off <ArrowRight className="h-4 w-4" />
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="shrink-0 p-6 pt-0">
          <div className="max-w-4xl">
            <div
              className="flex items-end gap-3 rounded-xl border p-3"
              style={{ borderColor: "var(--border)", background: "var(--panel)" }}
            >
              <button
                className="p-2 rounded-lg shrink-0"
                style={{ color: "var(--text-muted)" }}
                title="Attach a file (use Document Vault)"
                disabled
              >
                <Paperclip className="h-4 w-4" />
              </button>
              <textarea
                className="flex-1 resize-none bg-transparent text-[var(--text-primary)] placeholder:text-[var(--text-muted)] text-[15px] focus:outline-none min-h-[24px] max-h-40"
                placeholder="Describe what you need, e.g. check this P&ID for missing isolation valves"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={handleKeyDown}
                rows={1}
              />
              <button
                onClick={handleSubmit}
                disabled={loading || !prompt.trim()}
                className="flex items-center gap-1.5 text-sm font-medium px-4 py-2 rounded-lg transition-opacity hover:opacity-90 disabled:opacity-30 disabled:cursor-not-allowed shrink-0"
                style={{ background: "var(--accent)", color: "var(--accent-fg)" }}
              >
                {loading ? "Asking..." : "Ask"} <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      <AgentPlanPanel stepsCompleted={stepsCompleted} citationCount={citations.length} />
    </div>
  );
}
