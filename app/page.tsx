"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Session } from "@/types";
import SessionCard from "@/components/SessionCard";

export default function HomePage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/sessions")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load sessions");
        return res.json();
      })
      .then(setSessions)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto max-w-5xl px-4 py-10">
        <div className="mb-10 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white">LiveTranslate</h1>
            <p className="mt-1 text-gray-400">
              Real-time speech translation for live events
            </p>
          </div>
          <Link
            href="/session/new"
            className="rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-black transition-opacity hover:opacity-90"
          >
            Create New Session
          </Link>
        </div>

        {loading && (
          <p className="text-gray-400">Loading sessions...</p>
        )}

        {error && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-red-400">
            {error}. Make sure Supabase is configured in .env.local
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
            <SessionCard key={session.id} session={session} />
          ))}
        </div>
      </div>
    </main>
  );
}
