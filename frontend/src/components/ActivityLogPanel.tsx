// src/components/ActivityLogPanel.tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { Download, Loader2, RefreshCw } from "lucide-react";
import { authFetch } from "@/lib/api";

// ---------- API types ----------

type AuditEvent = {
  id: string;
  time: string | null;
  user: string;
  action: string;
  summary: string;
  tool: string | null;
  result: string | null;
  run_id: string | null;
  step: string | null;
  detail: string | null;
  duration_ms: number | null;
};

type EventsResponse = { events: AuditEvent[]; has_more: boolean; scope: "all" | "own" };

type RunTrace = {
  run_id: string;
  user: string;
  started: string | null;
  status: string;
  summary: string;
  steps: AuditEvent[];
  events: AuditEvent[];
};

// ---------- helpers ----------

async function readError(res: Response): Promise<string> {
  const body = await res.json().catch(() => null);
  if (Array.isArray(body?.detail)) return body.detail.map((e: { msg: string }) => e.msg).join(", ");
  return body?.detail ?? `Request failed with status ${res.status}`;
}

// Audit times are stored in UTC without a zone marker.
function toDate(iso: string | null): Date | null {
  if (!iso) return null;
  return new Date(/[zZ]|[+-]\d{2}:?\d{2}$/.test(iso) ? iso : `${iso}Z`);
}

function formatTime(iso: string | null): string {
  const d = toDate(iso);
  if (!d) return "\u2014";
  const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return d.toDateString() === new Date().toDateString() ? time : `${d.toLocaleDateString([], { day: "2-digit", month: "short" })} ${time}`;
}

function shortUser(email: string): string {
  return email.includes("@") ? email.split("@")[0] : email;
}

function resultColor(result: string | null): string {
  const r = (result ?? "").toLowerCase();
  if (/(fail|error|timed out|rejected|cancelled)/.test(r)) return "var(--error-text)";
  if (/(flagged|pending|requested|not indexed)/.test(r)) return "var(--accent-3)";
  if (/^exit [1-9]/.test(r) || /^exit -/.test(r)) return "var(--error-text)";
  return "var(--accent-2)";
}

function seconds(ms: number | null): string {
  return ms == null ? "" : `${(ms / 1000).toFixed(1)} s`;
}

const STEP_LABELS: Record<string, string> = {
  understand: "Understand", plan: "Plan", retrieve: "Retrieve", reason: "Reason", validate: "Validate", generate: "Generate",
};

const cardStyle = { borderColor: "var(--border)", background: "var(--panel)" };
const headCell = "px-4 py-3 text-[11px] font-mono font-semibold tracking-[0.08em] text-left";

// ---------- component ----------

export default function ActivityLogPanel() {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [scope, setScope] = useState<"all" | "own" | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedRun, setSelectedRun] = useState<string | null>(null);
  const [trace, setTrace] = useState<RunTrace | null>(null);
  const [traceLoading, setTraceLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await authFetch("/api/audit/events?limit=50");
      if (!res.ok) throw new Error(await readError(res));
      const data: EventsResponse = await res.json();
      setEvents(data.events);
      setHasMore(data.has_more);
      setScope(data.scope);
      setSelectedRun((current) => current ?? data.events.find((e) => e.action === "agent.run.result" && e.run_id)?.run_id ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load the activity log");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!selectedRun) {
      setTrace(null);
      return;
    }
    let cancelled = false;
    (async () => {
      setTraceLoading(true);
      try {
        const res = await authFetch(`/api/audit/runs/${selectedRun}`);
        if (!res.ok) throw new Error(await readError(res));
        const data: RunTrace = await res.json();
        if (!cancelled) setTrace(data);
      } catch (err) {
        if (!cancelled) {
          setTrace(null);
          setError(err instanceof Error ? err.message : "Could not load the run trace");
        }
      } finally {
        if (!cancelled) setTraceLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedRun]);

  const loadMore = async () => {
    const last = events[events.length - 1];
    if (!last?.time) return;
    setLoadingMore(true);
    try {
      const res = await authFetch(`/api/audit/events?limit=50&before=${encodeURIComponent(last.time)}`);
      if (!res.ok) throw new Error(await readError(res));
      const data: EventsResponse = await res.json();
      setEvents((prev) => [...prev, ...data.events]);
      setHasMore(data.has_more);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load more events");
    } finally {
      setLoadingMore(false);
    }
  };

  const exportCsv = async () => {
    setExporting(true);
    setError(null);
    try {
      const res = await authFetch("/api/audit/export.csv");
      if (!res.ok) throw new Error(await readError(res));
      const blob = await res.blob();
      const name = /filename="([^"]+)"/.exec(res.headers.get("content-disposition") ?? "")?.[1] ?? "sovara-activity.csv";
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = name;
      link.click();
      URL.revokeObjectURL(url);
      load(); // the export itself is audited, so it appears in the log
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed");
    } finally {
      setExporting(false);
    }
  };

  const decision = trace?.events.find((e) => e.action === "review.decision");

  return (
    <div className="h-full overflow-y-auto p-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--text-primary)]">Activity Log</h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            Who did what, with which model, and what came out. Exportable for compliance.
            {scope === "own" && " Showing your own activity."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} disabled={loading} className="p-2.5 rounded-lg border transition-opacity hover:opacity-80 disabled:opacity-50" style={{ borderColor: "var(--border)", background: "var(--panel)", color: "var(--text-secondary)" }} aria-label="Refresh">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </button>
          <button onClick={exportCsv} disabled={exporting} className="flex items-center gap-2 text-sm font-semibold px-4 py-2.5 rounded-lg border transition-opacity hover:opacity-80 disabled:opacity-50" style={{ borderColor: "var(--border)", background: "var(--panel)", color: "var(--text-primary)" }}>
            {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Export CSV
          </button>
        </div>
      </div>

      {error && <div className="mt-4 rounded-lg px-4 py-3 text-sm" style={{ background: "var(--error-bg)", color: "var(--error-text)" }}>{error}</div>}

      <div className="mt-5 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_300px] gap-5 items-start">
        {/* Events table */}
        <div className="rounded-xl border overflow-hidden" style={cardStyle}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b" style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}>
                  <th className={headCell}>TIME</th>
                  <th className={headCell}>USER</th>
                  <th className={headCell}>ACTION</th>
                  <th className={headCell}>MODEL / TOOL</th>
                  <th className={headCell}>RESULT</th>
                </tr>
              </thead>
              <tbody>
                {loading && events.length === 0 && (
                  <tr><td colSpan={5} className="px-4 py-10 text-center" style={{ color: "var(--text-muted)" }}><Loader2 className="inline h-4 w-4 animate-spin" /> Loading activity...</td></tr>
                )}
                {!loading && events.length === 0 && (
                  <tr><td colSpan={5} className="px-4 py-10 text-center" style={{ color: "var(--text-muted)" }}>No activity recorded yet.</td></tr>
                )}
                {events.map((e) => {
                  const isRun = e.action === "agent.run.result" && !!e.run_id;
                  const selected = isRun && e.run_id === selectedRun;
                  return (
                    <tr
                      key={e.id}
                      onClick={() => isRun && setSelectedRun(e.run_id)}
                      className={`border-b last:border-b-0 ${isRun ? "cursor-pointer hover:opacity-80" : ""}`}
                      style={{ borderColor: "var(--border)", background: selected ? "var(--accent-soft-bg)" : "transparent" }}
                      title={e.detail ?? undefined}
                    >
                      <td className="px-4 py-3 font-mono whitespace-nowrap" style={{ color: "var(--text-secondary)" }}>{formatTime(e.time)}</td>
                      <td className="px-4 py-3 whitespace-nowrap" style={{ color: "var(--text-secondary)" }} title={e.user}>{shortUser(e.user)}</td>
                      <td className="px-4 py-3 font-semibold text-[var(--text-primary)] max-w-[260px] truncate" title={e.summary}>{e.summary}</td>
                      <td className="px-4 py-3 font-mono whitespace-nowrap" style={{ color: "var(--text-secondary)" }}>{e.tool ?? "\u2014"}</td>
                      <td className="px-4 py-3 font-mono font-semibold whitespace-nowrap" style={{ color: resultColor(e.result) }}>{e.result ?? "\u2014"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {hasMore && (
            <div className="px-4 py-3 border-t text-center" style={{ borderColor: "var(--border)" }}>
              <button onClick={loadMore} disabled={loadingMore} className="text-sm font-semibold underline disabled:opacity-50" style={{ color: "var(--text-secondary)" }}>
                {loadingMore ? "Loading..." : "Load older activity"}
              </button>
            </div>
          )}
        </div>

        {/* Run trace */}
        <div className="rounded-xl border px-5 py-4" style={cardStyle}>
          {!selectedRun && <p className="text-sm" style={{ color: "var(--text-muted)" }}>Select an agent run to see its step-by-step trace.</p>}
          {selectedRun && traceLoading && <p className="flex items-center gap-2 text-sm" style={{ color: "var(--text-muted)" }}><Loader2 className="h-4 w-4 animate-spin" /> Loading trace...</p>}
          {selectedRun && !traceLoading && trace && (
            <>
              <span className="text-[11px] font-mono font-semibold tracking-[0.08em]" style={{ color: "var(--text-secondary)" }}>
                RUN #{trace.run_id.slice(0, 8).toUpperCase()} &middot; TRACE
              </span>
              <p className="mt-1 text-sm font-semibold text-[var(--text-primary)] break-all">{trace.summary}</p>
              <p className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>{shortUser(trace.user)} &middot; {formatTime(trace.started)} &middot; <span style={{ color: resultColor(trace.status) }}>{trace.status}</span></p>

              <ol className="mt-4 relative">
                {trace.steps.map((s, i) => {
                  const failed = s.result === "error";
                  return (
                    <li key={`${s.step}-${i}`} className="relative pl-6 pb-4">
                      <span className="absolute left-[5px] top-3 bottom-0 w-px" style={{ background: "var(--border)" }} />
                      <span className="absolute left-0 top-1 h-3 w-3 rounded-full" style={{ background: failed ? "var(--error-text)" : "var(--accent-2)" }} />
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-sm font-semibold text-[var(--text-primary)]">{STEP_LABELS[s.step ?? ""] ?? s.step}</span>
                        <span className="text-[11px] font-mono" style={{ color: "var(--text-muted)" }}>{seconds(s.duration_ms)}</span>
                      </div>
                      <p className="text-[11px] font-mono break-all" style={{ color: failed ? "var(--error-text)" : "var(--text-secondary)" }}>
                        {[s.tool, s.detail].filter(Boolean).join(" \u00b7 ")}
                      </p>
                    </li>
                  );
                })}
                {trace.status === "success" && (
                  <li className="relative pl-6">
                    <span className="absolute left-0 top-1 h-3 w-3 rounded-full" style={{ background: decision ? "var(--accent-2)" : "var(--accent-3)" }} />
                    <span className="text-sm font-semibold text-[var(--text-primary)]">Sign-off</span>
                    <p className="text-[11px] font-mono" style={{ color: "var(--text-secondary)" }}>
                      {decision ? `${decision.result} \u00b7 ${shortUser(decision.user)}` : "pending review"}
                    </p>
                  </li>
                )}
              </ol>
            </>
          )}
        </div>
      </div>
    </div>
  );
}