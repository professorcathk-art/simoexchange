import { NextRequest, NextResponse } from "next/server";
import { getTranscriptJob } from "@/lib/supabase";
import { runTranscriptJob } from "@/server/transcript-jobs";

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const job = await getTranscriptJob(params.id);
    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    if (job.status === "pending") {
      runTranscriptJob(params.id).catch(console.error);
    }

    return NextResponse.json(job);
  } catch (err) {
    console.error("Get transcript job error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to get job" },
      { status: 500 }
    );
  }
}
