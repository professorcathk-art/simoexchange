import QRCode from "qrcode";

export function resolveAppUrl(requestHost?: string | null, proto?: string | null): string {
  const envUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  if (envUrl && !envUrl.includes("localhost")) return envUrl;
  if (requestHost && !requestHost.includes("localhost")) {
    const scheme = proto === "http" ? "http" : "https";
    return `${scheme}://${requestHost}`;
  }
  return envUrl || "http://localhost:3000";
}

export async function generateQRCode(
  sessionId: string,
  baseUrl?: string
): Promise<string> {
  const url = `${(baseUrl || resolveAppUrl()).replace(/\/$/, "")}/session/${sessionId}/listen`;
  return QRCode.toDataURL(url);
}
