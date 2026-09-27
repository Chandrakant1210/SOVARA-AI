// src/components/ReviewPanel.tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { authFetch } from "@/lib/api";
import type { AgentResult } from "@/app/console/page";
import ReactMarkdown from "react-markdown";
import { CheckCircle2, XCircle, PenLine, Loader2, Lock } from "lucide-react";

type SignoffState = {
  decided: boolean;
  decision: "approved" | "rejected" | "modified" | null;
  comment: string | null;
  reviewer: string | null;
  decided_at: string | null;
  can_decide: boolean;
  reason: string | null;
};

type QueueItem = {
  run_id: string;
  document: string | null;
  started_by: string;
  finished_at: string | null;
  status: "pending" | "approved" | "rejected" | "modified";
  reviewer: string | null;
  can_decide: boolean;
};

type QueueResponse = { items: QueueItem[]; pending_for_you: number; scope: "all" | "own" };

const STATUS_PILL: Record<QueueItem["status"], { bg: string; fg: string }> = {
  pending: { bg: "var(--accent-soft-bg)", fg: "var(--accent-3)" },
  approved: { bg: "var(--accent-soft-bg)", fg: "var(--accent-2)" },
  modified: { bg: "var(--accent-soft-bg)", fg: "var(--accent-2)" },
  rejected: { bg: "var(--error-bg)", fg: "var(--error-text)" },
};

async function readError(res: Response): Promise<string> {
  const body = await res.json().catch(() => null);
  if (Array.isArray(body?.detail)) return body.detail.map((e: { msg: string }) => e.msg).join(", ");
  return body?.detail ?? `Request failed with status ${res.status}`;
}

function fileName(path: string): string {
  return path.split(/[\\/]/).pop() || path;
}

// Audit times are stored in UTC without a zone marker.
function formatDateTime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(/[zZ]|[+-]\d{2}:?\d{2}$/.test(iso) ? iso : `${iso}Z`);
  return d.toLocaleString([], { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

const DECISION_VIEW = {
  approved: { text: "Approved and signed", Icon: CheckCircle2, color: "var(--accent-2)" },
  modified: { text: "Modified and signed", Icon: PenLine, color: "var(--accent-2)" },
  rejected: { text: "Rejected", Icon: XCircle, color: "var(--error-text)" },
};

export default function ReviewPanel({
  result: sessionResult,
  onClear,
}: {
  result: AgentResult | null;
  onClear: () => void;
}) {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [pendingForYou, setPendingForYou] = useState(0);
  const [queueLoading, setQueueLoading] = useState(true);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [result, setResult] = useState<AgentResult | null>(null);
  const [noteLoading, setNoteLoading] = useState(false);
  const [editedText, setEditedText] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [comment, setComment] = useState("");
  const [signoff, setSignoff] = useState<SignoffState | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [finalDocxPath, setFinalDocxPath] = useState("");

  const loadStatus = useCallback(async (runId: string) => {
    setStatusLoading(true);
    try {
      const res = await authFetch(`/api/review/runs/${runId}/status`);
      if (!res.ok) throw new Error(await readError(res));
      setSignoff(await res.json());
    } catch (err) {
      setSignoff(null);
      setError(err instanceof Error ? err.message : "Could not load sign-off status");
    } finally {
      setStatusLoading(false);
    }
  }, []);

  const loadQueue = useCallback(async () => {
    try {
      const res = await authFetch("/api/review/queue");
      if (!res.ok) throw new Error(await readError(res));
      const data: QueueResponse = await res.json();
      setQueue(data.items);
      setPendingForYou(data.pending_for_you);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load the review queue");
    } finally {
      setQueueLoading(false);
    }
  }, []);

  useEffect(() => {
    loadQueue();
  }, [loadQueue]);

  // A run just finished in AI Assistant: select it (it carries its citations).
  useEffect(() => {
    if (sessionResult) {
      setResult(sessionResult);
      setSelectedRunId(sessionResult.runId);
      loadQueue();
    }
  }, [sessionResult, loadQueue]);

  // Any other run: load its note from the generated .docx on the server.
  const openRun = async (item: QueueItem) => {
    setSelectedRunId(item.run_id);
    setError("");
    if (sessionResult && sessionResult.runId === item.run_id) {
      setResult(sessionResult);
      return;
    }
    setNoteLoading(true);
    try {
      const res = await authFetch(`/api/review/runs/${item.run_id}/note`);
      if (!res.ok) throw new Error(await readError(res));
      const data = await res.json();
      setResult({ response: data.text, docxPath: data.document, citations: data.citations ?? [], runId: item.run_id });
    } catch (err) {
      setResult(null);
      setError(err instanceof Error ? err.message : "Could not open this note");
    } finally {
      setNoteLoading(false);
    }
  };

  useEffect(() => {
    if (!result) return;
    setEditedText(result.response);
    setIsEditing(false);
    setComment("");
    setError("");
    setSignoff(null);
    setFinalDocxPath(result.docxPath);
    if (result.runId) loadStatus(result.runId);
  }, [result, loadStatus]);

  if (!result && !queueLoading && queue.length === 0 && !noteLoading) {
    return (
      <div className="h-full p-6">
        <h1 className="text-2xl font-semibold text-[var(--text-primary)]">Review & Sign-Off</h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">Every AI deliverable waits here for a named approver.</p>
        {error && <div className="mt-4 rounded-lg px-4 py-3 text-sm" style={{ background: "var(--error-bg)", color: "var(--error-text)" }}>{error}</div>}
        <div className="flex items-center justify-center h-[60%]">
          <p className="text-sm text-[var(--text-muted)] max-w-sm text-center leading-relaxed">
            No output pending review yet. Ask SOVARA something in the AI Assistant tab first -- the result will appear here for sign-off.
          </p>
        </div>
      </div>
    );
  }

  const submitDecision = async (decision: "approved" | "rejected" | "modified", docxPath?: string) => {
    if (!result?.runId) return;
    const res = await authFetch("/api/review/decision", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ run_id: result.runId, decision, comment, docx_path: docxPath ?? null }),
    });
    if (!res.ok) throw new Error(await readError(res));
    setSignoff(await res.json());
    loadQueue();
  };

  const decide = async (decision: "approved" | "rejected") => {
    setBusy(true);
    setError("");
    try {
      await submitDecision(decision);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Decision failed");
      if (result?.runId) loadStatus(result.runId);
    } finally {
      setBusy(false);
    }
  };

  const saveModifiedAndSign = async () => {
    setBusy(true);
    setError("");
    try {
      const res = await authFetch("/api/review/save-modified", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: editedText, run_id: result?.runId }),
      });
      if (!res.ok) throw new Error(await readError(res));
      const data = await res.json();
      setFinalDocxPath(data.docx_path);
      await submitDecision("modified", data.docx_path);
      setIsEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      if (result?.runId) loadStatus(result.runId);
    } finally {
      setBusy(false);
    }
  };

  const decided = signoff?.decided && signoff.decision ? DECISION_VIEW[signoff.decision] : null;
  const canDecide = !!result?.runId && !!signoff?.can_decide && !busy;
  const lockReason = !result?.runId
    ? "This result has no run ID, so a decision can't be linked to its audit trail. Run the task again."
    : signoff?.reason;

  return (
    <div className="h-full flex flex-col">
      <div className="p-6 pb-0">
        <h1 className="text-2xl font-semibold text-[var(--text-primary)]">Review & Sign-Off</h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">Every AI deliverable waits here for a named approver.</p>
      </div>

      <div className="flex-1 flex gap-4 p-6 overflow-hidden">
        <div className="w-64 shrink-0 flex flex-col min-h-0">
          <div className="flex items-baseline justify-between">
            <span className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--text-faint)" }}>Review queue</span>
            {pendingForYou > 0 && <span className="text-[11px] font-semibold" style={{ color: "var(--accent-3)" }}>{pendingForYou} awaiting you</span>}
          </div>
          <div className="mt-2 flex-1 overflow-y-auto flex flex-col gap-2 pr-1">
            {queueLoading && <p className="text-xs" style={{ color: "var(--text-muted)" }}>Loading...</p>}
            {queue.map((item) => {
              const pill = STATUS_PILL[item.status];
              const selected = item.run_id === selectedRunId;
              return (
                <button
                  key={item.run_id}
                  onClick={() => openRun(item)}
                  className="text-left rounded-xl border p-3 transition-colors"
                  style={{ borderColor: selected ? "var(--accent)" : "var(--border)", background: "var(--panel)" }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-mono" style={{ color: "var(--text-faint)" }}>RUN #{item.run_id.slice(0, 8).toUpperCase()}</span>
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: pill.bg, color: pill.fg }}>{item.status}</span>
                  </div>
                  <p className="mt-1 text-sm font-medium text-[var(--text-primary)]">Approval note</p>
                  <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                    {item.started_by.split("@")[0]} &middot; {formatDateTime(item.finished_at)}
                  </p>
                  {item.reviewer && <p className="text-xs" style={{ color: "var(--text-muted)" }}>signed by {item.reviewer.split("@")[0]}</p>}
                </button>
              );
            })}
          </div>
          {sessionResult && (
            <button onClick={onClear} className="mt-3 text-xs underline self-start" style={{ color: "var(--text-muted)" }}>Clear my latest run from this screen</button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto">
          {noteLoading && <p className="flex items-center gap-2 text-sm" style={{ color: "var(--text-muted)" }}><Loader2 className="h-4 w-4 animate-spin" /> Opening note...</p>}
          {!noteLoading && !result && <p className="text-sm" style={{ color: "var(--text-muted)" }}>Select a note from the review queue.</p>}
          {!noteLoading && result && (
          <div className="rounded-xl border p-5" style={{ borderColor: "var(--border)", background: "var(--panel)" }}>
            <div className="flex items-center justify-between text-xs font-mono" style={{ color: "var(--text-faint)" }}>
              <span>{isEditing ? "EDITING - WILL BE SIGNED AS MODIFIED" : "DRAFT - GENERATED BY AGENT"}</span>
            </div>
            <div className="mt-3">
              {isEditing ? (
                <textarea
                  className="w-full min-h-[300px] resize-y rounded-lg p-3 text-[15px] leading-relaxed focus:outline-none"
                  style={{ background: "var(--bg)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
                  value={editedText}
                  maxLength={50000}
                  onChange={(e) => setEditedText(e.target.value)}
                />
              ) : (
                <div className="text-[15px] text-[var(--text-primary)] leading-relaxed [&>p]:mb-3 [&>p:last-child]:mb-0 [&_strong]:font-semibold [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:mb-3 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:mb-3 [&_li]:mb-1">
                  <ReactMarkdown>{editedText}</ReactMarkdown>
                </div>
              )}
            </div>
            {result.citations.length > 0 && !isEditing && (
              <div className="mt-4 flex flex-wrap gap-2">
                {result.citations.map((c, i) => (
                  <span key={i} className="text-xs font-mono px-2 py-1 rounded" style={{ background: "var(--accent-soft-bg)", color: "var(--accent-2)" }}>
                    {c.source} - {c.score.toFixed(3)}
                  </span>
                ))}
              </div>
            )}
          </div>
          )}

          {error && (
            <div className="mt-3 rounded-xl border p-3 text-sm" style={{ borderColor: "var(--error-border)", background: "var(--error-bg)", color: "var(--error-text)" }}>{error}</div>
          )}
        </div>

        {result && (
        <div className="w-64 shrink-0">
          <span className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--text-faint)" }}>Decision</span>
          <div className="mt-2 rounded-xl border p-4" style={{ borderColor: "var(--border)", background: "var(--panel)" }}>
            {statusLoading && (
              <p className="flex items-center gap-2 text-sm" style={{ color: "var(--text-muted)" }}><Loader2 className="h-4 w-4 animate-spin" /> Checking sign-off...</p>
            )}

            {!statusLoading && decided && signoff && (
              <div className="flex items-start gap-2">
                <decided.Icon className="h-4 w-4 mt-0.5 shrink-0" style={{ color: decided.color }} />
                <div className="min-w-0">
                  <p className="text-sm font-medium" style={{ color: decided.color }}>{decided.text}</p>
                  <p className="mt-1 text-xs" style={{ color: "var(--text-secondary)" }}>by {signoff.reviewer} &middot; {formatDateTime(signoff.decided_at)}</p>
                  {signoff.comment && <p className="mt-2 text-xs italic" style={{ color: "var(--text-secondary)" }}>&ldquo;{signoff.comment}&rdquo;</p>}
                  {signoff.decision !== "rejected" && finalDocxPath && (
                    <p className="mt-2 text-xs font-mono break-all" style={{ color: "var(--text-muted)" }}>{fileName(finalDocxPath)}</p>
                  )}
                </div>
              </div>
            )}

            {!statusLoading && !decided && !canDecide && !busy && (
              <div className="flex items-start gap-2">
                <Lock className="h-4 w-4 mt-0.5 shrink-0" style={{ color: "var(--accent-3)" }} />
                <p className="text-sm" style={{ color: "var(--text-secondary)" }}>{lockReason ?? "Sign-off is not available."}</p>
              </div>
            )}

            {!statusLoading && !decided && (canDecide || busy) && (
              <div className="flex flex-col gap-2">
                <textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  maxLength={1000}
                  placeholder="Comment for the audit record (optional)"
                  className="min-h-[70px] resize-y rounded-lg p-2 text-sm focus:outline-none bg-transparent text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
                  style={{ border: "1px solid var(--border)" }}
                />
                {isEditing ? (
                  <>
                    <button onClick={saveModifiedAndSign} disabled={busy || !editedText.trim()} className="text-sm font-medium py-2.5 rounded-lg transition-opacity hover:opacity-90 disabled:opacity-30 disabled:cursor-not-allowed" style={{ background: "var(--accent)", color: "var(--accent-fg)" }}>
                      {busy ? "Saving..." : "Save edits and sign off"}
                    </button>
                    <button onClick={() => { setIsEditing(false); setEditedText(result.response); }} disabled={busy} className="text-sm py-2 rounded-lg" style={{ color: "var(--text-muted)" }}>Cancel editing</button>
                  </>
                ) : (
                  <>
                    <button onClick={() => decide("approved")} disabled={busy} className="text-sm font-medium py-2.5 rounded-lg transition-opacity hover:opacity-90 disabled:opacity-50" style={{ background: "var(--accent)", color: "var(--accent-fg)" }}>
                      {busy ? "Recording..." : "Approve and sign"}
                    </button>
                    <button onClick={() => setIsEditing(true)} disabled={busy} className="text-sm font-medium py-2.5 rounded-lg border transition-colors disabled:opacity-50" style={{ borderColor: "var(--border)", color: "var(--text-primary)" }}>
                      Edit, then sign off
                    </button>
                    <button onClick={() => decide("rejected")} disabled={busy} className="text-sm font-medium py-2.5 rounded-lg border transition-colors disabled:opacity-50" style={{ borderColor: "var(--error-border)", color: "var(--error-text)" }}>
                      Reject
                    </button>
                  </>
                )}
              </div>
            )}
          </div>

          <p className="mt-3 text-xs leading-relaxed" style={{ color: "var(--text-muted)" }}>
            Decisions are recorded in the Activity Log with the reviewer&apos;s name and time. Only managers and admins can sign off, and never on a run they started.
          </p>
        </div>
        )}
      </div>
    </div>
  );
}