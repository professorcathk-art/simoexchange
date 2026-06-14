import { NextRequest, NextResponse } from "next/server";
import { getSegments } from "@/lib/supabase";
import { enrichSegmentsWithAudioUrl } from "@/lib/session-archive";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const segments = await getSegments(params.id, { includeAudio: false });
    return NextResponse.json(enrichSegmentsWithAudioUrl(segments));
  } catch (err) {
    console.error("Get segments error:", err);
    return NextResponse.json(
      { error: "Failed to get segments" },
      { status: 500 }
    );
  }
}
