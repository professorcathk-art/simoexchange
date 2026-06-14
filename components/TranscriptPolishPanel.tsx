"use client";

import { useCallback, useEffect, useState } from "react";
import type { TranscriptJob } from "@/types";

interface TranscriptPolishPanelProps {
  sessionId?: string;
  jobId?: string | null;
  onJobCreated?: (job: TranscriptJob) => void;
  title?: string;
  showGenerateButton?: boolean;
}

const POLL_MS = 2000;

export default function TranscriptPolishPanel({
  sessionId,
  jobId: externalJobId,
  onJobCreated,
  title = "Professional Transcript",
  showGenerateButton = true,
}: TranscriptPolishPanelProps) {
  const [job, setJob] = useState<TranscriptJob | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeJobId = externalJobId ?? job?.id;

  const fetchJob = useCallback(async (id: string) => {
    const res = await fetch(`/api/transcript/jobs/${id}`);
    if (!res.ok) throw new Error("Failed to fetch job status");
    return (await res.json()) as TranscriptJob;
  }, []);

  const loadSessionJob = useCallback(async () => {
    if (!sessionId) return;
    const res = await fetch(`/api/sessions/${sessionId}/transcript/polish`);
    if (res.ok) {
      const data = await res.json();
      if (data?.id) setJob(data);
    }
  }, [sessionId]);

  useEffect(() => {
    if (sessionId && !externalJobId) void loadSessionJob();
  }, [sessionId, externalJobId, loadSessionJob]);

  useEffect(() => {
    if (!activeJobId) return;

    let cancelled = false;

    const poll = async () => {
      try {
        const data = await fetchJob(activeJobId);
        if (!cancelled) setJob(data);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Poll failed");
        }
      }
    };

    void poll();
    const id = setInterval(() => void poll(), POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [activeJobId, fetchJob]);

  const startPolish = async () => {
    if (!sessionId) return;
    setStarting(true);
    setError(null);
    try {
      const res = await fetch(`/api/sessions/${sessionId}/transcript/polish`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to start");
      setJob(data);
      onJobCreated?.(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start polish");
    } finally {
      setStarting(false);
    }
  };

  const isProcessing =
    job?.status === "pending" || job?.status === "processing" || starting;
  const isComplete = job?.status === "completed";
  const isFailed = job?.status === "failed";

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
      <h3 className="mb-3 text-sm font-semibold text-white">{title}</h3>

      {showGenerateButton && sessionId && !isProcessing && !isComplete && (
        <button
          type="button"
          onClick={() => void startPolish()}
          disabled={starting}
          className="mb-3 w-full rounded-lg bg-accent py-2.5 text-sm font-semibold text-black hover:opacity-90 disabled:opacity-50"
        >
          Generate Professional Transcript
        </button>
      )}

      {isProcessing && (
        <div className="mb-3 space-y-2">
          <div className="flex items-center justify-between text-xs text-gray-400">
            <span>{job?.progress_message ?? "Starting..."}</span>
            <span>{job?.progress_percent ?? 0}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-accent transition-all duration-500"
              style={{ width: `${job?.progress_percent ?? 5}%` }}
            />
          </div>
          <p className="text-xs text-amber-400/90">
            AI is polishing your transcript — short sessions usually finish in 15–40 seconds.
          </p>
        </div>
      )}

      {isFailed && (
        <div className="mb-3 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
          {job?.error_message ?? "Polish failed"}
          {sessionId && (
            <button
              type="button"
              onClick={() => void startPolish()}
              className="mt-2 block text-accent hover:underline"
            >
              Try again
            </button>
          )}
        </div>
      )}

      {isComplete && activeJobId && (
        <div className="space-y-3">
          <p className="text-xs text-green-400">✓ Transcript ready</p>
          <div className="flex flex-wrap gap-2">
            <a
              href={`/api/transcript/jobs/${activeJobId}/download?format=txt`}
              className="rounded-lg border border-accent/40 bg-accent/10 px-4 py-2 text-sm text-accent hover:bg-accent/20"
            >
              Download .txt
            </a>
            <a
              href={`/api/transcript/jobs/${activeJobId}/download?format=doc`}
              className="rounded-lg border border-accent/40 bg-accent/10 px-4 py-2 text-sm text-accent hover:bg-accent/20"
            >
              Download .doc
            </a>
          </div>
          {job?.result_text && (
            <div className="max-h-64 overflow-y-auto rounded-lg border border-white/10 bg-black/20 p-3">
              <pre className="whitespace-pre-wrap text-xs text-gray-300">
                {job.result_text.slice(0, 4000)}
                {job.result_text.length > 4000 ? "\n\n...(truncated preview)" : ""}
              </pre>
            </div>
          )}
        </div>
      )}

      {error && <p className="text-sm text-red-400">{error}</p>}
    </div>
  );
}
