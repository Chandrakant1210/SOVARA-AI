// src/components/LoginScreen.tsx
"use client";

import { useState } from "react";
import { login, register } from "@/lib/api";
import { useAuth } from "@/lib/AuthContext";

export default function LoginScreen() {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const { setAuthenticated } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) return;

    setLoading(true);
    setError("");

    try {
      if (mode === "register") {
        await register(email, password);
      }
      await login(email, password);
      setAuthenticated(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center px-8 bg-[#0A0E12]"
      style={{
        backgroundImage: "radial-gradient(circle, #161C22 1px, transparent 1px)",
        backgroundSize: "28px 28px",
      }}
    >
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-lg font-semibold text-[#E7ECEF] tracking-tight">
            SOVARA
          </h1>
          <p className="mt-1 text-sm text-[#5B6670]">
            Sign in to the sovereign AI workbench
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div>
            <label className="block text-xs font-mono text-[#5B6670] mb-1.5">
              email
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-sm bg-[#10151A] border border-[#1E262C] text-[#E7ECEF] placeholder:text-[#5B6670] px-3 py-2.5 text-[15px] focus:outline-none focus:border-[#2FD9C3]/60 transition-colors"
              placeholder="engineer@mrpl.com"
            />
          </div>

          <div>
            <label className="block text-xs font-mono text-[#5B6670] mb-1.5">
              password
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-sm bg-[#10151A] border border-[#1E262C] text-[#E7ECEF] placeholder:text-[#5B6670] px-3 py-2.5 text-[15px] focus:outline-none focus:border-[#2FD9C3]/60 transition-colors"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <div className="rounded-sm border border-[#4A2A2A] bg-[#1A1010] p-3 text-sm text-[#E5A3A3]">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="mt-2 bg-[#2FD9C3] text-[#0A0E12] font-medium text-sm px-5 py-2.5 rounded-sm hover:bg-[#4FE5D1] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            {loading
              ? mode === "register"
                ? "Creating account…"
                : "Signing in…"
              : mode === "register"
              ? "Create account"
              : "Sign in"}
          </button>

          <button
            type="button"
            onClick={() => {
              setMode(mode === "login" ? "register" : "login");
              setError("");
            }}
            className="text-xs text-[#5B6670] hover:text-[#8B98A3] transition-colors mt-1"
          >
            {mode === "login"
              ? "New here? Create an account"
              : "Already have an account? Sign in"}
          </button>
        </form>

        <p className="mt-8 text-xs text-[#5B6670] text-center leading-relaxed">
          All authentication happens on local infrastructure.
          <br />
          No credentials leave MRPL&apos;s network.
        </p>
      </div>
    </div>
  );
}
