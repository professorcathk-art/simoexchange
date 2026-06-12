import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
import { updateSessionStatus } from "@/lib/supabase";
import { emitToSession, getIO } from "@/server/socket";
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
      getIO();
      emitToSession(params.id, "session_status", {
        sessionId: params.id,
        status,
      });
    } catch {
      // Socket.io may not be initialized during build
    }

    if (status === "ended") {
      closeSessionAudioConnections(params.id);
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
