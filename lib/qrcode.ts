import QRCode from "qrcode";

export function ensureUrlScheme(
  url: string,
  defaultScheme: "http" | "https" = "https"
): string {
  const trimmed = url.replace(/\/$/, "").trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (trimmed.includes("localhost")) return `http://${trimmed}`;
  return `${defaultScheme}://${trimmed}`;
}

export function resolveAppUrl(requestHost?: string | null, proto?: string | null): string {
  const envUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "").trim();
  if (envUrl && !envUrl.includes("localhost")) {
    return ensureUrlScheme(envUrl);
  }
  if (requestHost && !requestHost.includes("localhost")) {
    const scheme = proto === "http" ? "http" : "https";
    return `${scheme}://${requestHost}`;
  }
  if (envUrl) return ensureUrlScheme(envUrl, "http");
  return "http://localhost:3000";
}

export function buildListenerUrl(sessionId: string, baseUrl?: string): string {
  const root = (baseUrl || resolveAppUrl()).replace(/\/$/, "");
  return `${root}/session/${sessionId}/listen`;
}

export async function generateQRCode(
  sessionId: string,
  baseUrl?: string
): Promise<string> {
  const url = buildListenerUrl(sessionId, baseUrl);
  return QRCode.toDataURL(url);
}
