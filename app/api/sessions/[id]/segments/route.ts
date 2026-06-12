import { NextRequest, NextResponse } from "next/server";
import { getSegments } from "@/lib/supabase";

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const segments = await getSegments(params.id);
    return NextResponse.json(segments);
  } catch (err) {
    console.error("Get segments error:", err);
    return NextResponse.json(
      { error: "Failed to get segments" },
      { status: 500 }
    );
  }
}
