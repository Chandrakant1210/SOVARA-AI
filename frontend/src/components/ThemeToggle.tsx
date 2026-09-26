// src/components/ThemeToggle.tsx
"use client";

import { Sun, Moon } from "lucide-react";
import { useTheme } from "@/lib/ThemeContext";

export default function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";

  return (
    <button
      onClick={toggleTheme}
      aria-label="Toggle theme"
      className="relative inline-flex items-center h-7 w-14 rounded-full transition-colors shrink-0"
      style={{
        background: isDark ? "var(--panel)" : "var(--border)",
        border: "1px solid var(--border)",
      }}
    >
      <span
        className="absolute flex items-center justify-center h-5 w-5 rounded-full transition-transform"
        style={{
          background: "var(--accent)",
          transform: isDark ? "translateX(4px)" : "translateX(30px)",
        }}
      >
        {isDark ? (
          <Moon className="h-3 w-3" style={{ color: "var(--accent-fg)" }} strokeWidth={2.5} />
        ) : (
          <Sun className="h-3 w-3" style={{ color: "var(--accent-fg)" }} strokeWidth={2.5} />
        )}
      </span>
    </button>
  );
}