import type { ApiUsageStats } from "@/lib/audio-ws-protocol";
import { emitToSession } from "@/server/socket";

const usageBySession = new Map<string, ApiUsageStats>();

function emptyUsage(): ApiUsageStats {
  return {
    deepgramActiveSec: 0,
    deepgramSessions: 0,
    translations: 0,
    translationChars: 0,
    ttsRequests: 0,
    ttsChars: 0,
  };
}

export function getSessionUsage(sessionId: string): ApiUsageStats {
  return { ...(usageBySession.get(sessionId) ?? emptyUsage()) };
}

function publish(sessionId: string): void {
  try {
    emitToSession(sessionId, "api_usage", {
      sessionId,
      usage: getSessionUsage(sessionId),
    });
  } catch {
    // socket may be unavailable during tests
  }
}

export function trackDeepgramSessionStart(sessionId: string): void {
  const usage = usageBySession.get(sessionId) ?? emptyUsage();
  usage.deepgramSessions += 1;
  usageBySession.set(sessionId, usage);
  publish(sessionId);
}

export function trackDeepgramActiveSec(sessionId: string, seconds: number): void {
  if (seconds <= 0) return;
  const usage = usageBySession.get(sessionId) ?? emptyUsage();
  usage.deepgramActiveSec += seconds;
  usageBySession.set(sessionId, usage);
  publish(sessionId);
}

export function trackTranslation(sessionId: string, chars: number): void {
  const usage = usageBySession.get(sessionId) ?? emptyUsage();
  usage.translations += 1;
  usage.translationChars += chars;
  usageBySession.set(sessionId, usage);
  publish(sessionId);
}

export function trackTts(sessionId: string, chars: number): void {
  const usage = usageBySession.get(sessionId) ?? emptyUsage();
  usage.ttsRequests += 1;
  usage.ttsChars += chars;
  usageBySession.set(sessionId, usage);
  publish(sessionId);
}

export function clearSessionUsage(sessionId: string): void {
  usageBySession.delete(sessionId);
}
