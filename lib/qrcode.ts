import QRCode from "qrcode";

export async function generateQRCode(sessionId: string): Promise<string> {
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const url = `${baseUrl}/session/${sessionId}/listen`;
  return QRCode.toDataURL(url);
}
