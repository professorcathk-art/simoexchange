"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { LANGUAGES } from "@/lib/constants";
import type { LangCode } from "@/types";

export default function NewSessionPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [sourceLang, setSourceLang] = useState<LangCode>("en");
  const [targetLang, setTargetLang] = useState<LangCode>("zh");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          source_lang: sourceLang,
          target_lang: targetLang,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create session");
      }

      const session = await res.json();
      router.push(`/session/${session.id}/host`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto max-w-lg px-4 py-10">
        <Link href="/" className="text-sm text-gray-400 hover:text-accent">
          ← Back to sessions
        </Link>

        <h1 className="mt-6 text-2xl font-bold text-white">Create Session</h1>
        <p className="mt-1 text-gray-400">
          Multi-speaker, multi-language meetings — all speech auto-detected and
          translated to your target language
        </p>

        <form onSubmit={handleSubmit} className="mt-8 space-y-6">
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-300">
              Session Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              placeholder="e.g. Conference Keynote"
              className="w-full rounded-lg border border-white/10 bg-card px-4 py-3 text-white placeholder-gray-500 focus:border-accent focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-gray-300">
              Primary Language <span className="text-gray-500">(optional hint)</span>
            </label>
            <p className="mb-2 text-xs text-gray-500">
              All EN/ZH/JA/KO are auto-detected. This is used for display only.
            </p>
            <select
              value={sourceLang}
              onChange={(e) => {
                const val = e.target.value as LangCode;
                setSourceLang(val);
                if (val === targetLang) {
                  const other = LANGUAGES.find((l) => l.code !== val);
                  if (other) setTargetLang(other.code);
                }
              }}
              className="w-full rounded-lg border border-white/10 bg-card px-4 py-3 text-white focus:border-accent focus:outline-none"
            >
              {LANGUAGES.map((lang) => (
                <option key={lang.code} value={lang.code}>
                  {lang.flag} {lang.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-gray-300">
              Target Language
            </label>
            <select
              value={targetLang}
              onChange={(e) => setTargetLang(e.target.value as LangCode)}
              className="w-full rounded-lg border border-white/10 bg-card px-4 py-3 text-white focus:border-accent focus:outline-none"
            >
              {LANGUAGES.filter((l) => l.code !== sourceLang).map((lang) => (
                <option key={lang.code} value={lang.code}>
                  {lang.flag} {lang.name}
                </option>
              ))}
            </select>
          </div>

          {error && (
            <p className="text-sm text-red-400">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading || !name.trim()}
            className="w-full rounded-lg bg-accent py-3 font-semibold text-black transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {loading ? "Creating..." : "Create Session"}
          </button>
        </form>
      </div>
    </main>
  );
}
