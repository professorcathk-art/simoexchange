import {
  getGlossaryTerms,
  getSegments,
  getSession,
  getTranscriptJob,
  updateTranscriptJob,
} from "@/lib/supabase";
import { filterGlossaryForLangs } from "@/lib/glossary";
import { polishTranscript } from "@/lib/polish-transcript";
import {
  plainTextToStructuredInput,
  segmentsToRawTranscript,
} from "@/lib/transcript-format";
import type { LangCode } from "@/types";

const runningJobs = new Set<string>();

export async function runTranscriptJob(jobId: string): Promise<void> {
  if (runningJobs.has(jobId)) return;
  runningJobs.add(jobId);

  try {
    const job = await getTranscriptJob(jobId);
    if (!job || job.status === "completed" || job.status === "failed") return;

    await updateTranscriptJob(jobId, {
      status: "processing",
      progress_percent: 5,
      progress_message: "Starting transcript job...",
    });

    let rawText = "";
    let sourceLang: LangCode = "en";
    let targetLang: LangCode = "zh";

    if (job.job_type === "session_polish" && job.session_id) {
      await updateTranscriptJob(jobId, {
        progress_percent: 10,
        progress_message: "Loading session transcript...",
      });

      const session = await getSession(job.session_id);
      if (!session) throw new Error("Session not found");

      sourceLang = session.source_lang as LangCode;
      targetLang = session.target_lang as LangCode;

      const segments = await getSegments(job.session_id);
      if (segments.length === 0) throw new Error("No transcript segments found");

      rawText = segmentsToRawTranscript(segments);
    } else if (job.job_type === "import_polish" && job.input_text) {
      await updateTranscriptJob(jobId, {
        progress_percent: 10,
        progress_message: "Processing uploaded transcript...",
      });
      rawText = plainTextToStructuredInput(job.input_text);
      sourceLang = (job.source_lang as LangCode) ?? "en";
      targetLang = (job.target_lang as LangCode) ?? "zh";
    } else {
      throw new Error("Invalid job configuration");
    }

    const allGlossary = await getGlossaryTerms(sourceLang, targetLang);
    const glossary = filterGlossaryForLangs(allGlossary, sourceLang, targetLang);

    const result = await polishTranscript(
      rawText,
      sourceLang,
      targetLang,
      glossary,
      async (percent, message) => {
        await updateTranscriptJob(jobId, {
          progress_percent: percent,
          progress_message: message,
        });
      }
    );

    await updateTranscriptJob(jobId, {
      status: "completed",
      progress_percent: 100,
      progress_message: "Complete — ready to download",
      result_text: result,
      completed_at: new Date().toISOString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[transcript-job] ${jobId} failed:`, message);
    await updateTranscriptJob(jobId, {
      status: "failed",
      progress_percent: 0,
      progress_message: "Failed",
      error_message: message,
      completed_at: new Date().toISOString(),
    });
  } finally {
    runningJobs.delete(jobId);
  }
}

export function scheduleTranscriptJob(jobId: string): void {
  setImmediate(() => {
    runTranscriptJob(jobId).catch((err) =>
      console.error(`[transcript-job] unhandled error ${jobId}:`, err)
    );
  });
}
