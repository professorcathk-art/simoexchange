import { NextRequest, NextResponse } from "next/server";
import { listSessions, createSession } from "@/lib/supabase";
import type { LangCode } from "@/types";

export async function GET() {
  try {
    const sessions = await listSessions();
    return NextResponse.json(sessions);
  } catch (err) {
    console.error("List sessions error:", err);
    return NextResponse.json(
      { error: "Failed to list sessions" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, source_lang, target_lang } = body;

    if (!name || !source_lang || !target_lang) {
      return NextResponse.json(
        { error: "name, source_lang, and target_lang are required" },
        { status: 400 }
      );
    }

    if (source_lang === target_lang) {
      return NextResponse.json(
        { error: "Source and target languages must differ" },
        { status: 400 }
      );
    }

    const session = await createSession(
      name,
      source_lang as LangCode,
      target_lang as LangCode
    );
    return NextResponse.json(session, { status: 201 });
  } catch (err) {
    console.error("Create session error:", err);
    return NextResponse.json(
      { error: "Failed to create session" },
      { status: 500 }
    );
  }
}
