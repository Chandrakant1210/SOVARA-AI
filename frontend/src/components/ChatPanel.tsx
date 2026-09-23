// src/components/ChatPanel.tsx
"use client";

import { useState } from "react";
import AgentTracker from "./AgentTracker";
import { getToken } from "@/lib/api";

const EXAMPLES = [
  "Summarize the attached inspection report and flag anomalies",
  "Draft an approval note for the Unit 3 pressure vessel finding",
  "Search the SOP library for pump seal replacement procedure",
];

const STAGES = ["understand", "plan", "retrieve", "reason", "validate", "generate"];

export default function ChatPanel() {
  const [prompt, setPrompt] = useState("");
  const [response, setResponse] = useState("");
  const [docxPath, setDocxPath] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [stageIndex, setStageIndex] = useState(0);

  const handleSubmit = async () => {
    if (!prompt.trim()) return;

    setLoading(true);
    setError("");
    setResponse("");
    setDocxPath("");
    setStageIndex(0);

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

          const jsonStr = line.slice(5).trim();
          const event = JSON.parse(jsonStr);

          if (event.type === "step_complete") {
            const idx = STAGES.indexOf(event.node);
            if (idx !== -1) setStageIndex(idx);
          } else if (event.type === "done") {
            setStageIndex(STAGES.length - 1);
            setResponse(event.final_output ?? "");
            setDocxPath(event.docx_path ?? "");
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
    <div
      className="flex flex-col h-full items-center justify-center px-8 py-14"
      style={{
        backgroundImage: "radial-gradient(circle, #161C22 1px, transparent 1px)",
        backgroundSize: "28px 28px",
      }}
    >
      <div className="w-full max-w-xl">
        <h1 className="text-2xl font-medium text-[#E7ECEF] tracking-tight">
          Ask SOVARA
        </h1>
        <p className="mt-2 text-sm text-[#8B98A3] leading-relaxed">
          Every request here is processed on local infrastructure. Nothing
          in this conversation leaves MRPL&apos;s network.
        </p>

        {!response && !loading && (
          <div className="mt-6 flex flex-col gap-2">
            {EXAMPLES.map((ex) => (
              <button
                key={ex}
                onClick={() => setPrompt(ex)}
                className="text-left text-sm text-[#8B98A3] border border-[#1E262C] rounded-sm px-3 py-2 hover:border-[#2FD9C3]/50 hover:text-[#E7ECEF] transition-colors"
              >
                {ex}
              </button>
            ))}
          </div>
        )}

        <div className="mt-6 flex flex-col gap-3">
          <textarea
            className="w-full min-h-[140px] resize-y rounded-sm bg-[#10151A] border border-[#1E262C] text-[#E7ECEF] placeholder:text-[#5B6670] p-4 text-[15px] leading-relaxed focus:outline-none focus:border-[#2FD9C3]/60 transition-colors"
            placeholder="Describe the task — a P&ID query, an inspection report to review, a document to draft..."
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={handleKeyDown}
          />

          <div className="flex items-center justify-between">
            <span className="text-xs text-[#5B6670] font-mono">⌘ + Enter to send</span>
            <button
              onClick={handleSubmit}
              disabled={loading || !prompt.trim()}
              className="bg-[#2FD9C3] text-[#0A0E12] font-medium text-sm px-5 py-2.5 rounded-sm hover:bg-[#4FE5D1] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? "Processing locally…" : "Send"}
            </button>
          </div>

          {loading && (
            <div className="mt-4 pt-4 border-t border-[#1E262C]">
              <AgentTracker activeIndex={stageIndex} />
            </div>
          )}

          {error && (
            <div className="mt-2 rounded-sm border border-[#4A2A2A] bg-[#1A1010] p-3 text-sm text-[#E5A3A3]">
              <span className="font-mono text-xs text-[#B87A7A] block mb-1">Request failed</span>
              {error}
            </div>
          )}

          {response && (
            <div className="mt-2 rounded-sm border border-[#1E262C] bg-[#10151A] p-4">
              <span className="font-mono text-xs text-[#5B6670] block mb-2">
                response · local model
              </span>
              <p className="text-[15px] text-[#E7ECEF] leading-relaxed whitespace-pre-wrap">
                {response}
              </p>
              {docxPath && (
                <p className="mt-3 text-xs text-[#5B6670] font-mono">
                  Generated document: {docxPath}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}