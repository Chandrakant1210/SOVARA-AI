// src/components/TopNav.tsx
"use client";

import { useState } from "react";

const TABS = ["Chat", "Documents", "Review", "Audit"] as const;
type Tab = (typeof TABS)[number];

export default function TopNav({
  active,
  onChange,
}: {
  active: Tab;
  onChange: (tab: Tab) => void;
}) {
  return (
    <nav className="flex items-center gap-1 px-8 lg:px-14">
      {TABS.map((tab) => {
        const isActive = tab === active;
        return (
          <button
            key={tab}
            onClick={() => onChange(tab)}
            className={`relative px-3 py-3 text-sm transition-colors ${
              isActive
                ? "text-[#E7ECEF]"
                : "text-[#5B6670] hover:text-[#8B98A3]"
            }`}
          >
            {tab}
            {isActive && (
              <span className="absolute left-3 right-3 -bottom-px h-px bg-[#2FD9C3]" />
            )}
          </button>
        );
      })}
    </nav>
  );
}