// src/app/page.tsx
"use client";

import { useState } from "react";
import TopNav from "@/components/TopNav";
import ChatPanel from "@/components/ChatPanel";
import SecurityPanel from "@/components/SecurityPanel";
import LoginScreen from "@/components/LoginScreen";
import ReviewPanel from "@/components/ReviewPanel";
import { useAuth } from "@/lib/AuthContext";
import DocumentsPanel from "@/components/DocumentsPanel";

type Tab = "Chat" | "Documents" | "Review" | "Audit";

export type AgentResult = {
  response: string;
  docxPath: string;
  citations: { source: string; score: number }[];
};

const COMING_SOON: Record<"Audit", string> = {
  Audit: "Full audit trail from PostgreSQL — Day 11.",
};

export default function Home() {
  const [tab, setTab] = useState<Tab>("Chat");
  const [lastResult, setLastResult] = useState<AgentResult | null>(null);
  const { isAuthenticated, loading, logout } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0A0E12] flex items-center justify-center">
        <span className="text-sm text-[#5B6670] font-mono">loading…</span>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginScreen />;
  }

  return (
    <div className="min-h-screen bg-[#0A0E12] flex flex-col">
      <header className="flex items-center justify-between px-8 lg:px-14 pt-5 border-b border-[#1E262C]">
        <div className="flex items-baseline gap-3 pb-5">
          <span className="text-[15px] font-semibold text-[#E7ECEF] tracking-tight">
            SOVARA
          </span>
          <span className="text-xs text-[#5B6670] hidden sm:inline">
            Sovereign AI Reasoning Assistant
          </span>
        </div>
        <div className="flex items-center gap-4 pb-5">
          <div className="flex items-center gap-2 text-xs font-mono text-[#8B98A3]">
            <span className="relative flex h-1.5 w-1.5">
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-[#2FD9C3]" />
            </span>
            Air-gapped session
          </div>
          <button
            onClick={logout}
            className="text-xs text-[#5B6670] hover:text-[#8B98A3] transition-colors"
          >
            Sign out
          </button>
        </div>
      </header>

      <div className="border-b border-[#1E262C]">
        <TopNav active={tab} onChange={setTab} />
      </div>

      <main className="flex-1 grid grid-cols-1 lg:grid-cols-[1fr_380px] min-h-[calc(100vh-129px)]">
        {tab === "Chat" ? (
          <ChatPanel onResult={setLastResult} />
        ) : tab === "Documents" ? (
          <DocumentsPanel />
        ) : tab === "Review" ? (
          <ReviewPanel result={lastResult} onClear={() => setLastResult(null)} />
        ) : (
          <div className="flex items-center justify-center px-8">
            <p className="text-sm text-[#5B6670] max-w-sm text-center leading-relaxed">
              {COMING_SOON.Audit}
            </p>
          </div>
        )}
        <SecurityPanel />
      </main>
    </div>
  );
}