// src/app/page.tsx
"use client";

import { useState } from "react";
import TopNav from "@/components/TopNav";
import ChatPanel from "@/components/ChatPanel";
import SecurityPanel from "@/components/SecurityPanel";

type Tab = "Chat" | "Documents" | "Review" | "Audit";

const COMING_SOON: Record<Exclude<Tab, "Chat">, string> = {
  Documents: "Document upload, OCR and vision extraction — Day 4–5.",
  Review: "Human approve / reject / modify screen — Day 6.",
  Audit: "Full audit trail from PostgreSQL — Day 11.",
};

export default function Home() {
  const [tab, setTab] = useState<Tab>("Chat");

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
        <div className="flex items-center gap-2 text-xs font-mono text-[#8B98A3] pb-5">
          <span className="relative flex h-1.5 w-1.5">
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-[#2FD9C3]" />
          </span>
          Air-gapped session
        </div>
      </header>

      <div className="border-b border-[#1E262C]">
        <TopNav active={tab} onChange={setTab} />
      </div>

      <main className="flex-1 grid grid-cols-1 lg:grid-cols-[1fr_380px] min-h-[calc(100vh-129px)]">
        {tab === "Chat" ? (
          <ChatPanel />
        ) : (
          <div className="flex items-center justify-center px-8">
            <p className="text-sm text-[#5B6670] max-w-sm text-center leading-relaxed">
              {COMING_SOON[tab]}
            </p>
          </div>
        )}
        <SecurityPanel />
      </main>
    </div>
  );
}