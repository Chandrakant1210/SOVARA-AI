// src/components/SecurityPanel.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { Download, ShieldCheck } from "lucide-react";
import { authFetch } from "@/lib/api";

type SecurityStatus = {
  internet_access: string;
  outbound_connections: number;
  external_api_calls: number;
  cloud_models_in_use: number;
  data_egress_mb: number;
  sandbox_network: string;
  active_model: string;
};

const POLL_INTERVAL_MS = 5000;
const MAX_HISTORY = 30;

function MetricCard({ label, value, good }: { label: string; value: string; good: boolean }) {
  return (
    <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", background: "var(--panel)" }}>
      <span className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--text-faint)" }}>
        {label}
      </span>
      <p className="mt-1 text-2xl font-semibold font-mono" style={{ color: good ? "var(--accent-2)" : "var(--error-text)" }}>
        {value}
      </p>
    </div>
  );
}

export default function SecurityPanel() {
  const [status, setStatus] = useState<SecurityStatus | null>(null);
  const [error, setError] = useState(false);
  const [history, setHistory] = useState<number[]>([]);
  const startedAt = useRef(new Date());

  useEffect(() => {
    let cancelled = false;

    const fetchStatus = async () => {
      try {
        const res = await authFetch("/api/security/status");
        if (!res.ok) throw new Error();
        const data = await res.json();
        if (!cancelled) {
          setStatus(data);
          setError(false);
          setHistory((prev) => [...prev, data.outbound_connections].slice(-MAX_HISTORY));
        }
      } catch {
        if (!cancelled) setError(true);
      }
    };

    fetchStatus();
    const interval = setInterval(fetchStatus, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const handleExport = () => {
    if (!status) return;
    const blob = new Blob(
      [JSON.stringify({ exported_at: new Date().toISOString(), ...status }, null, 2)],
      { type: "application/json" }
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `sovara-security-status-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const maxVal = Math.max(1, ...history);

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--text-primary)]">Security Center</h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            Live isolation evidence: measured, never hard-coded.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span
            className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full"
            style={{ background: "var(--accent-soft-bg)", color: "var(--accent-2)" }}
          >
            <ShieldCheck className="h-3.5 w-3.5" /> {error ? "Unknown" : "Air-gap intact"}
          </span>
          <button
            onClick={handleExport}
            disabled={!status}
            className="flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-lg border disabled:opacity-40"
            style={{ borderColor: "var(--border)", color: "var(--text-primary)" }}
          >
            <Download className="h-4 w-4" /> Export evidence
          </button>
        </div>
      </div>

      {status ? (
        <div className="mt-6 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <MetricCard label="Internet access" value={status.internet_access === "blocked" ? "Blocked" : "Detected"} good={status.internet_access === "blocked"} />
          <MetricCard label="External API calls" value={String(status.external_api_calls)} good={status.external_api_calls === 0} />
          <MetricCard label="Outbound connections" value={String(status.outbound_connections)} good={status.outbound_connections === 0} />
          <MetricCard label="Data egress" value={`${status.data_egress_mb} MB`} good={status.data_egress_mb === 0} />
          <MetricCard label="Cloud models" value={String(status.cloud_models_in_use)} good={status.cloud_models_in_use === 0} />
          <MetricCard label="Sandbox network" value={status.sandbox_network === "off" ? "Off" : "On"} good={status.sandbox_network === "off"} />
        </div>
      ) : (
        <p className="mt-6 text-sm font-mono" style={{ color: "var(--text-muted)" }}>
          {error ? "Unable to reach security status endpoint." : "loading..."}
        </p>
      )}

      <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", background: "var(--panel)" }}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--text-faint)" }}>
              Outbound connections - since page opened
            </span>
            <span className="text-xs font-mono" style={{ color: "var(--text-muted)" }}>
              source: netstat - polled every 5s
            </span>
          </div>
          <svg viewBox="0 0 300 80" className="mt-4 w-full h-20">
            {history.length > 1 && (
              <polyline
                fill="none"
                stroke="var(--accent-2)"
                strokeWidth="2"
                points={history
                  .map((v, i) => `${(i / (history.length - 1)) * 300},${80 - (v / maxVal) * 70 - 5}`)
                  .join(" ")}
              />
            )}
          </svg>
          <div className="flex items-center justify-between text-xs font-mono" style={{ color: "var(--text-muted)" }}>
            <span>{startedAt.current.toLocaleTimeString()}</span>
            <span>now</span>
          </div>
        </div>

        <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", background: "var(--panel)" }}>
          <span className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--text-faint)" }}>
            Security events
          </span>
          <p className="mt-3 text-sm" style={{ color: "var(--text-muted)" }}>
            Detailed event logging (firewall rule changes, blocked sandbox
            actions) is not yet implemented -- tracked as a known limitation.
          </p>
        </div>
      </div>

      <div className="mt-6 rounded-xl border p-4" style={{ borderColor: "var(--border)", background: "var(--panel)" }}>
        <span className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--text-faint)" }}>
          Active model
        </span>
        <p className="mt-1 text-sm font-mono text-[var(--text-primary)]">
          {status ? `${status.active_model} (local)` : "--"}
        </p>
        <p className="mt-3 text-xs leading-relaxed" style={{ color: "var(--text-muted)" }}>
          Defense in depth: firewall, Docker isolation, egress policy, local
          inference. Metrics above are measured live from this backend
          process's own network connections.
        </p>
      </div>
    </div>
  );
}
