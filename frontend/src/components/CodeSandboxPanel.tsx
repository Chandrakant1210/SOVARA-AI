// src/components/CodeSandboxPanel.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import CodeMirror, { EditorView } from "@uiw/react-codemirror";
import { python } from "@codemirror/lang-python";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags } from "@lezer/highlight";
import { Play, Sparkles, Loader2, CheckCircle2, XCircle, Clock, AlertTriangle } from "lucide-react";
import { authFetch } from "@/lib/api";

// ---------- API types ----------

type SandboxInfo = {
  docker_available: boolean;
  image: string;
  image_available: boolean;
  python_version: string | null;
  network: string;
  timeout_seconds: number;
  memory_limit: string;
  cpu_cores: number;
  pids_limit: number;
  root_filesystem: string;
  runs_as: string;
  host_secrets: string;
  max_code_chars: number;
  can_run: boolean;
};

type RunResult = {
  run_id: string;
  stdout: string;
  stderr: string;
  exit_code: number;
  timed_out: boolean;
  duration_ms: number;
  output_truncated: boolean;
  runner: "pytest" | "python";
  test_summary: string | null;
};

type GenerateResult = {
  code: string;
  filename: string;
  model_name: string;
  capability_requested: string;
  capability_served: string;
  reason: string;
  duration_ms: number;
};

// ---------- helpers ----------

const STARTER_CODE = `# Describe a task above to generate code with the local model,
# or write Python here. Functions named test_* run with pytest.

def add(a, b):
    return a + b

def test_add():
    assert add(2, 3) == 5
`;

async function readError(res: Response): Promise<string> {
  const body = await res.json().catch(() => null);
  if (Array.isArray(body?.detail)) return body.detail.map((e: { msg: string }) => e.msg).join(", ");
  return body?.detail ?? `Request failed with status ${res.status}`;
}

function formatMemory(limit: string): string {
  const m = /^(\d+)\s*([kmg])b?$/i.exec(limit.trim());
  if (!m) return limit;
  return `${m[1]} ${m[2].toUpperCase()}B`;
}

// Editor colors come from the app's CSS variables, so light/dark themes just work.
const editorTheme = EditorView.theme({
  "&": { backgroundColor: "transparent", color: "var(--text-primary)", fontSize: "13.5px" },
  ".cm-content": { fontFamily: "var(--font-mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace)", caretColor: "var(--accent-2)" },
  ".cm-gutters": { backgroundColor: "transparent", color: "var(--text-muted)", border: "none" },
  ".cm-activeLine": { backgroundColor: "var(--accent-soft-bg)" },
  ".cm-activeLineGutter": { backgroundColor: "transparent", color: "var(--text-secondary)" },
  "&.cm-focused": { outline: "none" },
  ".cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection": { backgroundColor: "var(--accent-soft-bg)" },
  ".cm-cursor": { borderLeftColor: "var(--accent-2)" },
});

const highlight = HighlightStyle.define([
  { tag: [tags.keyword, tags.controlKeyword, tags.definitionKeyword, tags.operatorKeyword], color: "var(--accent-2)", fontWeight: "600" },
  { tag: [tags.string, tags.docString], color: "var(--accent-3)" },
  { tag: [tags.comment, tags.lineComment], color: "var(--text-muted)", fontStyle: "italic" },
  { tag: [tags.number, tags.bool, tags.null], color: "var(--accent-3)" },
  { tag: [tags.function(tags.definition(tags.variableName)), tags.function(tags.variableName)], color: "var(--text-primary)", fontWeight: "600" },
]);

const cardStyle = { borderColor: "var(--border)", background: "var(--panel)" };
const cardTitle = "text-[11px] font-mono font-semibold tracking-[0.08em]";

// ---------- component ----------

export default function CodeSandboxPanel() {
  const [info, setInfo] = useState<SandboxInfo | null>(null);
  const [infoError, setInfoError] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const [code, setCode] = useState(STARTER_CODE);
  const [filename, setFilename] = useState("script.py");
  const [route, setRoute] = useState<GenerateResult | null>(null);
  const [result, setResult] = useState<RunResult | null>(null);
  const [generating, setGenerating] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showLog, setShowLog] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await authFetch("/api/sandbox/info");
        if (!res.ok) throw new Error(await readError(res));
        setInfo(await res.json());
      } catch (err) {
        setInfoError(err instanceof Error ? err.message : "Could not load sandbox status");
      }
    })();
  }, []);

  const extensions = useMemo(() => [python(), editorTheme, syntaxHighlighting(highlight)], []);
  const ready = !!info && info.docker_available && info.image_available;
  const canRun = ready && !!info?.can_run;
  const busy = generating || running;

  const runCode = async (source: string) => {
    if (!source.trim()) return;
    setRunning(true);
    setError(null);
    setResult(null);
    setShowLog(false);
    try {
      const res = await authFetch("/api/sandbox/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: source }),
      });
      if (!res.ok) throw new Error(await readError(res));
      const data: RunResult = await res.json();
      setResult(data);
      if (data.exit_code !== 0 || data.timed_out) setShowLog(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Run failed");
    } finally {
      setRunning(false);
    }
  };

  const generate = async () => {
    const text = prompt.trim();
    if (!text) return;
    setGenerating(true);
    setError(null);
    setRoute(null);
    setResult(null);
    try {
      const res = await authFetch("/api/sandbox/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: text }),
      });
      if (!res.ok) throw new Error(await readError(res));
      const data: GenerateResult = await res.json();
      setRoute(data);
      setCode(data.code);
      setFilename(data.filename);
      setGenerating(false);
      // Generated code is verified immediately, inside the isolated container.
      await runCode(data.code);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setGenerating(false);
    }
  };

  const verdict = (() => {
    if (!result) return null;
    if (result.timed_out) return { text: `Timed out after ${info?.timeout_seconds ?? ""} s`, Icon: Clock, bg: "var(--error-bg)", fg: "var(--error-text)" };
    if (result.exit_code === 0) {
      return { text: result.runner === "pytest" ? "Verified in sandbox" : "Ran successfully in sandbox", Icon: CheckCircle2, bg: "var(--accent-soft-bg)", fg: "var(--accent-2)" };
    }
    return { text: result.runner === "pytest" ? "Tests failed in sandbox" : "Failed in sandbox", Icon: XCircle, bg: "var(--error-bg)", fg: "var(--error-text)" };
  })();

  const isFallback = route && route.capability_served !== route.capability_requested;

  const limits: [string, string][] = info
    ? [
        ["Network", info.network === "disabled" ? "none" : info.network],
        ["CPU", `${info.cpu_cores} ${info.cpu_cores === 1 ? "core" : "cores"}`],
        ["Memory", formatMemory(info.memory_limit)],
        ["Timeout", `${info.timeout_seconds} s`],
        ["Processes", `max ${info.pids_limit}`],
        ["Filesystem", info.root_filesystem],
        ["User", "non-root"],
        ["Host secrets", info.host_secrets],
      ]
    : [];

  return (
    <div className="h-full overflow-y-auto p-6">
      {/* Header */}
      <h1 className="text-2xl font-semibold text-[var(--text-primary)]">Code Sandbox</h1>
      <p className="mt-1 text-sm text-[var(--text-secondary)]">Generated code runs in an isolated container with networking switched off.</p>

      {/* Prompt bar */}
      <div className="mt-5 rounded-xl border px-4 py-3" style={cardStyle}>
        <div className="flex flex-wrap items-center gap-3">
          <input
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && canRun && !busy) generate(); }}
            maxLength={2000}
            placeholder="Describe a task, e.g. write a function for minimum shell thickness with corrosion allowance, and test it."
            className="flex-1 min-w-[260px] bg-transparent text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none py-1.5"
            disabled={!canRun || busy}
            aria-label="Task description"
          />
          {route && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold px-3 py-1 rounded-full whitespace-nowrap" style={{ background: "var(--accent-soft-bg)", color: "var(--accent-2)" }}>Routed &rarr; {route.model_name}</span>
              <span className="text-xs font-semibold px-3 py-1 rounded-full whitespace-nowrap" style={{ background: "var(--accent-soft-bg)", color: isFallback ? "var(--accent-3)" : "var(--text-secondary)" }} title={route.reason}>
                {isFallback ? "fallback: no coding model installed" : "reason: code task"}
              </span>
            </div>
          )}
          <button onClick={generate} disabled={!canRun || busy || !prompt.trim()} className="flex items-center gap-2 text-sm font-semibold px-4 py-2 rounded-lg transition-opacity hover:opacity-90 disabled:opacity-50 shrink-0" style={{ background: "var(--accent)", color: "var(--accent-fg)" }}>
            {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {generating ? "Generating..." : "Generate"}
          </button>
        </div>
        {generating && <p className="mt-2 text-xs" style={{ color: "var(--text-muted)" }}>The local model is writing code. This can take 30&ndash;120 seconds on this hardware.</p>}
        {route && <p className="mt-2 text-xs" style={{ color: "var(--text-muted)" }}>{route.reason} &middot; generated in {(route.duration_ms / 1000).toFixed(1)} s</p>}
      </div>

      {info && !info.can_run && (
        <div className="mt-4 rounded-lg px-4 py-3 text-sm" style={{ background: "var(--accent-soft-bg)", color: "var(--accent-3)" }}>Your role can view the sandbox but not run code. Engineers, managers and admins can generate and run code.</div>
      )}
      {info && (!info.docker_available || !info.image_available) && (
        <div className="mt-4 rounded-lg px-4 py-3 text-sm" style={{ background: "var(--error-bg)", color: "var(--error-text)" }}>
          {!info.docker_available ? "Docker is not running on the server, so code cannot run." : `Sandbox image ${info.image} is not loaded on the server.`}
        </div>
      )}
      {(error || infoError) && <div className="mt-4 rounded-lg px-4 py-3 text-sm" style={{ background: "var(--error-bg)", color: "var(--error-text)" }}>{error || infoError}</div>}

      <div className="mt-5 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_300px] gap-5 items-start">
        {/* Editor */}
        <div className="rounded-xl border p-4" style={cardStyle}>
          <div className="flex items-center justify-between pb-3 mb-2 border-b" style={{ borderColor: "var(--border)" }}>
            <span className="text-sm font-mono" style={{ color: "var(--accent-2)" }}>{filename}</span>
            <span className="text-xs font-mono" style={{ color: "var(--text-muted)" }}>{info?.python_version ? `Python ${info.python_version}` : "Python"}</span>
          </div>
          <CodeMirror
            value={code}
            onChange={(value) => setCode(value)}
            extensions={extensions}
            theme="none"
            minHeight="440px"
            basicSetup={{ highlightActiveLine: true, foldGutter: false, autocompletion: false }}
            editable={!busy}
            aria-label="Python code"
          />
        </div>

        {/* Right column */}
        <div className="flex flex-col gap-4">
          <div className="rounded-xl border px-4 py-4" style={cardStyle}>
            <span className={cardTitle} style={{ color: "var(--text-secondary)" }}>SANDBOX CONTAINER</span>
            {!info && !infoError && <p className="mt-3 text-sm" style={{ color: "var(--text-muted)" }}>Loading...</p>}
            <div className="mt-2">
              {limits.map(([label, value]) => (
                <div key={label} className="flex items-center justify-between py-2 border-b last:border-b-0" style={{ borderColor: "var(--border)" }}>
                  <span className="text-sm" style={{ color: "var(--text-secondary)" }}>{label}</span>
                  <span className="text-sm font-mono font-semibold text-[var(--text-primary)]">{value}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border px-4 py-4" style={cardStyle}>
            <span className={cardTitle} style={{ color: "var(--text-secondary)" }}>OUTPUT</span>
            {running && (
              <p className="mt-3 flex items-center gap-2 text-sm" style={{ color: "var(--text-muted)" }}><Loader2 className="h-4 w-4 animate-spin" /> Running in the isolated container...</p>
            )}
            {!running && !result && <p className="mt-3 text-sm" style={{ color: "var(--text-muted)" }}>Run the code to see the result here.</p>}
            {!running && result && verdict && (
              <>
                <p className="mt-2 text-xs font-mono" style={{ color: "var(--text-muted)" }}>$ {result.runner} {filename}</p>
                {result.test_summary && <p className="mt-1 text-sm font-mono font-semibold" style={{ color: verdict.fg }}>{result.test_summary}</p>}
                {!result.test_summary && <p className="mt-1 text-sm font-mono" style={{ color: "var(--text-secondary)" }}>exit code {result.exit_code}</p>}
                <div className="mt-2 flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold" style={{ background: verdict.bg, color: verdict.fg }}>
                  <verdict.Icon className="h-3.5 w-3.5" /> {verdict.text}
                  <span className="ml-auto font-mono font-normal">{(result.duration_ms / 1000).toFixed(1)} s</span>
                </div>
                {result.output_truncated && <p className="mt-2 flex items-center gap-1 text-xs" style={{ color: "var(--accent-3)" }}><AlertTriangle className="h-3.5 w-3.5" /> Output was truncated.</p>}
                <button onClick={() => setShowLog((v) => !v)} className="mt-2 text-xs underline" style={{ color: "var(--text-secondary)" }}>{showLog ? "Hide full output" : "Show full output"}</button>
                {showLog && (
                  <pre className="mt-2 max-h-72 overflow-auto rounded-lg p-3 text-[11px] leading-relaxed font-mono whitespace-pre-wrap break-words" style={{ background: "var(--bg)", color: "var(--text-primary)" }}>
                    {result.stdout || "(no stdout)"}
                    {result.stderr ? `\n--- stderr ---\n${result.stderr}` : ""}
                  </pre>
                )}
              </>
            )}
          </div>

          <button onClick={() => runCode(code)} disabled={!canRun || busy || !code.trim()} className="flex items-center justify-center gap-2 text-sm font-semibold px-4 py-2.5 rounded-lg border transition-opacity hover:opacity-80 disabled:opacity-50" style={{ borderColor: "var(--border)", background: "var(--panel)", color: "var(--text-primary)" }}>
            {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            {result ? "Run again" : "Run"}
          </button>
        </div>
      </div>
    </div>
  );
}