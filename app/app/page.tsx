"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Session } from "@/types";
import SessionCard from "@/components/SessionCard";

export default function AppDashboardPage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  function loadSessions() {
    return fetch("/api/sessions")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load sessions");
        return res.json();
      })
      .then(setSessions);
  }

  useEffect(() => {
    loadSessions()
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  async function handleDelete(id: string) {
    setDeletingId(id);
    setError(null);
    try {
      const res = await fetch(`/api/sessions/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to delete session");
      }
      setSessions((prev) => prev.filter((s) => s.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete session");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto max-w-5xl px-4 py-10">
        <div className="mb-10 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white">SimoExchange</h1>
            <p className="mt-1 text-gray-400">
              Live speech translation for events, webinars, and meetings
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/transcript/import"
              className="rounded-lg border border-white/15 px-4 py-2.5 text-sm text-gray-300 hover:border-accent/40 hover:text-accent"
            >
              Import Transcript
            </Link>
            <Link
              href="/glossary"
              className="rounded-lg border border-white/15 px-4 py-2.5 text-sm text-gray-300 hover:border-accent/40 hover:text-accent"
            >
              Glossary
            </Link>
            <Link
              href="/session/new"
              className="rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-black transition-opacity hover:opacity-90"
            >
              Create New Session
            </Link>
          </div>
        </div>

        {loading && <p className="text-gray-400">Loading sessions...</p>}

        {error && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-red-400">
            <p>{error}</p>
          </div>
        )}

        {!loading && !error && sessions.length === 0 && (
          <div className="rounded-xl border border-white/10 bg-card p-10 text-center">
            <p className="text-gray-400">No sessions yet.</p>
            <Link
              href="/session/new"
              className="mt-4 inline-block text-accent hover:underline"
            >
              Create your first session
            </Link>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          {sessions.map((session) => (
            <SessionCard
              key={session.id}
              session={session}
              onDelete={handleDelete}
              deleting={deletingId === session.id}
            />
          ))}
        </div>
      </div>
    </main>
  );
}
