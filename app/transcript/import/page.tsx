"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import type { LangCode, TranscriptJob } from "@/types";
import { LANGUAGES } from "@/lib/constants";
import TranscriptPolishPanel from "@/components/TranscriptPolishPanel";

export default function TranscriptImportPage() {
  const [text, setText] = useState("");
  const [sourceLang, setSourceLang] = useState<LangCode>("en");
  const [targetLang, setTargetLang] = useState<LangCode>("zh");
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [job, setJob] = useState<TranscriptJob | null>(null);

  const handleFile = useCallback(async (file: File) => {
    const content = await file.text();
    setText(content);
  }, []);

  const onDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) await handleFile(file);
    },
    [handleFile]
  );

  const startImport = async () => {
    if (!text.trim()) {
      setError("Paste or upload a transcript first");
      return;
    }
    setUploading(true);
    setError(null);
    setJob(null);
    try {
      const res = await fetch("/api/transcript/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, source_lang: sourceLang, target_lang: targetLang }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Import failed");
      setJob(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setUploading(false);
    }
  };

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl px-4 py-10">
        <Link href="/" className="text-sm text-gray-400 hover:text-accent">
          ← Home
        </Link>
        <h1 className="mt-4 text-2xl font-bold text-white">Import & Polish Transcript</h1>
        <p className="mt-2 text-sm text-gray-400">
          Upload a Zoom or meeting transcript. AI will polish it and produce a professional
          bilingual document using your organization glossary.
        </p>

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <select
            value={sourceLang}
            onChange={(e) => setSourceLang(e.target.value as LangCode)}
            className="rounded-lg border border-white/10 bg-card px-3 py-2 text-sm text-white"
          >
            {LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>
                Source: {l.flag} {l.name}
              </option>
            ))}
          </select>
          <select
            value={targetLang}
            onChange={(e) => setTargetLang(e.target.value as LangCode)}
            className="rounded-lg border border-white/10 bg-card px-3 py-2 text-sm text-white"
          >
            {LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>
                Target: {l.flag} {l.name}
              </option>
            ))}
          </select>
        </div>

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => void onDrop(e)}
          className={`mt-4 rounded-xl border-2 border-dashed p-6 transition-colors ${
            dragOver ? "border-accent bg-accent/5" : "border-white/15 bg-card/50"
          }`}
        >
          <p className="mb-3 text-center text-sm text-gray-400">
            Drag & drop a .txt / .vtt / .srt file, or paste below
          </p>
          <input
            type="file"
            accept=".txt,.vtt,.srt,.csv,.md,text/plain"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleFile(f);
            }}
            className="mb-3 w-full text-sm text-gray-400"
          />
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Paste transcript text here..."
            rows={12}
            className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
          />
        </div>

        <button
          type="button"
          onClick={() => void startImport()}
          disabled={uploading || !!job}
          className="mt-4 w-full rounded-lg bg-accent py-3 font-semibold text-black disabled:opacity-50"
        >
          {uploading ? "Starting..." : "Polish & Translate Transcript"}
        </button>

        {error && <p className="mt-3 text-sm text-red-400">{error}</p>}

        {job && (
          <div className="mt-6">
            <TranscriptPolishPanel
              jobId={job.id}
              showGenerateButton={false}
              title="Import polish progress"
            />
          </div>
        )}
      </div>
    </main>
  );
}
