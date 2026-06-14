import { NextRequest, NextResponse } from "next/server";
import { getTranscriptJob } from "@/lib/supabase";
import { buildDownloadFilename, textToDocHtml } from "@/lib/transcript-download";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const job = await getTranscriptJob(params.id);
    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }
    if (job.status !== "completed" || !job.result_text) {
      return NextResponse.json(
        { error: "Transcript not ready for download" },
        { status: 400 }
      );
    }

    const { searchParams } = new URL(request.url);
    const format = searchParams.get("format") === "doc" ? "doc" : "txt";
    const title = job.session_id
      ? `Session Transcript ${job.session_id.slice(0, 8)}`
      : "Imported Transcript";
    const filename = buildDownloadFilename(title, format);

    if (format === "doc") {
      const html = textToDocHtml(title, job.result_text);
      return new NextResponse(html, {
        headers: {
          "Content-Type": "application/msword",
          "Content-Disposition": `attachment; filename="${filename}"`,
        },
      });
    }

    return new NextResponse(job.result_text, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    console.error("Download transcript error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to download" },
      { status: 500 }
    );
  }
}
