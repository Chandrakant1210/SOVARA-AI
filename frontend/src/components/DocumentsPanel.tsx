// src/components/DocumentsPanel.tsx
"use client";

import { useRef, useState } from "react";
import { authFetch } from "@/lib/api";

type UploadedDoc = {
    id: string;
    filename: string;
    extractedText: string;
    indexedChunks: number;
    status: "processing" | "done" | "error";
    error?: string;
};

const ACCEPTED_EXTENSIONS = [".png", ".jpg", ".jpeg", ".bmp", ".pdf"];

export default function DocumentsPanel() {
    const [docs, setDocs] = useState<UploadedDoc[]>([]);
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [dragActive, setDragActive] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const uploadFile = async (file: File) => {
        const tempId = crypto.randomUUID();

        setDocs((prev) => [
            { id: tempId, filename: file.name, extractedText: "", indexedChunks: 0, status: "processing" },
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
                        ? {
                            ...d,
                            extractedText: data.extracted_text,
                            indexedChunks: data.indexed_chunks,
                            status: "done",
                        }
                        : d
                )
            );
            setExpandedId(tempId);
        } catch (err) {
            setDocs((prev) =>
                prev.map((d) =>
                    d.id === tempId
                        ? {
                            ...d,
                            status: "error",
                            error: err instanceof Error ? err.message : "Upload failed",
                        }
                        : d
                )
            );
        }
    };

    const handleFiles = (files: FileList | null) => {
        if (!files) return;
        Array.from(files).forEach((file) => {
            const ext = "." + file.name.split(".").pop()?.toLowerCase();
            if (ACCEPTED_EXTENSIONS.includes(ext)) {
                uploadFile(file);
            }
        });
    };

    return (
        <div className="flex flex-col h-full px-8 py-14 overflow-y-auto">
            <div className="w-full max-w-xl mx-auto">
                <h1 className="text-2xl font-medium text-[#E7ECEF] tracking-tight">
                    Documents
                </h1>
                <p className="mt-2 text-sm text-[#8B98A3] leading-relaxed">
                    Upload scanned inspection reports, drawings, or SOPs. Processed
                    locally with OCR and vision extraction — nothing leaves this
                    network. Uploaded documents are also indexed so SOVARA&apos;s
                    assistant can answer questions about them.
                </p>

                <div
                    onDragOver={(e) => {
                        e.preventDefault();
                        setDragActive(true);
                    }}
                    onDragLeave={() => setDragActive(false)}
                    onDrop={(e) => {
                        e.preventDefault();
                        setDragActive(false);
                        handleFiles(e.dataTransfer.files);
                    }}
                    onClick={() => fileInputRef.current?.click()}
                    className={`mt-6 rounded-sm border border-dashed p-8 text-center cursor-pointer transition-colors ${dragActive
                        ? "border-[#2FD9C3] bg-[#10151A]"
                        : "border-[#1E262C] hover:border-[#2FD9C3]/40"
                        }`}
                >
                    <p className="text-sm text-[#8B98A3]">
                        Drop a file here, or{" "}
                        <span className="text-[#2FD9C3]">click to browse</span>
                    </p>
                    <p className="mt-1 text-xs text-[#5B6670] font-mono">
                        PNG · JPG · BMP · PDF
                    </p>
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept={ACCEPTED_EXTENSIONS.join(",")}
                        multiple
                        onChange={(e) => handleFiles(e.target.files)}
                        className="hidden"
                    />
                </div>

                <div className="mt-6 flex flex-col gap-2">
                    {docs.length === 0 && (
                        <p className="text-sm text-[#5B6670] text-center py-8">
                            No documents uploaded yet.
                        </p>
                    )}

                    {docs.map((doc) => (
                        <div key={doc.id}>
                            <button
                                onClick={() =>
                                    doc.status === "done" &&
                                    setExpandedId(expandedId === doc.id ? null : doc.id)
                                }
                                className="w-full flex items-center justify-between rounded-sm border border-[#1E262C] bg-[#10151A] px-4 py-3 text-left hover:border-[#2FD9C3]/40 transition-colors"
                            >
                                <span className="text-sm text-[#E7ECEF] truncate">
                                    {doc.filename}
                                </span>
                                <span
                                    className={`text-xs font-mono ml-3 shrink-0 ${doc.status === "done"
                                        ? "text-[#2FD9C3]"
                                        : doc.status === "error"
                                            ? "text-[#E5A3A3]"
                                            : "text-[#5B6670]"
                                        }`}
                                >
                                    {doc.status === "processing"
                                        ? "processing…"
                                        : doc.status === "error"
                                            ? "failed"
                                            : "done"}
                                </span>
                            </button>

                            {doc.status === "error" && (
                                <div className="mt-1 rounded-sm border border-[#4A2A2A] bg-[#1A1010] p-3 text-sm text-[#E5A3A3]">
                                    {doc.error}
                                </div>
                            )}

                            {doc.status === "done" && expandedId === doc.id && (
                                <div className="mt-1 rounded-sm border border-[#1E262C] bg-[#10151A] p-4">
                                    <span className="font-mono text-xs text-[#5B6670] block mb-2">
                                        extracted text
                                    </span>
                                    <p className="text-[15px] text-[#E7ECEF] leading-relaxed whitespace-pre-wrap max-h-64 overflow-y-auto">
                                        {doc.extractedText || "(no text extracted)"}
                                    </p>
                                    <p className="mt-3 text-xs font-mono text-[#2FD9C3]">
                                        {doc.indexedChunks > 0
                                            ? `Indexed as ${doc.indexedChunks} chunk${doc.indexedChunks === 1 ? "" : "s"} — searchable by SOVARA's assistant.`
                                            : "Not indexed for retrieval (no text extracted)."}
                                    </p>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}