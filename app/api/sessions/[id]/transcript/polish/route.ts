import { NextRequest, NextResponse } from "next/server";
import {
  createTranscriptJob,
  getLatestSessionTranscriptJob,
  getSegments,
  getSession,
} from "@/lib/supabase";
import { scheduleTranscriptJob } from "@/server/transcript-jobs";

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const job = await getLatestSessionTranscriptJob(params.id);
    return NextResponse.json(job);
  } catch (err) {
    console.error("Get polish job error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to get job" },
      { status: 500 }
    );
  }
}

export async function POST(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getSession(params.id);
    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    const segments = await getSegments(params.id);
    if (segments.length === 0) {
      return NextResponse.json(
        { error: "No transcript segments to polish" },
        { status: 400 }
      );
    }

    const existing = await getLatestSessionTranscriptJob(params.id);
    if (existing && (existing.status === "pending" || existing.status === "processing")) {
      return NextResponse.json(existing);
    }

    const job = await createTranscriptJob({
      session_id: params.id,
      job_type: "session_polish",
      status: "pending",
      progress_percent: 0,
      progress_message: "Queued — starting soon...",
      source_lang: session.source_lang,
      target_lang: session.target_lang,
      input_text: null,
    });

    scheduleTranscriptJob(job.id);
    return NextResponse.json(job, { status: 201 });
  } catch (err) {
    console.error("Start polish job error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to start polish job" },
      { status: 500 }
    );
  }
}
