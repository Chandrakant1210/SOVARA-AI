// src/components/ChatPanel.tsx
"use client";

import { useState, useRef } from "react";
import AgentTracker from "./AgentTracker";

const EXAMPLES = [
  "Summarize the attached inspection report and flag anomalies",
  "Draft an approval note for the Unit 3 pressure vessel finding",
  "Search the SOP library for pump seal replacement procedure",
];

const STAGE_COUNT = 6;
const STAGE_DURATION_MS = 350;

export default function ChatPanel() {
  const [prompt, setPrompt] = useState("");
  const [response, setResponse] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [stageIndex, setStageIndex] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const runStageAnimation = () => {
    setStageIndex(0);
    timerRef.current = setInterval(() => {
      setStageIndex((prev) => {
        if (prev >= STAGE_COUNT - 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          return prev;
        }
        return prev + 1;
      });
    }, STAGE_DURATION_MS);
  };

  const handleSubmit = async () => {
    if (!prompt.trim()) return;

    setLoading(true);
    setError("");
    setResponse("");
    runStageAnimation();

    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"}/api/chat`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt }),
        }
      );

      if (!res.ok) {
        const errBody = await res.json().catch(() => null);
        throw new Error(errBody?.detail ?? `Request failed with status ${res.status}`);
      }

      const data = await res.json();
      setResponse(data.response);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      if (timerRef.current) clearInterval(timerRef.current);
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
            </div>
          )}
        </div>
      </div>
    </div>
  );
}