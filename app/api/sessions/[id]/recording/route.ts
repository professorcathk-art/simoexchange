import { NextRequest, NextResponse } from "next/server";
import { getSession, updateSessionRecording } from "@/lib/supabase";
import { uploadBuffer } from "@/lib/storage";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getSession(params.id);
    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    const form = await request.formData();
    const file = form.get("recording");
    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json({ error: "Recording file required" }, { status: 400 });
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    const path = `recordings/${params.id}/host-${Date.now()}.webm`;
    await uploadBuffer(path, bytes, file.type || "audio/webm");
    const updated = await updateSessionRecording(params.id, path);

    return NextResponse.json({
      ok: true,
      path,
      public_url: `${process.env.SUPABASE_URL?.replace(/\/$/, "")}/storage/v1/object/public/session-media/${path}`,
      session: updated,
    });
  } catch (err) {
    console.error("Upload recording error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to upload recording" },
      { status: 500 }
    );
  }
}
