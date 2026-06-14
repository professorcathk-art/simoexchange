-- Session media backup: raw recording + TTS audio in Supabase Storage

ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS raw_recording_path TEXT,
  ADD COLUMN IF NOT EXISTS transcript_archive_path TEXT;

ALTER TABLE transcript_segments
  ADD COLUMN IF NOT EXISTS audio_storage_path TEXT;

-- Create public bucket for session media (run once; safe if exists)
INSERT INTO storage.buckets (id, name, public)
VALUES ('session-media', 'session-media', true)
ON CONFLICT (id) DO NOTHING;

-- Public read/write for session media (matches existing open RLS pattern)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'objects' AND policyname = 'Public read session media'
  ) THEN
    CREATE POLICY "Public read session media"
      ON storage.objects FOR SELECT
      USING (bucket_id = 'session-media');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'objects' AND policyname = 'Public upload session media'
  ) THEN
    CREATE POLICY "Public upload session media"
      ON storage.objects FOR INSERT
      WITH CHECK (bucket_id = 'session-media');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'objects' AND policyname = 'Public update session media'
  ) THEN
    CREATE POLICY "Public update session media"
      ON storage.objects FOR UPDATE
      USING (bucket_id = 'session-media');
  END IF;
END $$;
