// src/components/SecurityPanel.tsx
"use client";

import { useEffect, useState } from "react";
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

export default function SecurityPanel() {
  const [status, setStatus] = useState<SecurityStatus | null>(null);
  const [error, setError] = useState(false);

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

  const metrics = status
    ? [
        {
          label: "Internet access",
          value: status.internet_access === "blocked" ? "Blocked" : "Detected",
          good: status.internet_access === "blocked",
        },
        {
          label: "Outbound connections",
          value: String(status.outbound_connections),
          good: status.outbound_connections === 0,
        },
        {
          label: "External API calls",
          value: String(status.external_api_calls),
          good: status.external_api_calls === 0,
        },
        {
          label: "Cloud models in use",
          value: String(status.cloud_models_in_use),
          good: status.cloud_models_in_use === 0,
        },
        {
          label: "Data egress",
          value: `${status.data_egress_mb} MB`,
          good: status.data_egress_mb === 0,
        },
        {
          label: "Sandbox network",
          value: status.sandbox_network === "off" ? "Off" : "On",
          good: status.sandbox_network === "off",
        },
      ]
    : [];

  return (
    <div className="flex flex-col h-full px-8 py-10 lg:px-10 lg:py-14 border-t lg:border-t-0 lg:border-l border-[#1E262C]">
      <div className="flex items-center gap-2">
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#2FD9C3] opacity-60" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-[#2FD9C3]" />
        </span>
        <h2 className="text-sm font-medium text-[#E7ECEF]">Security Center</h2>
      </div>
      <p className="mt-2 text-xs text-[#5B6670] leading-relaxed">
        {error
          ? "Unable to reach security status endpoint."
          : "Live measurement via netstat — refreshed every 5s."}
      </p>

      <div className="mt-8 flex flex-col">
        {status ? (
          metrics.map((m) => (
            <div
              key={m.label}
              className="flex items-baseline justify-between py-3 border-b border-[#1E262C]"
            >
              <span className="text-sm text-[#8B98A3]">{m.label}</span>
              <span
                className={`font-mono text-sm ${
                  m.good ? "text-[#2FD9C3]" : "text-[#E5A3A3]"
                }`}
              >
                {m.value}
              </span>
            </div>
          ))
        ) : (
          <p className="text-sm text-[#5B6670] font-mono">
            {error ? "—" : "loading…"}
          </p>
        )}
        <div className="flex items-baseline justify-between py-3 border-b border-[#1E262C]">
          <span className="text-sm text-[#8B98A3]">Active model</span>
          <span className="font-mono text-sm text-[#E7ECEF]">
            {status ? `${status.active_model} (local)` : "—"}
          </span>
        </div>
      </div>

      <div className="mt-auto pt-8">
        <p className="text-xs text-[#5B6670] leading-relaxed">
          Defense in depth: firewall, Docker isolation, egress policy,
          local inference. Metrics above are measured live from this
          backend process&apos;s own network connections.
        </p>
      </div>
    </div>
  );
}