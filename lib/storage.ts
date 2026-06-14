import { getSupabase } from "@/lib/supabase";

const BUCKET = "session-media";

export function getPublicStorageUrl(path: string): string {
  const base = process.env.SUPABASE_URL?.replace(/\/$/, "");
  if (!base) throw new Error("SUPABASE_URL not set");
  return `${base}/storage/v1/object/public/${BUCKET}/${path}`;
}

export async function uploadBuffer(
  path: string,
  data: Buffer | Uint8Array,
  contentType: string
): Promise<string> {
  const { error } = await getSupabase()
    .storage.from(BUCKET)
    .upload(path, data, { contentType, upsert: true });

  if (error) throw error;
  return path;
}

export async function uploadBase64Audio(
  path: string,
  audioBase64: string,
  contentType = "audio/mpeg"
): Promise<string> {
  const buf = Buffer.from(audioBase64, "base64");
  return uploadBuffer(path, buf, contentType);
}

export async function uploadJson(path: string, payload: unknown): Promise<string> {
  const json = JSON.stringify(payload, null, 2);
  return uploadBuffer(path, Buffer.from(json, "utf-8"), "application/json");
}
