import Link from "next/link";
import type { Session } from "@/types";
import { getLanguagePair } from "@/lib/constants";
import StatusBadge from "./StatusBadge";

interface SessionCardProps {
  session: Session;
  onDelete?: (id: string) => Promise<void>;
  deleting?: boolean;
}

export default function SessionCard({
  session,
  onDelete,
  deleting = false,
}: SessionCardProps) {
  async function handleDelete() {
    if (!onDelete) return;
    const confirmed = window.confirm(
      `Delete "${session.name}"? This cannot be undone.`
    );
    if (!confirmed) return;
    await onDelete(session.id);
  }

  return (
    <div className="rounded-xl border border-white/10 bg-card p-5 transition-colors hover:border-accent/30">
      <div className="mb-3 flex items-start justify-between gap-3">
        <h3 className="text-lg font-semibold text-white">{session.name}</h3>
        <StatusBadge status={session.status} size="sm" />
      </div>
      <p className="mb-4 text-sm text-gray-400">
        {getLanguagePair(session.source_lang, session.target_lang)}
      </p>
      <p className="mb-4 text-xs text-gray-500">
        Created {new Date(session.created_at).toLocaleString()}
      </p>
      <div className="flex items-center gap-2">
        <Link
          href={`/session/${session.id}/host`}
          className="inline-flex items-center rounded-lg bg-accent px-4 py-2 text-sm font-medium text-black transition-opacity hover:opacity-90"
        >
          Open
        </Link>
        {onDelete && (
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleting}
            className="rounded-lg border border-red-500/30 px-4 py-2 text-sm font-medium text-red-400 transition-colors hover:bg-red-500/10 disabled:opacity-50"
          >
            {deleting ? "Deleting..." : "Delete"}
          </button>
        )}
      </div>
    </div>
  );
}
