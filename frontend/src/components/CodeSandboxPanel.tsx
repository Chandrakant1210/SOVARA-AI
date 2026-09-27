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

type GenerateAttempt = {
  attempt: number;
  runner: string;
  test_summary: string | null;
  exit_code: number;
  timed_out: boolean;
  passed: boolean;
};

type GenerateResult = {
  code: string;
  filename: string;
  model_name: string;
  capability_requested: string;
  capability_served: string;
  reason: string;
  duration_ms: number;
  attempts: GenerateAttempt[];
  verified: boolean;
  run: RunResult;
  sources: { source: string; score: number }[];
  reference_note: string | null;
};

// ---------- helpers ----------

const STARTER_CODE = `# Describe a task above to generate code with the local model,
# write Python here, or load a reviewed example. Functions named test_* run with pytest.

def add(a, b):
    return a + b

def test_add():
    assert add(2, 3) == 5
`;

// Engineer-reviewed calculation scripts (not AI-generated). Used to show a
// deterministic, verified sandbox run, e.g. re-checking the V-301 report figures.
const EXAMPLES: { id: string; label: string; filename: string; code: string }[] = [
  {
    id: "remaining-life",
    label: "Corrosion rate & remaining life (V-301 CML-06)",
    filename: "remaining_life.py",
    code: `# Reviewed example: corrosion rate and remaining life (API 510 style).
# Values from the V-301 sample report, CML-06.
import pytest


def corrosion_rate(previous_mm: float, current_mm: float, years: float) -> float:
    """Short-term corrosion rate in mm/year."""
    if years <= 0:
        raise ValueError("years between inspections must be positive")
    if previous_mm <= 0 or current_mm <= 0:
        raise ValueError("thickness readings must be positive")
    return (previous_mm - current_mm) / years


def remaining_life(current_mm: float, t_min_mm: float, rate_mm_per_year: float) -> float:
    """Years until the wall reaches t-min at the given corrosion rate."""
    if current_mm <= t_min_mm:
        return 0.0  # already at or below t-min
    if rate_mm_per_year <= 0:
        return float("inf")  # no measurable corrosion
    return (current_mm - t_min_mm) / rate_mm_per_year


def test_v301_cml06_rate():
    assert corrosion_rate(14.1, 13.1, 3.0) == pytest.approx((14.1 - 13.1) / 3.0)


def test_v301_cml06_remaining_life():
    rate = corrosion_rate(14.1, 13.1, 3.0)
    assert remaining_life(13.1, 12.5, rate) == pytest.approx((13.1 - 12.5) / rate)
    assert remaining_life(13.1, 12.5, rate) == pytest.approx(1.8, abs=0.05)  # as stated in the report


def test_at_or_below_tmin_has_no_life_left():
    assert remaining_life(12.5, 12.5, 0.33) == 0.0
    assert remaining_life(12.0, 12.5, 0.33) == 0.0


def test_no_corrosion_means_unlimited_life():
    assert remaining_life(15.0, 12.5, 0.0) == float("inf")


def test_invalid_interval_rejected():
    with pytest.raises(ValueError):
        corrosion_rate(14.1, 13.1, 0)
`,
  },
  {
    id: "ug27",
    label: "Minimum shell thickness, ASME VIII-1 UG-27",
    filename: "ug27_thickness.py",
    code: `# Reviewed example: minimum required shell thickness, circumferential stress,
# ASME Section VIII Div. 1 UG-27(c)(1):  t = P*R / (S*E - 0.6*P) + CA
# Units: P and S in MPa, R (inside radius), CA and t in mm. E = joint efficiency (0-1].
import pytest


def min_shell_thickness(P: float, R: float, S: float, E: float, CA: float = 0.0) -> float:
    if P <= 0 or R <= 0 or S <= 0:
        raise ValueError("P, R and S must be positive")
    if not 0 < E <= 1:
        raise ValueError("joint efficiency E must be in (0, 1]")
    if CA < 0:
        raise ValueError("corrosion allowance can't be negative")
    if S * E <= 0.6 * P:
        raise ValueError("formula not valid: S*E must exceed 0.6*P")
    return P * R / (S * E - 0.6 * P) + CA


def test_typical_vessel():
    P, R, S, E, CA = 1.03, 750.0, 138.0, 0.85, 3.0
    assert min_shell_thickness(P, R, S, E, CA) == pytest.approx(P * R / (S * E - 0.6 * P) + CA)


def test_corrosion_allowance_adds_directly():
    base = min_shell_thickness(1.03, 750.0, 138.0, 0.85, 0.0)
    assert min_shell_thickness(1.03, 750.0, 138.0, 0.85, 3.0) == pytest.approx(base + 3.0)


def test_full_radiography_needs_less_thickness():
    assert min_shell_thickness(1.03, 750.0, 138.0, 1.0) < min_shell_thickness(1.03, 750.0, 138.0, 0.85)


def test_invalid_inputs_rejected():
    with pytest.raises(ValueError):
        min_shell_thickness(-1.0, 750.0, 138.0, 0.85)
    with pytest.raises(ValueError):
        min_shell_thickness(1.03, 750.0, 138.0, 1.2)
    with pytest.raises(ValueError):
        min_shell_thickness(100.0, 750.0, 50.0, 0.85)  # S*E <= 0.6*P
`,
  },
];

async function readError(res: Response): Promise<string> {
  const body = await res.json().catch(() => null);
  if (Array.isArray(body?.detail)) return body.detail.map((e: { msg: string }) => e.msg).join(", ");
  return body?.detail ?? `Request failed with status ${res.status}`;
}

// One chip per source document (search may return up to 2 chunks per document).
function uniqueSources(sources: { source: string; score: number }[]) {
  const bySource = new Map<string, { source: string; score: number; chunks: number }>();
  for (const s of sources) {
    const seen = bySource.get(s.source);
    if (seen) {
      seen.chunks += 1;
      seen.score = Math.max(seen.score, s.score);
    } else {
      bySource.set(s.source, { ...s, chunks: 1 });
    }
  }
  return Array.from(bySource.values());
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
      // The server already ran every attempt with pytest in the sandbox.
      setRoute(data);
      setCode(data.code);
      setFilename(data.filename);
      setResult(data.run);
      setShowLog(!data.verified);
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
        {generating && <p className="mt-2 text-xs" style={{ color: "var(--text-muted)" }}>The local model is writing code and testing it in the sandbox; failing tests are sent back for a fix (up to 3 attempts).</p>}
        {route && <p className="mt-2 text-xs" style={{ color: "var(--text-muted)" }}>{route.reason} &middot; {route.attempts.length} {route.attempts.length === 1 ? "attempt" : "attempts"} in {(route.duration_ms / 1000).toFixed(1)} s</p>}
        {route && (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {route.attempts.map((a) => (
              <span key={a.attempt} className="text-[11px] font-mono px-2 py-0.5 rounded" style={{ background: a.passed ? "var(--accent-soft-bg)" : "var(--error-bg)", color: a.passed ? "var(--accent-2)" : "var(--error-text)" }}>
                attempt {a.attempt}: {a.timed_out ? "timed out" : a.test_summary ?? `exit ${a.exit_code}`}
              </span>
            ))}
            {uniqueSources(route.sources).map((src) => (
              <span key={src.source} className="text-[11px] font-mono px-2 py-0.5 rounded" style={{ background: "var(--bg)", color: "var(--text-secondary)" }} title="Reference material given to the model (access-filtered)">
                ref: {src.source} &middot; {src.score.toFixed(2)}{src.chunks > 1 ? ` \u00b7 ${src.chunks} chunks` : ""}
              </span>
            ))}
            {route.reference_note && <span className="text-[11px]" style={{ color: "var(--accent-3)" }}>{route.reference_note}</span>}
          </div>
        )}
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
            <span className="flex items-center gap-3 min-w-0">
              <span className="text-sm font-mono truncate" style={{ color: "var(--accent-2)" }}>{filename}</span>
              <select
                value=""
                onChange={(e) => {
                  const ex = EXAMPLES.find((x) => x.id === e.target.value);
                  if (!ex) return;
                  setCode(ex.code);
                  setFilename(ex.filename);
                  setRoute(null);
                  setResult(null);
                  setError(null);
                }}
                disabled={busy}
                className="text-xs rounded border px-2 py-1 focus:outline-none"
                style={{ borderColor: "var(--border)", background: "var(--panel)", color: "var(--text-secondary)" }}
                aria-label="Load a reviewed example"
              >
                <option value="">Load reviewed example...</option>
                {EXAMPLES.map((ex) => <option key={ex.id} value={ex.id}>{ex.label}</option>)}
              </select>
            </span>
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
                {result.runner === "pytest" && result.exit_code === 0 && !result.timed_out && (
                  <p className="mt-2 text-[11px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
                    Verified means the tests in this file pass. When the model wrote the tests, a pass doesn&apos;t prove the engineering is right: check formulas and any <code># ASSUMPTION</code> lines against the SOP before use.
                  </p>
                )}
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