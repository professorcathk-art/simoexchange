import { NextRequest, NextResponse } from "next/server";
import { buildListenerUrl, generateQRCode, resolveAppUrl } from "@/lib/qrcode";
import { getSession } from "@/lib/supabase";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getSession(params.id);
    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
    const proto = request.headers.get("x-forwarded-proto");
    const baseUrl = resolveAppUrl(host, proto);
    const qrCode = await generateQRCode(params.id, baseUrl);
    const listenerUrl = buildListenerUrl(params.id, baseUrl);
    return NextResponse.json({ qrCode, listenerUrl });
  } catch (err) {
    console.error("QR code error:", err);
    return NextResponse.json(
      { error: "Failed to generate QR code" },
      { status: 500 }
    );
  }
}
