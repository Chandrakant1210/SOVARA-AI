// src/components/TopBar.tsx
"use client";

import { useAuth } from "@/lib/AuthContext";
import ThemeToggle from "./ThemeToggle";

export default function TopBar() {
  const { logout } = useAuth();

  return (
    <header
      className="flex items-center justify-between px-6 py-3 border-b"
      style={{ borderColor: "var(--border)" }}
    >
      <div className="flex items-center gap-3">
        <div
          className="h-8 w-8 rounded-lg flex items-center justify-center font-semibold text-sm"
          style={{ background: "var(--accent)", color: "var(--accent-fg)" }}
        >
          S
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-[var(--text-primary)]">
              SOVARA AI
            </span>
            <span
              className="text-[10px] font-mono px-1.5 py-0.5 rounded"
              style={{ background: "var(--border)", color: "var(--text-muted)" }}
            >
              v1.0
            </span>
          </div>
          <p className="text-xs text-[var(--text-muted)]">
            Private AI workstation for engineering & operations
          </p>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <span className="text-xs font-mono text-[var(--text-muted)] hidden sm:inline">
          Server: Local-Node-01
        </span>
        <span
          className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full"
          style={{ background: "var(--accent-soft-bg)", color: "var(--accent-2)" }}
        >
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{ background: "var(--accent-2)" }}
          />
          Air-gapped · 0 egress
        </span>
        <ThemeToggle />
        <button
          onClick={logout}
          className="h-8 w-8 rounded-full flex items-center justify-center text-xs font-semibold"
          style={{ background: "var(--accent-3)", color: "var(--accent-fg)" }}
          title="Sign out"
        >
          {"U"}
        </button>
      </div>
    </header>
  );
}