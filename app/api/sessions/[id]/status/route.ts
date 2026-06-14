import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
import { updateSessionStatus } from "@/lib/supabase";
import { archiveSessionTranscript } from "@/lib/session-archive";
import { emitToSession } from "@/server/socket";
import { closeSessionAudioConnections } from "@/server/audio-ws";
import type { SessionStatus } from "@/types";

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    const { status } = body as { status: SessionStatus };

    if (!["waiting", "live", "ended"].includes(status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }

    const session = await updateSessionStatus(params.id, status);

    try {
      emitToSession(params.id, "session_status", {
        sessionId: params.id,
        status,
      });
    } catch (err) {
      console.error("Socket.io emit failed:", err);
    }

    if (status === "ended") {
      closeSessionAudioConnections(params.id);
      archiveSessionTranscript(params.id).catch((err) =>
        console.error("Transcript archive failed:", err)
      );
    }

    return NextResponse.json(session);
  } catch (err) {
    console.error("Update status error:", err);
    return NextResponse.json(
      { error: "Failed to update session status" },
      { status: 500 }
    );
  }
}
