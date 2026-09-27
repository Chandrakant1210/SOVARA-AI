// src/components/DocumentsPanel.tsx
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Upload, Search, FileText, Image as ImageIcon, Trash2, Loader2 } from "lucide-react";
import { authFetch } from "@/lib/api";

type ServerDoc = {
    id: string;
    filename: string;
    created_at: string | null;
    owner: string | null;
    kind: "pdf" | "image" | "file";
    text_chars: number;
    indexed_chunks: number | null;
    can_delete: boolean;
};

// An upload in progress (shown until the server list includes it).
type PendingUpload = { tempId: string; filename: string; kind: "pdf" | "image"; error?: string };

const ACCEPTED_EXTENSIONS = [".png", ".jpg", ".jpeg", ".bmp", ".pdf"];
const FILTERS = ["All", "PDF", "Image"] as const;

async function readError(res: Response): Promise<string> {
    const body = await res.json().catch(() => null);
    if (Array.isArray(body?.detail)) return body.detail.map((e: { msg: string }) => e.msg).join(", ");
    return body?.detail ?? `Request failed with status ${res.status}`;
}

// Stored in UTC without a zone marker.
function formatDate(iso: string | null): string {
    if (!iso) return "";
    const d = new Date(/[zZ]|[+-]\d{2}:?\d{2}$/.test(iso) ? iso : `${iso}Z`);
    return d.toLocaleString([], { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

function Pill({ text, tone }: { text: string; tone: "good" | "pending" | "error" }) {
    const colors = {
        good: { bg: "var(--accent-soft-bg)", fg: "var(--accent-2)" },
        pending: { bg: "var(--accent-soft-bg)", fg: "var(--accent-3)" },
        error: { bg: "var(--error-bg)", fg: "var(--error-text)" },
    }[tone];
    return (
        <span className="text-xs font-medium px-2.5 py-1 rounded-full whitespace-nowrap" style={{ background: colors.bg, color: colors.fg }}>
            {text}
        </span>
    );
}

const GRID = "grid grid-cols-[1fr_120px_70px_80px_130px_40px] gap-4";

export default function DocumentsPanel() {
    const [docs, setDocs] = useState<ServerDoc[]>([]);
    const [pending, setPending] = useState<PendingUpload[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [texts, setTexts] = useState<Record<string, string>>({});
    const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
    const [deleting, setDeleting] = useState<string | null>(null);
    const [dragActive, setDragActive] = useState(false);
    const [search, setSearch] = useState("");
    const [filter, setFilter] = useState<(typeof FILTERS)[number]>("All");
    const fileInputRef = useRef<HTMLInputElement>(null);

    const load = useCallback(async () => {
        try {
            const res = await authFetch("/api/documents");
            if (!res.ok) throw new Error(await readError(res));
            setDocs(await res.json());
            setError(null);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Could not load documents");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    const uploadFile = async (file: File) => {
        const tempId = crypto.randomUUID();
        const ext = "." + file.name.split(".").pop()?.toLowerCase();
        setPending((prev) => [{ tempId, filename: file.name, kind: ext === ".pdf" ? "pdf" : "image" }, ...prev]);

        const formData = new FormData();
        formData.append("file", file);
        try {
            const res = await authFetch("/api/documents/upload", { method: "POST", body: formData });
            if (!res.ok) throw new Error(await readError(res));
            await load();
            setPending((prev) => prev.filter((p) => p.tempId !== tempId));
        } catch (err) {
            const message = err instanceof Error ? err.message : "Upload failed";
            setPending((prev) => prev.map((p) => (p.tempId === tempId ? { ...p, error: message } : p)));
        }
    };

    const handleFiles = (files: FileList | null) => {
        if (!files) return;
        Array.from(files).forEach((file) => {
            const ext = "." + file.name.split(".").pop()?.toLowerCase();
            if (ACCEPTED_EXTENSIONS.includes(ext)) uploadFile(file);
        });
    };

    const toggleExpand = async (doc: ServerDoc) => {
        if (expandedId === doc.id) {
            setExpandedId(null);
            return;
        }
        setExpandedId(doc.id);
        if (texts[doc.id] !== undefined) return;
        try {
            const res = await authFetch(`/api/documents/${doc.id}/text`);
            if (!res.ok) throw new Error(await readError(res));
            const data = await res.json();
            setTexts((prev) => ({ ...prev, [doc.id]: data.text }));
        } catch (err) {
            setTexts((prev) => ({ ...prev, [doc.id]: `(could not load text: ${err instanceof Error ? err.message : "error"})` }));
        }
    };

    const deleteDoc = async (doc: ServerDoc) => {
        setDeleting(doc.id);
        setError(null);
        try {
            const res = await authFetch(`/api/documents/${doc.id}`, { method: "DELETE" });
            if (!res.ok) throw new Error(await readError(res));
            setConfirmDelete(null);
            if (expandedId === doc.id) setExpandedId(null);
            await load();
        } catch (err) {
            setError(err instanceof Error ? err.message : "Delete failed");
        } finally {
            setDeleting(null);
        }
    };

    const filteredDocs = useMemo(() => {
        return docs.filter((d) => {
            const matchesFilter = filter === "All" || (filter === "PDF" && d.kind === "pdf") || (filter === "Image" && d.kind === "image");
            return matchesFilter && d.filename.toLowerCase().includes(search.toLowerCase());
        });
    }, [docs, filter, search]);

    const indexedCount = docs.filter((d) => (d.indexed_chunks ?? 0) > 0).length;
    const showOwner = docs.some((d) => d.owner && d.owner !== docs[0]?.owner);

    return (
        <div className="h-full overflow-y-auto p-6">
            <input ref={fileInputRef} type="file" accept={ACCEPTED_EXTENSIONS.join(",")} multiple onChange={(e) => { handleFiles(e.target.files); e.target.value = ""; }} className="hidden" />

            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-semibold text-[var(--text-primary)]">Document Vault</h1>
                    <p className="mt-1 text-sm text-[var(--text-secondary)]">
                        SOPs, manuals, reports and drawings the assistant can read. Processed with local OCR; your uploads are searchable only by you, managers and admins.
                    </p>
                </div>
                <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-lg transition-opacity hover:opacity-90 shrink-0" style={{ background: "var(--accent)", color: "var(--accent-fg)" }}>
                    <Upload className="h-4 w-4" /> Upload documents
                </button>
            </div>

            <div
                onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
                onDragLeave={() => setDragActive(false)}
                onDrop={(e) => { e.preventDefault(); setDragActive(false); handleFiles(e.dataTransfer.files); }}
                className="mt-5 rounded-xl border border-dashed p-4 text-center text-xs transition-colors"
                style={{ borderColor: dragActive ? "var(--accent)" : "var(--border)", color: "var(--text-muted)" }}
            >
                or drop a file here -- PNG, JPG, BMP, PDF
            </div>

            {error && <div className="mt-4 rounded-lg px-4 py-3 text-sm" style={{ background: "var(--error-bg)", color: "var(--error-text)" }}>{error}</div>}

            <div className="mt-5 flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2 flex-1 min-w-[220px] rounded-lg border px-3 py-2" style={{ borderColor: "var(--border)", background: "var(--panel)" }}>
                    <Search className="h-4 w-4" style={{ color: "var(--text-muted)" }} />
                    <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by filename" className="flex-1 bg-transparent text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none" />
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

            <div className="mt-5 rounded-xl border overflow-hidden" style={{ borderColor: "var(--border)" }}>
                <div className={`${GRID} px-4 py-2.5 text-xs font-medium uppercase tracking-wide`} style={{ color: "var(--text-faint)", borderBottom: "1px solid var(--border)" }}>
                    <span>Document</span>
                    <span>{showOwner ? "Owner" : "Uploaded"}</span>
                    <span>Type</span>
                    <span>Chunks</span>
                    <span>Status</span>
                    <span />
                </div>

                {pending.map((p) => (
                    <div key={p.tempId} className={`${GRID} px-4 py-3 items-center`} style={{ borderBottom: "1px solid var(--border)", background: "var(--panel)" }}>
                        <span className="text-sm text-[var(--text-primary)] truncate">{p.filename}</span>
                        <span className="text-xs text-[var(--text-secondary)]">now</span>
                        <span className="text-xs text-[var(--text-secondary)] uppercase">{p.kind}</span>
                        <span className="text-xs font-mono text-[var(--text-secondary)]">--</span>
                        {p.error ? <span title={p.error}><Pill text="Failed" tone="error" /></span> : <Pill text="Processing" tone="pending" />}
                        {p.error ? (
                            <button onClick={() => setPending((prev) => prev.filter((x) => x.tempId !== p.tempId))} className="text-xs underline" style={{ color: "var(--text-muted)" }}>hide</button>
                        ) : <span />}
                    </div>
                ))}

                {loading && <p className="flex items-center justify-center gap-2 text-sm text-[var(--text-muted)] py-8"><Loader2 className="h-4 w-4 animate-spin" /> Loading documents...</p>}
                {!loading && filteredDocs.length === 0 && pending.length === 0 && (
                    <p className="text-sm text-[var(--text-muted)] text-center py-8">{docs.length === 0 ? "No documents uploaded yet." : "No documents match your search."}</p>
                )}

                {filteredDocs.map((doc) => {
                    const confirming = confirmDelete === doc.id;
                    return (
                        <div key={doc.id}>
                            <div
                                role="button"
                                tabIndex={0}
                                onClick={() => toggleExpand(doc)}
                                className={`w-full ${GRID} px-4 py-3 items-center text-left cursor-pointer transition-colors hover:opacity-90`}
                                style={{ borderBottom: "1px solid var(--border)", background: "var(--panel)" }}
                            >
                                <span className="flex items-center gap-2 text-sm text-[var(--text-primary)] truncate" title={doc.filename}>
                                    {doc.kind === "pdf" ? <FileText className="h-4 w-4 shrink-0" style={{ color: "var(--text-muted)" }} /> : <ImageIcon className="h-4 w-4 shrink-0" style={{ color: "var(--text-muted)" }} />}
                                    {doc.filename}
                                </span>
                                <span className="text-xs text-[var(--text-secondary)] truncate" title={doc.owner ?? undefined}>
                                    {showOwner ? (doc.owner?.split("@")[0] ?? "unknown") : formatDate(doc.created_at)}
                                </span>
                                <span className="text-xs text-[var(--text-secondary)] uppercase">{doc.kind}</span>
                                <span className="text-xs font-mono text-[var(--text-secondary)]">{doc.indexed_chunks ?? "?"}</span>
                                <span>{doc.indexed_chunks === null ? <Pill text="Index offline" tone="pending" /> : doc.indexed_chunks > 0 ? <Pill text="Indexed" tone="good" /> : <Pill text="Not indexed" tone="pending" />}</span>
                                <span className="flex justify-end">
                                    {doc.can_delete && (
                                        <button
                                            onClick={(e) => { e.stopPropagation(); setConfirmDelete(confirming ? null : doc.id); }}
                                            className="p-1 rounded hover:opacity-70"
                                            aria-label={`Delete ${doc.filename}`}
                                            title="Delete"
                                        >
                                            <Trash2 className="h-4 w-4" style={{ color: confirming ? "var(--error-text)" : "var(--text-muted)" }} />
                                        </button>
                                    )}
                                </span>
                            </div>

                            {confirming && (
                                <div className="px-4 py-3 flex flex-wrap items-center gap-3 text-sm" style={{ background: "var(--error-bg)", color: "var(--error-text)", borderBottom: "1px solid var(--border)" }}>
                                    <span className="flex-1 min-w-[240px]">Delete <strong>{doc.filename}</strong>? This removes the file and its search index. The deletion is recorded in the Activity Log.</span>
                                    <button onClick={() => deleteDoc(doc)} disabled={deleting === doc.id} className="text-xs font-semibold px-3 py-1.5 rounded-lg disabled:opacity-50" style={{ background: "var(--error-text)", color: "var(--panel)" }}>
                                        {deleting === doc.id ? "Deleting..." : "Delete"}
                                    </button>
                                    <button onClick={() => setConfirmDelete(null)} disabled={deleting === doc.id} className="text-xs underline">Cancel</button>
                                </div>
                            )}

                            {expandedId === doc.id && (
                                <div className="px-4 py-4" style={{ background: "var(--bg)" }}>
                                    <span className="font-mono text-xs text-[var(--text-muted)] block mb-2">
                                        extracted text &middot; {doc.text_chars.toLocaleString()} characters &middot; uploaded {formatDate(doc.created_at)}{doc.owner ? ` by ${doc.owner}` : ""}
                                    </span>
                                    <p className="text-sm text-[var(--text-primary)] leading-relaxed whitespace-pre-wrap max-h-64 overflow-y-auto">
                                        {texts[doc.id] === undefined ? "Loading..." : texts[doc.id] || "(no text extracted)"}
                                    </p>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", background: "var(--panel)" }}>
                    <span className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--text-faint)" }}>Knowledge base</span>
                    <p className="mt-1 text-sm text-[var(--text-secondary)]">
                        {indexedCount} of {docs.length} of your visible documents indexed in Qdrant with nomic-embed-text. Shared SOPs are indexed separately for everyone.
                    </p>
                </div>
                <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", background: "var(--panel)" }}>
                    <span className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--text-faint)" }}>Storage</span>
                    <p className="mt-1 text-sm text-[var(--text-secondary)]">Stored on Local-Node-01 -- never synced externally</p>
                </div>
            </div>
        </div>
    );
}