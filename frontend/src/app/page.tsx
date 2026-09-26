// src/app/page.tsx
"use client";

import Link from "next/link";
import ThemeToggle from "@/components/ThemeToggle";
import {
  GitBranch,
  RefreshCw,
  ScanLine,
  Search,
  FileText,
  PenLine,
  ShieldCheck,
} from "lucide-react";

const ROUTING = [
  { task: "Summarize reports, draft approval notes", model: "Qwen3-8B" },
  { task: "Retrieve cited evidence from SOPs", model: "Qdrant + nomic-embed" },
  { task: "Read scans and photos", model: "PaddleOCR (+ vision, pluggable)" },
  { task: "Understand and route each request", model: "Qwen3-8B" },
];

const FEATURES = [
  { icon: GitBranch, title: "Model router", desc: "A registry matches each task to the right local model by capability -- reasoning, vision, or classification." },
  { icon: RefreshCw, title: "Agentic loop", desc: "Plans the steps, retrieves evidence, reasons, and validates the result before generating a deliverable." },
  { icon: ScanLine, title: "Scans and drawings", desc: "PaddleOCR reads scanned PDFs and photos; a vision model can be added via the registry for drawings." },
  { icon: Search, title: "Cited answers", desc: "Private RAG over your own SOPs and manuals. Every claim links back to its source chunk." },
  { icon: FileText, title: "Real deliverables", desc: "Generates a real Word document from the agent's findings -- not just a chat reply." },
  { icon: PenLine, title: "Supervisor sign-off", desc: "Nothing ships until a named approver accepts, edits, or rejects it." },
];

export default function Landing() {
  return (
    <div
      className="min-h-screen flex flex-col bg-[var(--bg)]"
      style={{
        backgroundImage: "radial-gradient(circle, var(--border) 1px, transparent 1px)",
        backgroundSize: "28px 28px",
      }}
    >
      <header className="flex items-center justify-between px-8 lg:px-14 py-5">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg flex items-center justify-center font-semibold text-sm" style={{ background: "var(--accent)", color: "var(--accent-fg)" }}>S</div>
          <span className="text-[15px] font-semibold text-[var(--text-primary)] tracking-tight">SOVARA</span>
          <span className="text-xs text-[var(--text-muted)] hidden sm:inline">Sovereign AI Reasoning Assistant</span>
        </div>

        <nav className="hidden md:flex items-center gap-6 text-sm" style={{ color: "var(--text-secondary)" }}>
          <a href="#how-it-works" className="hover:opacity-70">How it works</a>
          <a href="#proof" className="hover:opacity-70">Security</a>
          <a href="#models" className="hover:opacity-70">Models</a>
          <a href="https://github.com/Chandrakant1210/SOVARA-AI" target="_blank" rel="noopener noreferrer" className="hover:opacity-70">Docs</a>
        </nav>

        <div className="flex items-center gap-3">
          <ThemeToggle />
          <Link href="/console" className="text-sm font-medium px-4 py-2 rounded-lg transition-opacity hover:opacity-90" style={{ background: "var(--accent)", color: "var(--accent-fg)" }}>
            Enter workbench
          </Link>
        </div>
      </header>

      <main className="flex-1 px-8 lg:px-14 py-10">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_420px] gap-10 items-start">
          <div className="max-w-xl">
            <span className="text-xs font-mono tracking-wide" style={{ color: "var(--accent-2)" }}>BUILT FOR SIH 2026 - MRPL - PS-26117</span>
            <h1 className="mt-3 text-4xl sm:text-5xl font-semibold text-[var(--text-primary)] tracking-tight leading-tight">Sovereign AI for confidential industrial work.</h1>
            <p className="mt-5 text-base leading-relaxed" style={{ color: "var(--text-secondary)" }}>
              Give SOVARA a task or a document. It picks the right local model, works through the task step by step, and hands you a reviewed deliverable -- all on your own server, with no internet required.
            </p>

            <div className="mt-8 flex items-center gap-4">
              <Link href="/console" className="text-sm font-medium px-5 py-2.5 rounded-lg transition-opacity hover:opacity-90" style={{ background: "var(--accent)", color: "var(--accent-fg)" }}>
                Enter the workbench
              </Link>
              <a href="#proof" className="flex items-center gap-2 text-sm font-medium px-5 py-2.5 rounded-lg border" style={{ borderColor: "var(--border)", color: "var(--text-primary)" }}>
                <ShieldCheck className="h-4 w-4" /> See the zero-egress proof
              </a>
            </div>
          </div>

          <div id="models" className="flex flex-col gap-4">
            <div className="rounded-xl border p-5" style={{ borderColor: "var(--border)", background: "var(--panel)" }}>
              <span className="text-xs font-mono" style={{ color: "var(--text-faint)" }}>ONE WORKBENCH - THE RIGHT MODEL FOR EVERY TASK</span>
              <p className="mt-1 text-base font-medium text-[var(--text-primary)]">You describe the task. SOVARA routes it.</p>
              <div className="mt-4 flex flex-col gap-2">
                {ROUTING.map((r) => (
                  <div key={r.task} className="flex items-center justify-between gap-3 py-2 border-b" style={{ borderColor: "var(--border)" }}>
                    <span className="text-sm" style={{ color: "var(--text-secondary)" }}>{r.task}</span>
                    <span className="text-xs font-mono px-2 py-1 rounded shrink-0" style={{ background: "var(--accent-soft-bg)", color: "var(--accent-2)" }}>{r.model}</span>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-xs" style={{ color: "var(--text-faint)" }}>qwen3:8b is currently loaded. New open-weight models plug in through the registry, with no code change.</p>
            </div>

            <div className="rounded-xl border p-5" style={{ borderColor: "var(--border)", background: "var(--panel)" }}>
              <span className="text-xs font-mono" style={{ color: "var(--text-faint)" }}>OUTBOUND CONNECTIONS</span>
              <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>Verified live, measured by netstat on every request. Sign in to see the real, currently measured value in Security Center.</p>
            </div>
          </div>
        </div>

        <section id="how-it-works" className="mt-24 scroll-mt-8">
          <span className="text-xs font-mono tracking-wide" style={{ color: "var(--accent-2)" }}>HOW IT WORKS</span>
          <h2 className="mt-2 text-3xl font-semibold text-[var(--text-primary)] tracking-tight max-w-2xl">One workbench. Local models. Zero egress.</h2>
          <p className="mt-2 text-sm max-w-md" style={{ color: "var(--text-secondary)" }}>Everything below runs on the organization's own server, inside the firewall.</p>

          <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {FEATURES.map(({ icon: Icon, title, desc }) => (
              <div key={title} className="rounded-xl border p-5" style={{ borderColor: "var(--border)", background: "var(--panel)" }}>
                <div className="h-9 w-9 rounded-lg flex items-center justify-center" style={{ background: "var(--accent-soft-bg)" }}>
                  <Icon className="h-4 w-4" style={{ color: "var(--accent-2)" }} strokeWidth={2} />
                </div>
                <p className="mt-3 text-sm font-medium text-[var(--text-primary)]">{title}</p>
                <p className="mt-1 text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>{desc}</p>
              </div>
            ))}
          </div>

          <div id="proof" className="mt-4 rounded-xl border p-6 scroll-mt-8" style={{ borderColor: "var(--border)", background: "var(--panel)" }}>
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div>
                <p className="text-base font-medium text-[var(--text-primary)]">Proof, not promise</p>
                <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>Illustrative values below -- verified live from real netstat measurement once you're signed in.</p>
              </div>
              <div className="flex gap-6">
                <div>
                  <span className="text-xs font-mono" style={{ color: "var(--text-faint)" }}>INTERNET ACCESS</span>
                  <p className="text-xl font-semibold font-mono" style={{ color: "var(--accent-2)" }}>Blocked</p>
                </div>
                <div>
                  <span className="text-xs font-mono" style={{ color: "var(--text-faint)" }}>EXTERNAL API CALLS</span>
                  <p className="text-xl font-semibold font-mono" style={{ color: "var(--accent-2)" }}>0</p>
                </div>
                <div>
                  <span className="text-xs font-mono" style={{ color: "var(--text-faint)" }}>DATA EGRESS</span>
                  <p className="text-xl font-semibold font-mono" style={{ color: "var(--accent-2)" }}>0 MB</p>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="px-8 lg:px-14 py-6 border-t flex flex-wrap items-center justify-between gap-2" style={{ borderColor: "var(--border)" }}>
        <p className="text-xs" style={{ color: "var(--text-muted)" }}>Built for Mangalore Refinery and Petrochemicals Limited -- Problem Statement PS-26117</p>
        <p className="text-xs font-mono" style={{ color: "var(--text-faint)" }}>Qwen3 - PaddleOCR - Qdrant - LangGraph - Ollama</p>
      </footer>
    </div>
  );
}

