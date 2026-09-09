// src/components/SecurityPanel.tsx
type Metric = {
  label: string;
  value: string;
  state: "good" | "neutral";
};

const metrics: Metric[] = [
  { label: "Internet access", value: "Blocked", state: "good" },
  { label: "Outbound connections", value: "0", state: "good" },
  { label: "External API calls", value: "0", state: "good" },
  { label: "Cloud models in use", value: "0", state: "good" },
  { label: "Data egress", value: "0 MB", state: "good" },
  { label: "Sandbox network", value: "Off", state: "good" },
  { label: "Active model", value: "Qwen3 14B (local)", state: "neutral" },
];

export default function SecurityPanel() {
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
        Static preview — wired to live tcpdump telemetry in Sprint 11.
      </p>

      <div className="mt-8 flex flex-col">
        {metrics.map((m) => (
          <div
            key={m.label}
            className="flex items-baseline justify-between py-3 border-b border-[#1E262C]"
          >
            <span className="text-sm text-[#8B98A3]">{m.label}</span>
            <span
              className={`font-mono text-sm ${
                m.state === "good" ? "text-[#2FD9C3]" : "text-[#E7ECEF]"
              }`}
            >
              {m.value}
            </span>
          </div>
        ))}
      </div>

      <div className="mt-auto pt-8">
        <p className="text-xs text-[#5B6670] leading-relaxed">
          Defense in depth: firewall, Docker isolation, egress policy,
          local inference. Zero-egress proof will be captured live for
          judges from packet-level network monitoring.
        </p>
      </div>
    </div>
  );
}