// src/components/Sidebar.tsx
"use client";

import {
  MessageSquare,
  Folder,
  ScanLine,
  PenLine,
  Code2,
  Layers,
  ShieldCheck,
  Activity,
} from "lucide-react";

const NAV_ITEMS = [
  { key: "Chat", label: "AI Assistant", icon: MessageSquare },
  { key: "Documents", label: "Document Vault", icon: Folder },
  { key: "Scan", label: "Scan Analysis", icon: ScanLine },
  { key: "Review", label: "Review & Sign-Off", icon: PenLine },
  { key: "Sandbox", label: "Code Sandbox", icon: Code2 },
  { key: "Models", label: "Model Registry", icon: Layers },
  { key: "Security", label: "Security Center", icon: ShieldCheck },
  { key: "Audit", label: "Activity Log", icon: Activity },
] as const;

export type NavKey = (typeof NAV_ITEMS)[number]["key"];

export default function Sidebar({
  active,
  onChange,
}: {
  active: NavKey;
  onChange: (key: NavKey) => void;
}) {
  return (
    <aside
      className="w-56 shrink-0 h-full flex flex-col border-r px-3 py-4"
      style={{ borderColor: "var(--border)" }}
    >
      <nav className="flex flex-col gap-0.5">
        {NAV_ITEMS.map(({ key, label, icon: Icon }) => {
          const isActive = key === active;
          return (
            <button
              key={key}
              onClick={() => onChange(key)}
              className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors text-left"
              style={{
                background: isActive ? "var(--accent-soft-bg)" : "transparent",
                color: isActive ? "var(--accent-2)" : "var(--text-secondary)",
                fontWeight: isActive ? 500 : 400,
              }}
            >
              <Icon className="h-4 w-4 shrink-0" strokeWidth={2} />
              {label}
            </button>
          );
        })}
      </nav>

      <div
        className="mt-auto rounded-xl p-3"
        style={{ background: "var(--accent-soft-bg)" }}
      >
        <span
          className="text-xs font-medium uppercase tracking-wide"
          style={{ color: "var(--accent-2)" }}
        >
          Air-gap status
        </span>
        <p className="mt-1 text-sm font-medium text-[var(--text-primary)]">
          All processing local
        </p>
        <p className="mt-1 text-xs" style={{ color: "var(--text-secondary)" }}>
          Firewall active - sandbox isolated
        </p>
      </div>
    </aside>
  );
}
