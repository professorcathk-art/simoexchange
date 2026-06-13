import type { ApiUsageStats } from "@/lib/audio-ws-protocol";

interface ApiUsagePanelProps {
  usage: ApiUsageStats;
  lowPowerMode: boolean;
}

function formatSec(sec: number): string {
  if (sec < 60) return `${sec.toFixed(1)}s`;
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}m ${s}s`;
}

export default function ApiUsagePanel({ usage, lowPowerMode }: ApiUsagePanelProps) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/5 p-4">
      <h3 className="mb-3 text-sm font-medium text-gray-300">API usage this session</h3>
      <dl className="space-y-2 text-xs">
        <div className="flex justify-between gap-4">
          <dt className="text-gray-500">Deepgram active time</dt>
          <dd className="font-mono text-gray-200">
            {formatSec(usage.deepgramActiveSec)}
            {lowPowerMode && (
              <span className="ml-1 text-green-400">(low power)</span>
            )}
          </dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-gray-500">Deepgram sessions</dt>
          <dd className="font-mono text-gray-200">{usage.deepgramSessions}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-gray-500">Translations</dt>
          <dd className="font-mono text-gray-200">
            {usage.translations} ({usage.translationChars} chars)
          </dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-gray-500">TTS requests</dt>
          <dd className="font-mono text-gray-200">
            {usage.ttsRequests} ({usage.ttsChars} chars)
          </dd>
        </div>
      </dl>
    </div>
  );
}
