// src/app/page.tsx
"use client";

import Link from "next/link";
import ThemeToggle from "@/components/ThemeToggle";
import {
  ArrowRight,
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

const CONTAINER = "w-full max-w-[1140px] mx-auto px-6";

export default function Landing() {
  return (
    <div
      className="min-h-screen flex flex-col bg-[var(--bg)]"
      style={{
        backgroundImage: "radial-gradient(circle, var(--border) 1px, transparent 1px)",
        backgroundSize: "28px 28px",
      }}
    >
      {/* ===== First screen: header + hero + strip (fills one viewport) ===== */}
      <div className="min-h-screen flex flex-col">
        <header className={`${CONTAINER} flex items-center justify-between py-4`}>
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg flex items-center justify-center font-semibold text-sm" style={{ background: "var(--accent)", color: "var(--accent-fg)" }}>S</div>
            <span className="text-[17px] font-semibold text-[var(--text-primary)] tracking-tight">SOVARA</span>
            <span className="text-[13px] text-[var(--text-muted)] hidden sm:inline">Sovereign AI Reasoning Assistant</span>
          </div>

          <div className="flex items-center gap-7">
            <nav className="hidden md:flex items-center gap-7 text-sm" style={{ color: "var(--text-primary)" }}>
              <a href="#how-it-works" className="hover:opacity-70">How it works</a>
              <a href="#proof" className="hover:opacity-70">Security</a>
              <a href="#models" className="hover:opacity-70">Models</a>
              <a href="https://github.com/Chandrakant1210/SOVARA-AI" target="_blank" rel="noopener noreferrer" className="hover:opacity-70">Docs</a>
            </nav>
            <div className="flex items-center gap-3">
              <ThemeToggle />
              <Link href="/console" className="text-sm font-semibold px-5 py-2.5 rounded-lg transition-opacity hover:opacity-90" style={{ background: "var(--accent)", color: "var(--accent-fg)" }}>
                Enter workbench
              </Link>
            </div>
          </div>
        </header>

        <main className={`${CONTAINER} flex-1 flex items-center py-10`}>
          <div className="w-full grid grid-cols-1 lg:grid-cols-[1fr_540px] gap-12 items-center">
            {/* Left: pitch */}
            <div className="max-w-[580px]">
              <span className="text-[11px] font-mono font-semibold tracking-[0.18em]" style={{ color: "var(--accent-2)" }}>
                BUILT FOR SIH 2026 &middot; MRPL &middot; PS-26117
              </span>
              <h1 className="mt-5 text-5xl lg:text-[64px] font-semibold text-[var(--text-primary)] tracking-tight leading-[1.05]">
                Sovereign AI for confidential industrial work.
              </h1>
              <p className="mt-6 text-[17px] leading-[1.75]" style={{ color: "var(--text-secondary)" }}>
                Give SOVARA a task or a document. It picks the right local model, works through the task step by step, and hands you a reviewed deliverable -- all on your own server, with no internet required.
              </p>

              <div className="mt-7 flex flex-wrap items-center gap-3">
                <Link href="/console" className="flex items-center gap-2 text-sm font-semibold px-5 py-3 rounded-lg transition-opacity hover:opacity-90" style={{ background: "var(--accent)", color: "var(--accent-fg)" }}>
                  <ArrowRight className="h-4 w-4" /> Enter the workbench
                </Link>
                <a href="#proof" className="flex items-center gap-2 text-sm font-semibold px-5 py-3 rounded-lg border transition-opacity hover:opacity-80" style={{ borderColor: "var(--border)", background: "var(--panel)", color: "var(--text-primary)" }}>
                  <ShieldCheck className="h-4 w-4" /> See the zero-egress proof
                </a>
              </div>
            </div>

            {/* Right: routing card + outbound card */}
            <div id="models" className="flex flex-col gap-4 scroll-mt-8">
              <div className="rounded-xl border px-5 pt-5 pb-4" style={{ borderColor: "var(--border)", background: "var(--panel)" }}>
                <span className="text-[11px] font-mono font-semibold tracking-[0.08em]" style={{ color: "var(--text-secondary)" }}>
                  ONE WORKBENCH &middot; THE RIGHT MODEL FOR EVERY TASK
                </span>
                <p className="mt-1.5 text-base font-semibold text-[var(--text-primary)]">You describe the task. SOVARA routes it.</p>

                {/* One shared grid: the pill column is as wide as the widest pill, so all pills line up. */}
                <div className="mt-3 grid grid-cols-[1fr_auto_auto] items-center">
                  {ROUTING.map((r) => (
                    <div key={r.task} className="contents">
                      <span className="py-3 pr-3 border-b text-[13px]" style={{ borderColor: "var(--border)", color: "var(--text-primary)" }}>{r.task}</span>
                      <span className="py-3 pr-3 border-b self-stretch flex items-center" style={{ borderColor: "var(--border)" }}>
                        <ArrowRight className="h-3.5 w-3.5" style={{ color: "var(--text-faint)" }} />
                      </span>
                      <span className="py-3 border-b self-stretch flex items-center" style={{ borderColor: "var(--border)" }}>
                        <span className="w-full whitespace-nowrap text-xs font-mono font-semibold px-2 py-1 rounded" style={{ background: "var(--accent-soft-bg)", color: "var(--accent-2)" }}>{r.model}</span>
                      </span>
                    </div>
                  ))}
                </div>

                <p className="mt-3 text-xs" style={{ color: "var(--text-muted)" }}>
                  qwen3:8b is currently loaded. New open-weight models plug in through the registry, with no code change.
                </p>
              </div>

              <div className="rounded-xl border px-5 py-4 flex items-center justify-between gap-4" style={{ borderColor: "var(--border)", background: "var(--panel)" }}>
                <div>
                  <span className="text-[11px] font-mono font-semibold tracking-[0.08em]" style={{ color: "var(--text-secondary)" }}>OUTBOUND CONNECTIONS</span>
                  <p className="mt-0.5 text-xs leading-relaxed" style={{ color: "var(--text-muted)" }}>Verified live, measured by netstat on every request. Sign in to see the real, currently measured value in Security Center.</p>
                </div>
                {/* Not hardcoded: shows a dash until wired to a real measurement endpoint. */}
                <span className="text-4xl font-mono font-semibold" style={{ color: "var(--accent-2)" }} aria-label="Not measured on this page">&mdash;</span>
              </div>
            </div>
          </div>
        </main>

        <div className={`${CONTAINER}`}>
          <div className="py-4 border-t flex flex-wrap items-center justify-between gap-2" style={{ borderColor: "var(--border)" }}>
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>Built for Mangalore Refinery and Petrochemicals Limited &middot; Problem Statement PS-26117</p>
            <p className="text-xs font-mono" style={{ color: "var(--text-secondary)" }}>Qwen3 &middot; PaddleOCR &middot; Qdrant &middot; LangGraph &middot; Ollama</p>
          </div>
        </div>
      </div>

      {/* ===== Below the fold: unchanged content, now inside the same container ===== */}
      <section id="how-it-works" className={`${CONTAINER} pt-12 pb-20 scroll-mt-8`}>
        <span className="text-[11px] font-mono font-semibold tracking-[0.18em]" style={{ color: "var(--accent-2)" }}>HOW IT WORKS</span>

        {/* Heading left, subtitle right, bottom-aligned */}
        <div className="mt-3 flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <h2 className="max-w-[640px] text-4xl lg:text-[40px] font-bold text-[var(--text-primary)] tracking-tight leading-[1.12]">One workbench. Local models. Zero egress.</h2>
          <p className="md:max-w-[370px] text-sm leading-relaxed md:pb-1" style={{ color: "var(--text-secondary)" }}>Everything below runs on the organization's own server, inside the firewall.</p>
        </div>

        <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {FEATURES.map(({ icon: Icon, title, desc }) => (
            <div key={title} className="rounded-xl border px-5 py-5" style={{ borderColor: "var(--border)", background: "var(--panel)" }}>
              <div className="h-10 w-10 rounded-lg flex items-center justify-center" style={{ background: "var(--accent-soft-bg)" }}>
                <Icon className="h-[18px] w-[18px]" style={{ color: "var(--accent-2)" }} strokeWidth={2} />
              </div>
              <p className="mt-3 text-base font-semibold text-[var(--text-primary)]">{title}</p>
              <p className="mt-2 text-[13px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>{desc}</p>
            </div>
          ))}
        </div>

        <div id="proof" className="mt-4 rounded-xl border px-8 py-6 scroll-mt-8" style={{ borderColor: "var(--border)", background: "var(--panel)" }}>
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
            <div className="md:max-w-[320px]">
              <p className="text-xl font-semibold text-[var(--text-primary)]">Proof, not promise</p>
              <p className="mt-2 text-[13px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>Illustrative values below -- verified live from real netstat measurement once you're signed in.</p>
            </div>
            <div className="flex flex-wrap gap-x-12 gap-y-4">
              {[
                { label: "INTERNET ACCESS", value: "Blocked" },
                { label: "EXTERNAL API CALLS", value: "0" },
                { label: "DATA EGRESS", value: "0 MB" },
              ].map((s) => (
                <div key={s.label}>
                  <span className="text-[11px] font-mono font-semibold tracking-[0.06em]" style={{ color: "var(--text-secondary)" }}>{s.label}</span>
                  <p className="mt-1 text-3xl font-semibold font-mono uppercase" style={{ color: "var(--accent-2)" }}>{s.value}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}