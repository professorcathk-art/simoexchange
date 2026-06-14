"use client";

import { useCallback, useEffect, useState } from "react";
import type { GlossaryTerm, LangCode } from "@/types";
import { LANGUAGES } from "@/lib/constants";

export default function GlossaryManager() {
  const [terms, setTerms] = useState<GlossaryTerm[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [sourceTerm, setSourceTerm] = useState("");
  const [targetTerm, setTargetTerm] = useState("");
  const [sourceLang, setSourceLang] = useState<LangCode | "*">("*");
  const [targetLang, setTargetLang] = useState<LangCode | "*">("*");
  const [notes, setNotes] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/glossary");
      if (!res.ok) throw new Error((await res.json()).error || "Failed to load");
      setTerms(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load glossary");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sourceTerm.trim() || !targetTerm.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/glossary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source_term: sourceTerm,
          target_term: targetTerm,
          source_lang: sourceLang,
          target_lang: targetLang,
          notes: notes || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to add");
      setTerms((prev) => [data, ...prev]);
      setSourceTerm("");
      setTargetTerm("");
      setNotes("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add term");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/glossary/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete");
      setTerms((prev) => prev.filter((t) => t.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete");
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-white">Organization Glossary</h2>
        <p className="mt-1 text-sm text-gray-400">
          Professional jargon mappings used in live translation and transcript polish.
        </p>
      </div>

      <form
        onSubmit={(e) => void handleAdd(e)}
        className="rounded-xl border border-white/10 bg-card p-4 space-y-3"
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <input
            value={sourceTerm}
            onChange={(e) => setSourceTerm(e.target.value)}
            placeholder="Source term (e.g. EBITDA)"
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
          />
          <input
            value={targetTerm}
            onChange={(e) => setTargetTerm(e.target.value)}
            placeholder="Translation (e.g. 税息折旧及摊销前利润)"
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <select
            value={sourceLang}
            onChange={(e) => setSourceLang(e.target.value as LangCode | "*")}
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
          >
            <option value="*">Any source language</option>
            {LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>
                {l.flag} {l.name}
              </option>
            ))}
          </select>
          <select
            value={targetLang}
            onChange={(e) => setTargetLang(e.target.value as LangCode | "*")}
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
          >
            <option value="*">Any target language</option>
            {LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>
                {l.flag} {l.name}
              </option>
            ))}
          </select>
        </div>
        <input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Notes (optional)"
          className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
        />
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-black disabled:opacity-50"
        >
          {saving ? "Adding..." : "Add term"}
        </button>
      </form>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-gray-400">Loading glossary...</p>
      ) : terms.length === 0 ? (
        <p className="text-gray-500">No glossary terms yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-white/10">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-white/10 bg-white/5 text-xs text-gray-400">
              <tr>
                <th className="px-4 py-2">Source</th>
                <th className="px-4 py-2">Translation</th>
                <th className="px-4 py-2">Languages</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {terms.map((t) => (
                <tr key={t.id} className="border-b border-white/5">
                  <td className="px-4 py-2 text-white">{t.source_term}</td>
                  <td className="px-4 py-2 text-accent">{t.target_term}</td>
                  <td className="px-4 py-2 text-gray-400">
                    {t.source_lang} → {t.target_lang}
                  </td>
                  <td className="px-4 py-2">
                    <button
                      type="button"
                      onClick={() => void handleDelete(t.id)}
                      className="text-xs text-red-400 hover:underline"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
