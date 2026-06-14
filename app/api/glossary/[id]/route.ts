import { NextRequest, NextResponse } from "next/server";
import { deleteGlossaryTerm } from "@/lib/supabase";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await deleteGlossaryTerm(params.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Delete glossary error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to delete glossary term" },
      { status: 500 }
    );
  }
}
