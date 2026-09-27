// src/components/ModelRegistryPanel.tsx
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw, Layers, Loader2, ArrowRight } from "lucide-react";
import { authFetch } from "@/lib/api";

// ---------- API types ----------

type ModelStatus = "loaded" | "installed" | "not_installed" | "disabled";

type RegistryModel = {
  id: string;
  model_name: string;
  capability: string;
  description: string | null;
  context_length: number | null;
  status: ModelStatus;
  parameter_size: string | null;
  quantization: string | null;
  size_bytes: number | null;
  vram_bytes: number | null;
  serves: string[];
};

type RoutingRow = {
  capability: string;
  label: string;
  model_name: string | null;
  capability_served: string | null;
  fallback: boolean;
  reason: string | null;
};

type Unregistered = {
  model_name: string;
  parameter_size: string | null;
  quantization: string | null;
  size_bytes: number | null;
  registrable: boolean;
  note: string | null;
};

type Registry = {
  ollama_reachable: boolean;
  ollama_error: string | null;
  models: RegistryModel[];
  routing: RoutingRow[];
  unregistered_installed: Unregistered[];
  registrable_capabilities: string[];
  can_manage: boolean;
  can_register: boolean;
};

// ---------- helpers ----------

const REFRESH_MS = 20_000;

async function readError(res: Response): Promise<string> {
  const body = await res.json().catch(() => null);
  if (Array.isArray(body?.detail)) return body.detail.map((e: { msg: string }) => e.msg).join(", ");
  return body?.detail ?? `Request failed with status ${res.status}`;
}

function gb(bytes: number | null): string | null {
  if (bytes == null) return null;
  const v = bytes / 1024 ** 3;
  return v >= 1 ? `${v.toFixed(1)} GB` : `${Math.round(bytes / 1024 ** 2)} MB`;
}

const STATUS: Record<ModelStatus, { text: string; dot: string; bg: string; fg: string }> = {
  loaded: { text: "Loaded", dot: "var(--accent-2)", bg: "var(--accent-soft-bg)", fg: "var(--accent-2)" },
  installed: { text: "On demand", dot: "var(--text-muted)", bg: "var(--bg)", fg: "var(--text-secondary)" },
  not_installed: { text: "Not installed", dot: "var(--accent-3)", bg: "var(--bg)", fg: "var(--accent-3)" },
  disabled: { text: "Disabled", dot: "var(--text-faint)", bg: "var(--bg)", fg: "var(--text-muted)" },
};

const cardStyle = { borderColor: "var(--border)", background: "var(--panel)" };
const cardTitle = "text-[11px] font-mono font-semibold tracking-[0.08em]";
const tagClass = "text-[11px] font-mono px-2 py-0.5 rounded";

// ---------- component ----------

export default function ModelRegistryPanel() {
  const [data, setData] = useState<Registry | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloading, setReloading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const [regModel, setRegModel] = useState("");
  const [regCapability, setRegCapability] = useState("reasoning");
  const [regDescription, setRegDescription] = useState("");
  const [registering, setRegistering] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await authFetch("/api/models/registry");
      if (!res.ok) throw new Error(await readError(res));
      setData(await res.json());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load the model registry");
    }
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(load, REFRESH_MS); // "Loaded" changes as Ollama loads/unloads models
    return () => clearInterval(timer);
  }, [load]);

  const registrable = useMemo(() => data?.unregistered_installed.filter((u) => u.registrable) ?? [], [data]);
  useEffect(() => {
    if (!regModel && registrable.length > 0) setRegModel(registrable[0].model_name);
  }, [registrable, regModel]);

  const reload = async () => {
    setReloading(true);
    setNotice(null);
    try {
      const res = await authFetch("/api/models/reload", { method: "POST" });
      if (!res.ok) throw new Error(await readError(res));
      await load();
      setNotice("Registry reloaded from models.yaml and Ollama.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reload failed");
    } finally {
      setReloading(false);
    }
  };

  const register = async () => {
    if (!regModel) return;
    setRegistering(true);
    setNotice(null);
    try {
      const res = await authFetch("/api/models/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model_name: regModel, capability: regCapability, description: regDescription }),
      });
      if (!res.ok) throw new Error(await readError(res));
      const body = await res.json();
      setNotice(`Registered ${body.model_name} for ${body.capability}. The router uses it from now on.`);
      setRegModel("");
      setRegDescription("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setRegistering(false);
    }
  };

  const exampleName = regModel || registrable[0]?.model_name || "your-model:tag";
  const yamlPreview = `${exampleName.replace(/[^a-z0-9.]+/gi, "-").toLowerCase()}:
  capability: ${regCapability}
  provider: ollama
  model_name: ${exampleName}
  available: true`;

  return (
    <div className="h-full overflow-y-auto p-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--text-primary)]">Model Registry</h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">Which local model handles which task, and what is loaded on the GPU right now.</p>
        </div>
        <button onClick={reload} disabled={!data?.can_manage || reloading} title={data && !data.can_manage ? "Only managers and admins can reload the registry" : undefined} className="flex items-center gap-2 text-sm font-semibold px-4 py-2.5 rounded-lg border transition-opacity hover:opacity-80 disabled:opacity-50" style={{ borderColor: "var(--border)", background: "var(--panel)", color: "var(--text-primary)" }}>
          <RefreshCw className={`h-4 w-4 ${reloading ? "animate-spin" : ""}`} /> Reload registry
        </button>
      </div>

      {error && <div className="mt-4 rounded-lg px-4 py-3 text-sm" style={{ background: "var(--error-bg)", color: "var(--error-text)" }}>{error}</div>}
      {notice && <div className="mt-4 rounded-lg px-4 py-3 text-sm" style={{ background: "var(--accent-soft-bg)", color: "var(--accent-2)" }}>{notice}</div>}
      {data && !data.ollama_reachable && (
        <div className="mt-4 rounded-lg px-4 py-3 text-sm" style={{ background: "var(--error-bg)", color: "var(--error-text)" }}>The local Ollama server is not reachable, so model status is unknown. {data.ollama_error}</div>
      )}
      {!data && !error && <p className="mt-6 flex items-center gap-2 text-sm" style={{ color: "var(--text-muted)" }}><Loader2 className="h-4 w-4 animate-spin" /> Checking models...</p>}

      {data && (
        <>
          {/* Model cards */}
          <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            {data.models.map((m) => {
              const st = STATUS[m.status];
              const fallbackTasks = m.serves.filter((c) => c !== m.capability);
              const spec = [m.parameter_size, m.quantization, m.status === "loaded" && m.vram_bytes ? `VRAM ${gb(m.vram_bytes)}` : gb(m.size_bytes) ? `${gb(m.size_bytes)} on disk` : null].filter(Boolean).join(" \u00b7 ");
              return (
                <div key={m.id} className="rounded-xl border px-4 py-4 flex flex-col gap-3" style={{ ...cardStyle, opacity: m.status === "disabled" ? 0.75 : 1 }} title={m.description ?? undefined}>
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-base font-semibold text-[var(--text-primary)] break-all">{m.model_name}</span>
                    <span className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full whitespace-nowrap shrink-0" style={{ background: st.bg, color: st.fg }}>
                      <span className="h-1.5 w-1.5 rounded-full" style={{ background: st.dot }} /> {st.text}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <span className={tagClass} style={{ background: "var(--bg)", color: "var(--text-primary)" }}>{m.capability}</span>
                    {fallbackTasks.map((c) => (
                      <span key={c} className={tagClass} style={{ background: "var(--bg)", color: "var(--accent-3)" }} title="Served through fallback">{c} &middot; fallback</span>
                    ))}
                  </div>
                  <p className="text-xs font-mono" style={{ color: "var(--text-secondary)" }}>
                    {spec || (m.status === "disabled" ? "disabled in models.yaml" : "not installed in Ollama")}
                  </p>
                </div>
              );
            })}
          </div>

          <div className="mt-5 grid grid-cols-1 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] gap-5 items-start">
            {/* Routing rules */}
            <div className="rounded-xl border px-5 py-4" style={cardStyle}>
              <span className={cardTitle} style={{ color: "var(--text-secondary)" }}>ROUTING RULES &middot; TASK TYPE &rarr; MODEL</span>
              <div className="mt-2">
                {data.routing.map((r) => (
                  <div key={r.capability} className="py-3 border-b last:border-b-0" style={{ borderColor: "var(--border)" }} title={r.reason ?? undefined}>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm text-[var(--text-primary)]">{r.label}</span>
                      <span className="flex items-center gap-2 text-sm font-mono font-semibold whitespace-nowrap" style={{ color: r.model_name ? (r.fallback ? "var(--accent-3)" : "var(--accent-2)") : "var(--error-text)" }}>
                        <ArrowRight className="h-3.5 w-3.5" style={{ color: "var(--text-muted)" }} />
                        {r.model_name ?? "no model available"}
                      </span>
                    </div>
                    {(r.fallback || !r.model_name) && r.reason && <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>{r.reason}</p>}
                  </div>
                ))}
              </div>
              <p className="mt-3 text-xs" style={{ color: "var(--text-muted)" }}>A model counts as available only if it is enabled in models.yaml and installed in the local Ollama server. If no model for a task is available, the router falls back to the reasoning model and says so.</p>
            </div>

            {/* Add a model */}
            <div className="rounded-xl border px-5 py-4" style={cardStyle}>
              <span className={cardTitle} style={{ color: "var(--text-secondary)" }}>ADD A MODEL &middot; models.yaml</span>
              <pre className="mt-3 rounded-lg p-3 text-xs font-mono leading-relaxed overflow-x-auto" style={{ background: "var(--bg)", color: "var(--text-primary)" }}>{yamlPreview}</pre>
              <p className="mt-2 text-xs" style={{ color: "var(--text-secondary)" }}>One entry, no code change. The model must already be installed in the local Ollama server; nothing is downloaded.</p>

              <div className="mt-4">
                <span className="text-xs font-semibold" style={{ color: "var(--text-secondary)" }}>Installed in Ollama, not registered</span>
                {data.unregistered_installed.length === 0 && <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>None. Every installed model is registered.</p>}
                {data.unregistered_installed.map((u) => (
                  <div key={u.model_name} className="mt-2 text-xs">
                    <span className="font-mono font-semibold text-[var(--text-primary)]">{u.model_name}</span>
                    <span style={{ color: "var(--text-muted)" }}> {[u.parameter_size, u.quantization, gb(u.size_bytes)].filter(Boolean).join(" \u00b7 ")}</span>
                    {!u.registrable && u.note && <p className="mt-0.5" style={{ color: "var(--accent-3)" }}>{u.note}</p>}
                  </div>
                ))}
              </div>

              {data.can_register ? (
                registrable.length > 0 ? (
                  <div className="mt-4 flex flex-col gap-2">
                    <select value={regModel} onChange={(e) => setRegModel(e.target.value)} className="text-sm rounded-lg border px-3 py-2 focus:outline-none" style={{ borderColor: "var(--border)", background: "var(--panel)", color: "var(--text-primary)" }} aria-label="Model to register">
                      {registrable.map((u) => <option key={u.model_name} value={u.model_name}>{u.model_name}</option>)}
                    </select>
                    <select value={regCapability} onChange={(e) => setRegCapability(e.target.value)} className="text-sm rounded-lg border px-3 py-2 focus:outline-none" style={{ borderColor: "var(--border)", background: "var(--panel)", color: "var(--text-primary)" }} aria-label="Capability">
                      {data.registrable_capabilities.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <input value={regDescription} onChange={(e) => setRegDescription(e.target.value)} maxLength={200} placeholder="Description (optional)" className="text-sm rounded-lg border px-3 py-2 bg-transparent text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none" style={{ borderColor: "var(--border)" }} />
                    <button onClick={register} disabled={registering || !regModel} className="mt-1 flex items-center justify-center gap-2 text-sm font-semibold px-4 py-2.5 rounded-lg transition-opacity hover:opacity-90 disabled:opacity-50" style={{ background: "var(--accent)", color: "var(--accent-fg)" }}>
                      {registering ? <Loader2 className="h-4 w-4 animate-spin" /> : <Layers className="h-4 w-4" />} Register model
                    </button>
                  </div>
                ) : (
                  <p className="mt-4 text-xs" style={{ color: "var(--text-muted)" }}>No installed model can be registered right now. Load a chat model into Ollama offline, then reload the registry.</p>
                )
              ) : (
                <p className="mt-4 text-xs" style={{ color: "var(--text-muted)" }}>Only admins can register models. Changes are written to models.yaml and recorded in the audit log.</p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}