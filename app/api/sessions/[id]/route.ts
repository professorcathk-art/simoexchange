import { NextRequest, NextResponse } from "next/server";
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
    return NextResponse.json(session);
  } catch (err) {
    console.error("Get session error:", err);
    return NextResponse.json(
      { error: "Failed to get session" },
      { status: 500 }
    );
  }
}
