// src/components/DocumentsPanel.tsx
"use client";

import { useMemo, useRef, useState } from "react";
import { Upload, Search, FileText, Image as ImageIcon } from "lucide-react";
import { authFetch } from "@/lib/api";

type UploadedDoc = {
    id: string;
    filename: string;
    extractedText: string;
    indexedChunks: number;
    status: "processing" | "done" | "error";
    error?: string;
    kind: "pdf" | "image";
};

const ACCEPTED_EXTENSIONS = [".png", ".jpg", ".jpeg", ".bmp", ".pdf"];
const FILTERS = ["All", "PDF", "Image"] as const;

function Pill({ text, tone }: { text: string; tone: "good" | "pending" | "error" }) {
    const colors = {
        good: { bg: "var(--accent-soft-bg)", fg: "var(--accent-2)" },
        pending: { bg: "var(--accent-soft-bg)", fg: "var(--accent-3)" },
        error: { bg: "var(--error-bg)", fg: "var(--error-text)" },
    }[tone];
    return (
        <span
            className="text-xs font-medium px-2.5 py-1 rounded-full whitespace-nowrap"
            style={{ background: colors.bg, color: colors.fg }}
        >
            {text}
        </span>
    );
}

export default function DocumentsPanel() {
    const [docs, setDocs] = useState<UploadedDoc[]>([]);
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [dragActive, setDragActive] = useState(false);
    const [search, setSearch] = useState("");
    const [filter, setFilter] = useState<(typeof FILTERS)[number]>("All");
    const fileInputRef = useRef<HTMLInputElement>(null);

    const uploadFile = async (file: File) => {
        const tempId = crypto.randomUUID();
        const ext = "." + file.name.split(".").pop()?.toLowerCase();
        const kind: "pdf" | "image" = ext === ".pdf" ? "pdf" : "image";

        setDocs((prev) => [
            { id: tempId, filename: file.name, extractedText: "", indexedChunks: 0, status: "processing", kind },
            ...prev,
        ]);

        const formData = new FormData();
        formData.append("file", file);

        try {
            const res = await authFetch("/api/documents/upload", {
                method: "POST",
                body: formData,
            });

            if (!res.ok) {
                const body = await res.json().catch(() => null);
                const message = Array.isArray(body?.detail)
                    ? body.detail.map((e: { msg: string }) => e.msg).join(", ")
                    : body?.detail ?? `Upload failed with status ${res.status}`;
                throw new Error(message);
            }

            const data = await res.json();

            setDocs((prev) =>
                prev.map((d) =>
                    d.id === tempId
                        ? { ...d, extractedText: data.extracted_text, indexedChunks: data.indexed_chunks, status: "done" }
                        : d
                )
            );
        } catch (err) {
            setDocs((prev) =>
                prev.map((d) =>
                    d.id === tempId
                        ? { ...d, status: "error", error: err instanceof Error ? err.message : "Upload failed" }
                        : d
                )
            );
        }
    };

    const handleFiles = (files: FileList | null) => {
        if (!files) return;
        Array.from(files).forEach((file) => {
            const ext = "." + file.name.split(".").pop()?.toLowerCase();
            if (ACCEPTED_EXTENSIONS.includes(ext)) uploadFile(file);
        });
    };

    const filteredDocs = useMemo(() => {
        return docs.filter((d) => {
            const matchesFilter =
                filter === "All" || (filter === "PDF" && d.kind === "pdf") || (filter === "Image" && d.kind === "image");
            const matchesSearch = d.filename.toLowerCase().includes(search.toLowerCase());
            return matchesFilter && matchesSearch;
        });
    }, [docs, filter, search]);

    const indexedCount = docs.filter((d) => d.status === "done" && d.indexedChunks > 0).length;

    return (
        <div className="h-full overflow-y-auto p-6">
            <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPTED_EXTENSIONS.join(",")}
                multiple
                onChange={(e) => handleFiles(e.target.files)}
                className="hidden"
            />

            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-semibold text-[var(--text-primary)]">Document Vault</h1>
                    <p className="mt-1 text-sm text-[var(--text-secondary)]">
                        SOPs, manuals, reports and drawings the assistant can read. Processed
                        with local OCR and vision extraction.
                    </p>
                </div>
                <button
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-lg transition-opacity hover:opacity-90 shrink-0"
                    style={{ background: "var(--accent)", color: "var(--accent-fg)" }}
                >
                    <Upload className="h-4 w-4" /> Upload documents
                </button>
            </div>

            <div
                onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
                onDragLeave={() => setDragActive(false)}
                onDrop={(e) => { e.preventDefault(); setDragActive(false); handleFiles(e.dataTransfer.files); }}
                className="mt-5 rounded-xl border border-dashed p-4 text-center text-xs transition-colors"
                style={{
                    borderColor: dragActive ? "var(--accent)" : "var(--border)",
                    color: "var(--text-muted)",
                }}
            >
                or drop a file here -- PNG, JPG, BMP, PDF
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-3">
                <div
                    className="flex items-center gap-2 flex-1 min-w-[220px] rounded-lg border px-3 py-2"
                    style={{ borderColor: "var(--border)", background: "var(--panel)" }}
                >
                    <Search className="h-4 w-4" style={{ color: "var(--text-muted)" }} />
                    <input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search by filename"
                        className="flex-1 bg-transparent text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none"
                    />
                </div>
                {FILTERS.map((f) => (
                    <button
                        key={f}
                        onClick={() => setFilter(f)}
                        className="text-sm font-medium px-3 py-1.5 rounded-full transition-colors"
                        style={{
                            background: filter === f ? "var(--accent)" : "var(--panel)",
                            color: filter === f ? "var(--accent-fg)" : "var(--text-secondary)",
                            border: filter === f ? "none" : "1px solid var(--border)",
                        }}
                    >
                        {f}
                    </button>
                ))}
            </div>

            <div
                className="mt-5 rounded-xl border overflow-hidden"
                style={{ borderColor: "var(--border)" }}
            >
                <div
                    className="grid grid-cols-[1fr_100px_100px_140px] gap-4 px-4 py-2.5 text-xs font-medium uppercase tracking-wide"
                    style={{ color: "var(--text-faint)", borderBottom: "1px solid var(--border)" }}
                >
                    <span>Document</span>
                    <span>Type</span>
                    <span>Chunks</span>
                    <span>Status</span>
                </div>

                {filteredDocs.length === 0 && (
                    <p className="text-sm text-[var(--text-muted)] text-center py-8">
                        {docs.length === 0 ? "No documents uploaded yet." : "No documents match your search."}
                    </p>
                )}

                {filteredDocs.map((doc) => (
                    <div key={doc.id}>
                        <button
                            onClick={() => doc.status === "done" && setExpandedId(expandedId === doc.id ? null : doc.id)}
                            className="w-full grid grid-cols-[1fr_100px_100px_140px] gap-4 px-4 py-3 items-center text-left transition-colors hover:opacity-80"
                            style={{ borderBottom: "1px solid var(--border)", background: "var(--panel)" }}
                        >
                            <span className="flex items-center gap-2 text-sm text-[var(--text-primary)] truncate">
                                {doc.kind === "pdf" ? (
                                    <FileText className="h-4 w-4 shrink-0" style={{ color: "var(--text-muted)" }} />
                                ) : (
                                    <ImageIcon className="h-4 w-4 shrink-0" style={{ color: "var(--text-muted)" }} />
                                )}
                                {doc.filename}
                            </span>
                            <span className="text-xs text-[var(--text-secondary)] uppercase">{doc.kind}</span>
                            <span className="text-xs font-mono text-[var(--text-secondary)]">
                                {doc.status === "done" ? doc.indexedChunks : "--"}
                            </span>
                            {doc.status === "processing" && <Pill text="Processing" tone="pending" />}
                            {doc.status === "error" && <Pill text="Failed" tone="error" />}
                            {doc.status === "done" && <Pill text="Indexed" tone="good" />}
                        </button>

                        {doc.status === "error" && (
                            <div className="px-4 py-3 text-sm" style={{ background: "var(--error-bg)", color: "var(--error-text)" }}>
                                {doc.error}
                            </div>
                        )}

                        {doc.status === "done" && expandedId === doc.id && (
                            <div className="px-4 py-4" style={{ background: "var(--bg)" }}>
                                <span className="font-mono text-xs text-[var(--text-muted)] block mb-2">extracted text</span>
                                <p className="text-sm text-[var(--text-primary)] leading-relaxed whitespace-pre-wrap max-h-64 overflow-y-auto">
                                    {doc.extractedText || "(no text extracted)"}
                                </p>
                            </div>
                        )}
                    </div>
                ))}
            </div>

            <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", background: "var(--panel)" }}>
                    <span className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--text-faint)" }}>
                        Knowledge base
                    </span>
                    <p className="mt-1 text-sm text-[var(--text-secondary)]">
                        {indexedCount} of {docs.length} documents indexed in Qdrant with nomic-embed-text
                    </p>
                </div>
                <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", background: "var(--panel)" }}>
                    <span className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--text-faint)" }}>
                        Storage
                    </span>
                    <p className="mt-1 text-sm text-[var(--text-secondary)]">
                        Stored on Local-Node-01 -- never synced externally
                    </p>
                </div>
            </div>
        </div>
    );
}
