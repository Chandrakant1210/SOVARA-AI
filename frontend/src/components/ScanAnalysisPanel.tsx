// src/components/ScanAnalysisPanel.tsx
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Upload, ChevronLeft, ChevronRight, Loader2, CheckCircle2, AlertTriangle, XCircle } from "lucide-react";
import { authFetch } from "@/lib/api";

// ---------- API types ----------

type DocumentSummary = { id: string; filename: string; created_at: string | null };

type Bbox = [number, number, number, number]; // normalized 0-1

type OcrLine = { text: string; confidence: number; bbox: Bbox };

type PageAnalysis = {
  document_id: string;
  filename: string;
  page_index: number;
  page_count: number;
  ocr_engine: string;
  low_confidence_threshold: number;
  lines: OcrLine[];
  image_base64: string;
};

type Source = { page: number; text: string; confidence: number; bbox: Bbox }; // page is 1-based

type FieldStatus = "ok" | "review" | "pending" | "manual" | "not_found";

type ExtractedField = {
  key: string;
  label: string;
  value: string | null;
  status: FieldStatus;
  reasons: string[];
  source: Source | null;
};

type Reading = {
  cml: string;
  location: string | null;
  nominal: number | null;
  previous: number | null;
  current: number | null;
  remarks: string | null;
  corrosion_rate: number | null;
  status: "ok" | "review";
  reasons: string[];
  sources: Record<string, Source>;
};

type Check = { id: string; title: string; status: "pass" | "warn" | "fail"; detail: string; source?: Source };

type Extraction = {
  review_confidence: number;
  fields: ExtractedField[];
  signoff: ExtractedField[];
  readings: Reading[];
  reading_years: { previous: number | null; current: number | null };
  checks: Check[];
  summary: { needs_review: number; not_found: number; failed_checks: number; warnings: number };
  page_count: number;
  pages_analyzed: number;
};

// ---------- helpers ----------

const ACCEPTED_EXTENSIONS = [".png", ".jpg", ".jpeg", ".bmp", ".pdf"];
const HIGH_CONFIDENCE = 0.95;

async function readError(res: Response): Promise<string> {
  const body = await res.json().catch(() => null);
  if (Array.isArray(body?.detail)) return body.detail.map((e: { msg: string }) => e.msg).join(", ");
  return body?.detail ?? `Request failed with status ${res.status}`;
}

function tier(confidence: number, threshold: number) {
  if (confidence < threshold) return { label: "low confidence", color: "var(--error-text)" };
  if (confidence < HIGH_CONFIDENCE) return { label: "medium confidence", color: "var(--accent-3)" };
  return { label: "high confidence", color: "var(--accent-2)" };
}

const STATUS_BADGE: Record<FieldStatus, { text: string; bg: string; fg: string } | null> = {
  ok: null,
  review: { text: "review", bg: "var(--error-bg)", fg: "var(--error-text)" },
  pending: { text: "awaiting review", bg: "var(--accent-soft-bg)", fg: "var(--accent-3)" },
  manual: { text: "check visually", bg: "var(--accent-soft-bg)", fg: "var(--accent-3)" },
  not_found: { text: "not found", bg: "var(--error-bg)", fg: "var(--error-text)" },
};

const CHECK_STYLE = {
  pass: { Icon: CheckCircle2, color: "var(--accent-2)" },
  warn: { Icon: AlertTriangle, color: "var(--accent-3)" },
  fail: { Icon: XCircle, color: "var(--error-text)" },
};

function Pill({ text, tone }: { text: string; tone: "good" | "warn" | "bad" }) {
  const c = {
    good: { bg: "var(--accent-soft-bg)", fg: "var(--accent-2)" },
    warn: { bg: "var(--accent-soft-bg)", fg: "var(--accent-3)" },
    bad: { bg: "var(--error-bg)", fg: "var(--error-text)" },
  }[tone];
  return <span className="text-xs font-semibold px-3 py-1 rounded-full whitespace-nowrap" style={{ background: c.bg, color: c.fg }}>{text}</span>;
}

function ConfidenceBar({ confidence, threshold }: { confidence: number; threshold: number }) {
  const t = tier(confidence, threshold);
  return (
    <div>
      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--border)" }}>
        <div className="h-full rounded-full" style={{ width: `${Math.round(confidence * 100)}%`, background: t.color }} />
      </div>
      <span className="mt-1 block text-[11px] font-mono whitespace-nowrap" style={{ color: t.color }}>
        {t.label} &middot; {(confidence * 100).toFixed(1)}%
      </span>
    </div>
  );
}

const cardStyle = { borderColor: "var(--border)", background: "var(--panel)" };
const cardTitle = "text-[11px] font-mono font-semibold tracking-[0.08em]";

// ---------- component ----------

export default function ScanAnalysisPanel() {
  const [docs, setDocs] = useState<DocumentSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pageIndex, setPageIndex] = useState(0);
  const [analysis, setAnalysis] = useState<PageAnalysis | null>(null);
  const [extraction, setExtraction] = useState<Extraction | null>(null);
  const [loadingDocs, setLoadingDocs] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [activeLine, setActiveLine] = useState<number | null>(null);
  const [highlight, setHighlight] = useState<Source | null>(null);
  const [view, setView] = useState<"fields" | "ocr">("fields");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadDocs = useCallback(async (selectAfter?: string) => {
    setLoadingDocs(true);
    try {
      const res = await authFetch("/api/documents");
      if (!res.ok) throw new Error(await readError(res));
      const data: DocumentSummary[] = await res.json();
      setDocs(data);
      setSelectedId((current) => selectAfter ?? current ?? data[0]?.id ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load documents");
    } finally {
      setLoadingDocs(false);
    }
  }, []);

  useEffect(() => {
    loadDocs();
  }, [loadDocs]);

  // Page preview + raw OCR lines for the current page.
  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    (async () => {
      setAnalyzing(true);
      setError(null);
      setActiveLine(null);
      try {
        const res = await authFetch(`/api/documents/${selectedId}/pages/${pageIndex}/analysis`);
        if (!res.ok) throw new Error(await readError(res));
        const data: PageAnalysis = await res.json();
        if (!cancelled) setAnalysis(data);
      } catch (err) {
        if (!cancelled) {
          setAnalysis(null);
          setError(err instanceof Error ? err.message : "Page analysis failed");
        }
      } finally {
        if (!cancelled) setAnalyzing(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedId, pageIndex]);

  // Structured extraction for the whole document (runs once per document).
  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    (async () => {
      setExtracting(true);
      setExtractError(null);
      setExtraction(null);
      setHighlight(null);
      try {
        const res = await authFetch(`/api/documents/${selectedId}/extraction`);
        if (!res.ok) throw new Error(await readError(res));
        const data: Extraction = await res.json();
        if (!cancelled) setExtraction(data);
      } catch (err) {
        if (!cancelled) setExtractError(err instanceof Error ? err.message : "Extraction failed");
      } finally {
        if (!cancelled) setExtracting(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  const handleUpload = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    const ext = "." + file.name.split(".").pop()?.toLowerCase();
    if (!ACCEPTED_EXTENSIONS.includes(ext)) {
      setError(`Unsupported file type '${ext}'. Allowed: ${ACCEPTED_EXTENSIONS.join(", ")}`);
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await authFetch("/api/documents/upload", { method: "POST", body: formData });
      if (!res.ok) throw new Error(await readError(res));
      const data = await res.json();
      setPageIndex(0);
      await loadDocs(data.document_id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // Jump to the page a value came from and highlight its box.
  const showSource = (source: Source | null | undefined) => {
    if (!source) return;
    setHighlight(source);
    setPageIndex(source.page - 1);
  };

  const threshold = extraction?.review_confidence ?? analysis?.low_confidence_threshold ?? 0.9;
  const pageCount = analysis?.page_count ?? extraction?.page_count ?? 1;
  const lowLines = analysis ? analysis.lines.filter((l) => l.confidence < threshold).length : 0;
  const showHighlight = highlight && highlight.page - 1 === pageIndex && !analyzing;
  const years = extraction?.reading_years;

  const renderFieldRow = (f: ExtractedField) => {
    const badge = STATUS_BADGE[f.status];
    const clickable = !!f.source;
    const selected = !!(highlight && f.source && highlight.page === f.source.page && highlight.bbox.join() === f.source.bbox.join());
    return (
      <button
        key={f.key}
        type="button"
        onClick={() => showSource(f.source)}
        disabled={!clickable}
        className="w-full text-left grid grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_120px_180px] items-center gap-3 py-3 px-2 -mx-2 rounded border-b last:border-b-0 transition-colors disabled:cursor-default"
        style={{ borderColor: "var(--border)", background: selected ? "var(--accent-soft-bg)" : "transparent" }}
        title={f.reasons.join("\n") || undefined}
      >
        <span className="text-sm" style={{ color: "var(--text-secondary)" }}>{f.label}</span>
        <span className="min-w-0">
          <span className="block text-sm font-semibold truncate" style={{ color: f.value ? "var(--text-primary)" : "var(--text-muted)" }}>{f.value ?? "\u2014"}</span>
          {f.status === "review" && f.reasons.length > 0 && (
            <span className="block text-[11px] leading-snug mt-0.5" style={{ color: "var(--error-text)" }}>{f.reasons[0]}</span>
          )}
        </span>
        <span>{badge && <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full whitespace-nowrap" style={{ background: badge.bg, color: badge.fg }}>{badge.text}</span>}</span>
        <span>{f.source ? <ConfidenceBar confidence={f.source.confidence} threshold={threshold} /> : null}</span>
      </button>
    );
  };

  return (
    <div className="h-full overflow-y-auto p-6">
      <input ref={fileInputRef} type="file" accept={ACCEPTED_EXTENSIONS.join(",")} onChange={(e) => handleUpload(e.target.files)} className="hidden" />

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--text-primary)]">Scan Analysis</h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">Every extracted value shows where it came from and how sure the model is.</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={selectedId ?? ""}
            onChange={(e) => { setSelectedId(e.target.value || null); setPageIndex(0); }}
            disabled={loadingDocs || docs.length === 0}
            className="text-sm rounded-lg border px-3 py-2.5 max-w-[260px] focus:outline-none"
            style={{ borderColor: "var(--border)", background: "var(--panel)", color: "var(--text-primary)" }}
            aria-label="Select document"
          >
            {docs.length === 0 && <option value="">{loadingDocs ? "Loading documents..." : "No documents yet"}</option>}
            {docs.map((d) => (
              <option key={d.id} value={d.id}>{d.filename}</option>
            ))}
          </select>
          <button onClick={() => fileInputRef.current?.click()} disabled={uploading} className="flex items-center gap-2 text-sm font-semibold px-5 py-2.5 rounded-lg transition-opacity hover:opacity-90 disabled:opacity-60 shrink-0" style={{ background: "var(--accent)", color: "var(--accent-fg)" }}>
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {uploading ? "Uploading..." : "Upload scan"}
          </button>
        </div>
      </div>

      {error && <div className="mt-4 rounded-lg px-4 py-3 text-sm" style={{ background: "var(--error-bg)", color: "var(--error-text)" }}>{error}</div>}

      {!loadingDocs && docs.length === 0 && !error && (
        <div className="mt-6 rounded-xl border border-dashed p-10 text-center text-sm" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>
          Upload a scanned report or photo to see what OCR extracted and how confident it is.
        </div>
      )}

      {selectedId && (
        <div className="mt-5 grid grid-cols-1 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-5 items-start">
          {/* Left: page preview (sticky so highlights stay visible while scrolling fields) */}
          <div className="rounded-xl border p-4 lg:sticky lg:top-0" style={cardStyle}>
            <div className="flex items-center justify-between gap-2 mb-3">
              <span className={`${cardTitle} truncate`} style={{ color: "var(--text-secondary)" }}>
                PAGE {pageIndex + 1} OF {pageCount}
                {analysis ? <> &middot; {analysis.filename.toUpperCase()}</> : null}
              </span>
              <div className="flex items-center gap-1 shrink-0">
                <button onClick={() => setPageIndex((p) => Math.max(0, p - 1))} disabled={analyzing || pageIndex === 0} className="p-1 rounded disabled:opacity-30 hover:opacity-70" aria-label="Previous page">
                  <ChevronLeft className="h-4 w-4" style={{ color: "var(--text-secondary)" }} />
                </button>
                <button onClick={() => setPageIndex((p) => Math.min(pageCount - 1, p + 1))} disabled={analyzing || pageIndex >= pageCount - 1} className="p-1 rounded disabled:opacity-30 hover:opacity-70" aria-label="Next page">
                  <ChevronRight className="h-4 w-4" style={{ color: "var(--text-secondary)" }} />
                </button>
              </div>
            </div>

            <div className="rounded-lg border overflow-hidden" style={{ borderColor: "var(--border)", background: "var(--bg)" }}>
              {analyzing && (
                <div className="flex items-center justify-center gap-2 py-24 text-sm" style={{ color: "var(--text-muted)" }}>
                  <Loader2 className="h-4 w-4 animate-spin" /> Running PaddleOCR on page {pageIndex + 1}...
                </div>
              )}
              {!analyzing && analysis && (
                <div className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`data:image/png;base64,${analysis.image_base64}`} alt={`Page ${pageIndex + 1} of ${analysis.filename}`} className="block w-full h-auto" />
                  {analysis.lines.map((line, i) => {
                    const [x0, y0, x1, y1] = line.bbox;
                    const low = line.confidence < threshold;
                    const active = activeLine === i;
                    return (
                      <div
                        key={i}
                        onMouseEnter={() => setActiveLine(i)}
                        onMouseLeave={() => setActiveLine(null)}
                        className="absolute rounded-sm"
                        style={{
                          left: `${x0 * 100}%`, top: `${y0 * 100}%`, width: `${(x1 - x0) * 100}%`, height: `${(y1 - y0) * 100}%`,
                          border: low ? "1.5px dashed var(--error-text)" : `1px solid ${active ? "var(--accent-2)" : "transparent"}`,
                          background: active ? "var(--accent-soft-bg)" : "transparent",
                          opacity: active ? 0.85 : 1,
                        }}
                        title={`${line.text} (${(line.confidence * 100).toFixed(1)}%)`}
                      />
                    );
                  })}
                  {showHighlight && highlight && (
                    <div
                      className="absolute rounded-sm pointer-events-none"
                      style={{
                        left: `calc(${highlight.bbox[0] * 100}% - 3px)`, top: `calc(${highlight.bbox[1] * 100}% - 3px)`,
                        width: `calc(${(highlight.bbox[2] - highlight.bbox[0]) * 100}% + 6px)`, height: `calc(${(highlight.bbox[3] - highlight.bbox[1]) * 100}% + 6px)`,
                        border: "2px solid var(--accent-2)", boxShadow: "0 0 0 3px var(--accent-soft-bg)",
                      }}
                    />
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Right: extracted fields / raw OCR */}
          <div className="flex flex-col gap-3 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Pill text={`OCR: ${analysis?.ocr_engine ?? "PaddleOCR"}`} tone="good" />
              <Pill text="Extraction: rule-based, no LLM" tone="good" />
              {extraction && extraction.summary.needs_review > 0 && <Pill text={`${extraction.summary.needs_review} ${extraction.summary.needs_review === 1 ? "item needs" : "items need"} review`} tone="bad" />}
              {extraction && extraction.summary.failed_checks > 0 && <Pill text={`${extraction.summary.failed_checks} failed ${extraction.summary.failed_checks === 1 ? "check" : "checks"}`} tone="bad" />}
              <div className="ml-auto flex rounded-lg border overflow-hidden text-xs font-semibold" style={{ borderColor: "var(--border)" }}>
                {(["fields", "ocr"] as const).map((v) => (
                  <button key={v} onClick={() => setView(v)} className="px-3 py-1.5" style={{ background: view === v ? "var(--accent)" : "var(--panel)", color: view === v ? "var(--accent-fg)" : "var(--text-secondary)" }}>
                    {v === "fields" ? "Extracted fields" : "Raw OCR lines"}
                  </button>
                ))}
              </div>
            </div>

            {view === "fields" && (
              <>
                {extracting && (
                  <div className="rounded-xl border py-10 flex items-center justify-center gap-2 text-sm" style={{ ...cardStyle, color: "var(--text-muted)" }}>
                    <Loader2 className="h-4 w-4 animate-spin" /> Reading every page and extracting fields...
                  </div>
                )}
                {extractError && <div className="rounded-lg px-4 py-3 text-sm" style={{ background: "var(--error-bg)", color: "var(--error-text)" }}>{extractError}</div>}

                {extraction && (
                  <>
                    {/* Report fields */}
                    <div className="rounded-xl border px-5 pt-4 pb-2" style={cardStyle}>
                      <span className={cardTitle} style={{ color: "var(--text-secondary)" }}>REPORT FIELDS</span>
                      <div className="mt-1">{extraction.fields.map(renderFieldRow)}</div>
                    </div>

                    {/* Validation checks */}
                    <div className="rounded-xl border px-5 py-4" style={cardStyle}>
                      <span className={cardTitle} style={{ color: "var(--text-secondary)" }}>VALIDATION CHECKS</span>
                      <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>Recomputed from the extracted readings, independent of OCR confidence.</p>
                      <div className="mt-3 flex flex-col gap-3">
                        {extraction.checks.map((c) => {
                          const { Icon, color } = CHECK_STYLE[c.status];
                          return (
                            <button key={c.id} type="button" onClick={() => showSource(c.source)} disabled={!c.source} className="flex items-start gap-3 text-left disabled:cursor-default">
                              <Icon className="h-4 w-4 mt-0.5 shrink-0" style={{ color }} />
                              <span className="min-w-0">
                                <span className="block text-sm font-semibold text-[var(--text-primary)]">{c.title}</span>
                                <span className="block text-xs leading-relaxed" style={{ color: "var(--text-secondary)" }}>{c.detail}</span>
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Thickness readings */}
                    {extraction.readings.length > 0 && (
                      <div className="rounded-xl border px-5 py-4" style={cardStyle}>
                        <span className={cardTitle} style={{ color: "var(--text-secondary)" }}>THICKNESS READINGS (MM)</span>
                        <div className="mt-2 overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="text-left text-[11px] font-mono" style={{ color: "var(--text-muted)" }}>
                                <th className="py-2 pr-3 font-semibold">CML</th>
                                <th className="py-2 pr-3 font-semibold">LOCATION</th>
                                <th className="py-2 pr-3 font-semibold text-right">NOMINAL</th>
                                <th className="py-2 pr-3 font-semibold text-right">{years?.previous ?? "PREV"}</th>
                                <th className="py-2 pr-3 font-semibold text-right">{years?.current ?? "CURRENT"}</th>
                                <th className="py-2 pr-3 font-semibold text-right">RATE / YR</th>
                                <th className="py-2 font-semibold"></th>
                              </tr>
                            </thead>
                            <tbody>
                              {extraction.readings.map((r) => {
                                const src = r.sources.current ?? r.sources.cml;
                                return (
                                  <tr key={r.cml} onClick={() => showSource(src)} className="border-t cursor-pointer hover:opacity-80" style={{ borderColor: "var(--border)" }} title={r.reasons.join("\n") || undefined}>
                                    <td className="py-2 pr-3 font-mono font-semibold whitespace-nowrap text-[var(--text-primary)]">{r.cml}</td>
                                    <td className="py-2 pr-3" style={{ color: "var(--text-secondary)" }}>{r.location ?? "\u2014"}</td>
                                    <td className="py-2 pr-3 text-right font-mono" style={{ color: "var(--text-secondary)" }}>{r.nominal?.toFixed(1) ?? "\u2014"}</td>
                                    <td className="py-2 pr-3 text-right font-mono" style={{ color: "var(--text-secondary)" }}>{r.previous?.toFixed(1) ?? "\u2014"}</td>
                                    <td className="py-2 pr-3 text-right font-mono font-semibold" style={{ color: r.status === "review" ? "var(--error-text)" : "var(--text-primary)" }}>{r.current?.toFixed(1) ?? "\u2014"}</td>
                                    <td className="py-2 pr-3 text-right font-mono" style={{ color: "var(--text-secondary)" }}>{r.corrosion_rate != null ? r.corrosion_rate.toFixed(2) : "\u2014"}</td>
                                    <td className="py-2">{r.status === "review" && <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full whitespace-nowrap" style={{ background: "var(--error-bg)", color: "var(--error-text)" }}>review</span>}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {/* Sign-off */}
                    {extraction.signoff.length > 0 && (
                      <div className="rounded-xl border px-5 pt-4 pb-2" style={cardStyle}>
                        <span className={cardTitle} style={{ color: "var(--text-secondary)" }}>SIGN-OFF</span>
                        <div className="mt-1">{extraction.signoff.map(renderFieldRow)}</div>
                      </div>
                    )}
                  </>
                )}
              </>
            )}

            {view === "ocr" && (
              <>
                {analysis && lowLines > 0 && <div><Pill text={`${lowLines} ${lowLines === 1 ? "line" : "lines"} below ${threshold.toFixed(2)} on this page`} tone="bad" /></div>}
                <div className="rounded-xl border px-5 py-2" style={cardStyle}>
                  {analyzing && <p className="py-8 text-center text-sm" style={{ color: "var(--text-muted)" }}>Waiting for OCR results...</p>}
                  {!analyzing && analysis && analysis.lines.length === 0 && <p className="py-8 text-center text-sm" style={{ color: "var(--text-muted)" }}>No readable text on this page. It may be a photo or drawing.</p>}
                  {!analyzing && analysis && analysis.lines.length > 0 && (
                    <div className="max-h-[560px] overflow-y-auto">
                      {analysis.lines.map((line, i) => (
                        <div key={i} onMouseEnter={() => setActiveLine(i)} onMouseLeave={() => setActiveLine(null)} className="grid grid-cols-[1fr_auto_180px] items-center gap-3 py-3 border-b last:border-b-0 transition-colors" style={{ borderColor: "var(--border)", background: activeLine === i ? "var(--accent-soft-bg)" : "transparent" }}>
                          <span className="text-sm font-medium text-[var(--text-primary)] truncate" title={line.text}>{line.text}</span>
                          <span>{line.confidence < threshold && <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full" style={{ background: "var(--error-bg)", color: "var(--error-text)" }}>review</span>}</span>
                          <ConfidenceBar confidence={line.confidence} threshold={threshold} />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}