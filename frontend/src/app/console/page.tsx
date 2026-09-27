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
import type { FindingsHandoff } from "@/components/ScanAnalysisPanel";
import CodeSandboxPanel from "@/components/CodeSandboxPanel";
import ModelRegistryPanel from "@/components/ModelRegistryPanel";
import ActivityLogPanel from "@/components/ActivityLogPanel";

export type AgentResult = {
  response: string;
  docxPath: string;
  citations: { source: string; score: number }[];
  runId: string | null;
};

export default function Console() {
  const [tab, setTab] = useState<NavKey>("Chat");
  const [lastResult, setLastResult] = useState<AgentResult | null>(null);
  // Findings sent from Scan Analysis, waiting to be attached in AI Assistant.
  const [handoff, setHandoff] = useState<FindingsHandoff | null>(null);
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

  const sendToAgent = (findings: FindingsHandoff) => {
    setHandoff(findings);
    setTab("Chat");
  };

  return (
    <div className="h-screen flex flex-col bg-[var(--bg)]">
      <TopBar />
      <div className="flex-1 flex overflow-hidden">
        <Sidebar active={tab} onChange={setTab} />
        <main className="flex-1 overflow-hidden">
          {tab === "Chat" && (
            <ChatPanel
              onResult={setLastResult}
              onGoToReview={() => setTab("Review")}
              handoff={handoff}
              onHandoffCleared={() => setHandoff(null)}
            />
          )}
          {tab === "Documents" && <DocumentsPanel />}
          {tab === "Review" && (
            <ReviewPanel result={lastResult} onClear={() => setLastResult(null)} />
          )}
          {tab === "Security" && <SecurityPanel />}
          {tab === "Scan" && <ScanAnalysisPanel onSendToAgent={sendToAgent} />}
          {tab === "Sandbox" && <CodeSandboxPanel />}
          {tab === "Models" && <ModelRegistryPanel />}
          {tab === "Audit" && <ActivityLogPanel />}
        </main>
      </div>
    </div>
  );
}