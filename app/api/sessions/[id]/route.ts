import { NextRequest, NextResponse } from "next/server";
import { deleteSession, getSession } from "@/lib/supabase";
import { closeSessionAudioConnections } from "@/server/audio-ws";

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getSession(params.id);
    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }
    return NextResponse.json(session);
  } catch (err) {
    console.error("Get session error:", err);
    return NextResponse.json(
      { error: "Failed to get session" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getSession(params.id);
    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    closeSessionAudioConnections(params.id);
    await deleteSession(params.id);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Delete session error:", err);
    return NextResponse.json(
      { error: "Failed to delete session" },
      { status: 500 }
    );
  }
}
