// src/components/ScanAnalysisPanel.tsx
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Upload, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { authFetch } from "@/lib/api";

type DocumentSummary = {
  id: string;
  filename: string;
  created_at: string | null;
};

type OcrLine = {
  text: string;
  confidence: number;
  bbox: [number, number, number, number]; // normalized 0-1
};

type PageAnalysis = {
  document_id: string;
  filename: string;
  page_index: number;
  page_count: number;
  width: number;
  height: number;
  ocr_engine: string;
  low_confidence_threshold: number;
  lines: OcrLine[];
  image_base64: string;
};

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

export default function ScanAnalysisPanel() {
  const [docs, setDocs] = useState<DocumentSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pageIndex, setPageIndex] = useState(0);
  const [analysis, setAnalysis] = useState<PageAnalysis | null>(null);
  const [loadingDocs, setLoadingDocs] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeLine, setActiveLine] = useState<number | null>(null);
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

  // Run OCR analysis whenever the document or page changes.
  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;

    const run = async () => {
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
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [selectedId, pageIndex]);

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

  const threshold = analysis?.low_confidence_threshold ?? 0.85;
  const reviewCount = analysis ? analysis.lines.filter((l) => l.confidence < threshold).length : 0;
  const pageCount = analysis?.page_count ?? 1;

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
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-2 text-sm font-semibold px-5 py-2.5 rounded-lg transition-opacity hover:opacity-90 disabled:opacity-60 shrink-0"
            style={{ background: "var(--accent)", color: "var(--accent-fg)" }}
          >
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {uploading ? "Uploading..." : "Upload scan"}
          </button>
        </div>
      </div>

      {error && (
        <div className="mt-4 rounded-lg px-4 py-3 text-sm" style={{ background: "var(--error-bg)", color: "var(--error-text)" }}>{error}</div>
      )}

      {!loadingDocs && docs.length === 0 && !error && (
        <div className="mt-6 rounded-xl border border-dashed p-10 text-center text-sm" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>
          Upload a scanned report or photo to see what OCR extracted and how confident it is.
        </div>
      )}

      {selectedId && (
        <div className="mt-5 grid grid-cols-1 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-5 items-start">
          {/* Left: page preview with OCR boxes */}
          <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", background: "var(--panel)" }}>
            <div className="flex items-center justify-between gap-2 mb-3">
              <span className="text-[11px] font-mono font-semibold tracking-[0.08em] truncate" style={{ color: "var(--text-secondary)" }}>
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
                          left: `${x0 * 100}%`,
                          top: `${y0 * 100}%`,
                          width: `${(x1 - x0) * 100}%`,
                          height: `${(y1 - y0) * 100}%`,
                          border: low ? "1.5px dashed var(--error-text)" : `1px solid ${active ? "var(--accent-2)" : "transparent"}`,
                          background: active ? "var(--accent-soft-bg)" : "transparent",
                          opacity: active ? 0.85 : 1,
                        }}
                        title={`${line.text} (${(line.confidence * 100).toFixed(1)}%)`}
                      />
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Right: extracted lines with real confidence */}
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold px-3 py-1 rounded-full" style={{ background: "var(--accent-soft-bg)", color: "var(--accent-2)" }}>OCR: {analysis?.ocr_engine ?? "PaddleOCR"}</span>
              {analysis && (
                <span className="text-xs font-semibold px-3 py-1 rounded-full" style={{ background: "var(--accent-soft-bg)", color: "var(--accent-2)" }}>{analysis.lines.length} lines read</span>
              )}
              {analysis && reviewCount > 0 && (
                <span className="text-xs font-semibold px-3 py-1 rounded-full" style={{ background: "var(--error-bg)", color: "var(--error-text)" }}>
                  {reviewCount} {reviewCount === 1 ? "line needs" : "lines need"} review
                </span>
              )}
            </div>

            <div className="rounded-xl border px-5 py-2" style={{ borderColor: "var(--border)", background: "var(--panel)" }}>
              {analyzing && <p className="py-8 text-center text-sm" style={{ color: "var(--text-muted)" }}>Waiting for OCR results...</p>}
              {!analyzing && analysis && analysis.lines.length === 0 && (
                <p className="py-8 text-center text-sm" style={{ color: "var(--text-muted)" }}>No readable text on this page. It may be a photo or drawing.</p>
              )}
              {!analyzing && analysis && analysis.lines.length > 0 && (
                <div className="max-h-[560px] overflow-y-auto">
                  {analysis.lines.map((line, i) => {
                    const t = tier(line.confidence, threshold);
                    const low = line.confidence < threshold;
                    return (
                      <div
                        key={i}
                        onMouseEnter={() => setActiveLine(i)}
                        onMouseLeave={() => setActiveLine(null)}
                        className="grid grid-cols-[1fr_auto_180px] items-center gap-3 py-3 border-b last:border-b-0 transition-colors"
                        style={{ borderColor: "var(--border)", background: activeLine === i ? "var(--accent-soft-bg)" : "transparent" }}
                      >
                        <span className="text-sm font-medium text-[var(--text-primary)] truncate" title={line.text}>{line.text}</span>
                        <span>
                          {low && <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full" style={{ background: "var(--error-bg)", color: "var(--error-text)" }}>review</span>}
                        </span>
                        <div>
                          <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--border)" }}>
                            <div className="h-full rounded-full" style={{ width: `${Math.round(line.confidence * 100)}%`, background: t.color }} />
                          </div>
                          <span className="mt-1 block text-[11px] font-mono whitespace-nowrap" style={{ color: t.color }}>
                            {t.label} &middot; {(line.confidence * 100).toFixed(1)}%
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}