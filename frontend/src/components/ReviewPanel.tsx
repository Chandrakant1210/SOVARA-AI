// src/components/ReviewPanel.tsx
"use client";

import { useState, useEffect } from "react";
import { authFetch } from "@/lib/api";
import type { AgentResult } from "@/app/page";

type Decision = "approved" | "rejected" | null;

export default function ReviewPanel({
  result,
  onClear,
}: {
  result: AgentResult | null;
  onClear: () => void;
}) {
  const [editedText, setEditedText] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [decision, setDecision] = useState<Decision>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [finalDocxPath, setFinalDocxPath] = useState("");

  useEffect(() => {
    if (result) {
      setEditedText(result.response);
      setIsEditing(false);
      setDecision(null);
      setError("");
      setFinalDocxPath(result.docxPath);
    }
  }, [result]);

  if (!result) {
    return (
      <div className="flex items-center justify-center h-full px-8">
        <p className="text-sm text-[#5B6670] max-w-sm text-center leading-relaxed">
          No output pending review yet. Ask SOVARA something in the Chat tab
          first — the result will appear here for approval.
        </p>
      </div>
    );
  }

  const handleApprove = () => {
    setDecision("approved");
  };

  const handleReject = () => {
    setDecision("rejected");
    onClear();
  };

  const handleSaveModified = async () => {
    setSaving(true);
    setError("");
    try {
      const res = await authFetch("/api/review/save-modified", {
        method: "POST",
        body: JSON.stringify({ text: editedText }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.detail ?? "Failed to save modified document");
      }
      const data = await res.json();
      setFinalDocxPath(data.docx_path);
      setDecision("approved");
      setIsEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col h-full px-8 py-14 overflow-y-auto">
      <div className="w-full max-w-xl mx-auto">
        <h1 className="text-2xl font-medium text-[#E7ECEF] tracking-tight">
          Human Review
        </h1>
        <p className="mt-2 text-sm text-[#8B98A3] leading-relaxed">
          Review the agent&apos;s output before it becomes a final deliverable.
          Approve, reject, or modify the text below.
        </p>

        <div className="mt-6 rounded-sm border border-[#1E262C] bg-[#10151A] p-4">
          {isEditing ? (
            <textarea
              className="w-full min-h-[300px] resize-y bg-[#0A0E12] border border-[#1E262C] text-[#E7ECEF] p-3 text-[15px] leading-relaxed focus:outline-none focus:border-[#2FD9C3]/60 transition-colors"
              value={editedText}
              onChange={(e) => setEditedText(e.target.value)}
            />
          ) : (
            <p className="text-[15px] text-[#E7ECEF] leading-relaxed whitespace-pre-wrap">
              {editedText}
            </p>
          )}

          {result.citations.length > 0 && !isEditing && (
            <div className="mt-3 flex flex-wrap gap-2">
              {result.citations.map((c, i) => (
                <span
                  key={i}
                  className="text-xs font-mono text-[#5B6670] border border-[#1E262C] rounded-sm px-2 py-1"
                >
                  {c.source} · {c.score}
                </span>
              ))}
            </div>
          )}
        </div>

        {error && (
          <div className="mt-3 rounded-sm border border-[#4A2A2A] bg-[#1A1010] p-3 text-sm text-[#E5A3A3]">
            {error}
          </div>
        )}

        {decision === "approved" ? (
          <div className="mt-4 rounded-sm border border-[#2FD9C3]/40 bg-[#0F1A18] p-4">
            <p className="text-sm text-[#2FD9C3] font-medium">Approved</p>
            <p className="mt-1 text-xs text-[#5B6670] font-mono">
              Final document: {finalDocxPath}
            </p>
          </div>
        ) : isEditing ? (
          <div className="mt-4 flex gap-3">
            <button
              onClick={handleSaveModified}
              disabled={saving || !editedText.trim()}
              className="bg-[#2FD9C3] text-[#0A0E12] font-medium text-sm px-5 py-2.5 rounded-sm hover:bg-[#4FE5D1] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              {saving ? "Saving…" : "Save as final document"}
            </button>
            <button
              onClick={() => setIsEditing(false)}
              className="text-sm text-[#5B6670] hover:text-[#8B98A3] transition-colors px-3"
            >
              Cancel
            </button>
          </div>
        ) : (
          <div className="mt-4 flex gap-3">
            <button
              onClick={handleApprove}
              className="bg-[#2FD9C3] text-[#0A0E12] font-medium text-sm px-5 py-2.5 rounded-sm hover:bg-[#4FE5D1] transition-colors"
            >
              Approve
            </button>
            <button
              onClick={() => setIsEditing(true)}
              className="border border-[#1E262C] text-[#E7ECEF] font-medium text-sm px-5 py-2.5 rounded-sm hover:border-[#2FD9C3]/50 transition-colors"
            >
              Modify
            </button>
            <button
              onClick={handleReject}
              className="border border-[#4A2A2A] text-[#E5A3A3] font-medium text-sm px-5 py-2.5 rounded-sm hover:bg-[#1A1010] transition-colors"
            >
              Reject
            </button>
          </div>
        )}
      </div>
    </div>
  );
}