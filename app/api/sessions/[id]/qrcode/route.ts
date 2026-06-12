import { NextRequest, NextResponse } from "next/server";
import { generateQRCode } from "@/lib/qrcode";
import { getSession } from "@/lib/supabase";

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getSession(params.id);
    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    const qrCode = await generateQRCode(params.id);
    return NextResponse.json({ qrCode });
  } catch (err) {
    console.error("QR code error:", err);
    return NextResponse.json(
      { error: "Failed to generate QR code" },
      { status: 500 }
    );
  }
}
