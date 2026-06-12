import type { SessionStatus } from "@/types";

interface StatusBadgeProps {
  status: SessionStatus;
  size?: "sm" | "md";
}

export default function StatusBadge({ status, size = "md" }: StatusBadgeProps) {
  const sizeClasses = size === "sm" ? "text-xs px-2 py-0.5" : "text-sm px-3 py-1";

  const config: Record<SessionStatus, { label: string; classes: string; pulse?: boolean }> = {
    live: {
      label: "LIVE",
      classes: "bg-green-500/20 text-green-400 border-green-500/30",
      pulse: true,
    },
    waiting: {
      label: "WAITING",
      classes: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
    },
    ended: {
      label: "ENDED",
      classes: "bg-gray-500/20 text-gray-400 border-gray-500/30",
    },
  };

  const { label, classes, pulse } = config[status];

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border font-medium ${sizeClasses} ${classes}`}
    >
      {pulse && (
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
        </span>
      )}
      {label}
    </span>
  );
}
