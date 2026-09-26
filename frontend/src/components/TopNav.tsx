// src/components/TopNav.tsx
"use client";

import { MessageSquare, FileText, ClipboardCheck, ScrollText } from "lucide-react";
import ThemeToggle from "./ThemeToggle";

const TABS = [
  { key: "Chat", label: "AI Assistant", sub: "Smart workbench", icon: MessageSquare },
  { key: "Documents", label: "Document Vault", sub: "Files & knowledge base", icon: FileText },
  { key: "Review", label: "Review & Sign-Off", sub: "Supervisor approval", icon: ClipboardCheck },
  { key: "Audit", label: "Activity Log", sub: "Compliance record", icon: ScrollText },
] as const;

type Tab = (typeof TABS)[number]["key"];

export default function TopNav({
  active,
  onChange,
}: {
  active: Tab;
  onChange: (tab: Tab) => void;
}) {
  return (
    <nav className="flex items-center justify-between px-8 lg:px-14">
      <div className="flex items-center gap-1">
        {TABS.map(({ key, label, sub, icon: Icon }) => {
          const isActive = key === active;
          return (
            <button
              key={key}
              onClick={() => onChange(key)}
              className="relative flex items-center gap-2 px-3 py-3 text-sm transition-colors"
              style={{
                color: isActive ? "var(--text-primary)" : "var(--text-muted)",
              }}
            >
              <Icon className="h-4 w-4" strokeWidth={2} />
              <span className="hidden md:inline">
                {label}
                <span
                  className="ml-1.5 font-normal text-xs"
                  style={{ color: "var(--text-faint)" }}
                >
                  — {sub}
                </span>
              </span>
              <span className="md:hidden">{label}</span>
              {isActive && (
                <span
                  className="absolute left-3 right-3 -bottom-px h-px"
                  style={{ background: "var(--accent)" }}
                />
              )}
            </button>
          );
        })}
      </div>

      <ThemeToggle />
    </nav>
  );
}