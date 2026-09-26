// src/app/console/page.tsx
"use client";

import { useState } from "react";
import Sidebar, { NavKey } from "@/components/Sidebar";
import TopBar from "@/components/TopBar";
import ChatPanel from "@/components/ChatPanel";
import SecurityPanel from "@/components/SecurityPanel";
import LoginScreen from "@/components/LoginScreen";
import ReviewPanel from "@/components/ReviewPanel";
import DocumentsPanel from "@/components/DocumentsPanel";
import { useAuth } from "@/lib/AuthContext";
import ScanAnalysisPanel from "@/components/ScanAnalysisPanel";

export type AgentResult = {
  response: string;
  docxPath: string;
  citations: { source: string; score: number }[];
};

const COMING_SOON: Record<string, string> = {
  Sandbox: "Code Sandbox UI -- coming soon.",
  Models: "Model Registry UI -- coming soon.",
  Audit: "Activity Log UI -- coming soon.",
};

export default function Console() {
  const [tab, setTab] = useState<NavKey>("Chat");
  const [lastResult, setLastResult] = useState<AgentResult | null>(null);
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--bg)] flex items-center justify-center">
        <span className="text-sm text-[var(--text-muted)] font-mono">loading...</span>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginScreen />;
  }

  return (
    <div className="h-screen flex flex-col bg-[var(--bg)]">
      <TopBar />
      <div className="flex-1 flex overflow-hidden">
        <Sidebar active={tab} onChange={setTab} />
        <main className="flex-1 overflow-hidden">
          {tab === "Chat" && (
            <ChatPanel onResult={setLastResult} onGoToReview={() => setTab("Review")} />
          )}
          {tab === "Documents" && <DocumentsPanel />}
          {tab === "Review" && (
            <ReviewPanel result={lastResult} onClear={() => setLastResult(null)} />
          )}
          {tab === "Security" && <SecurityPanel />}
          {tab === "Scan" && <ScanAnalysisPanel />}
          {(tab === "Sandbox" || tab === "Models" || tab === "Audit") && (
            <div className="flex items-center justify-center h-full px-8">
              <p className="text-sm text-[var(--text-muted)] max-w-sm text-center leading-relaxed">
                {COMING_SOON[tab]}
              </p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
