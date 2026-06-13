-- Run this in Supabase SQL Editor if migrations 002/003 were not applied yet.

-- 002: speaker diarization
ALTER TABLE transcript_segments
  ADD COLUMN IF NOT EXISTS speaker_id INTEGER;

CREATE INDEX IF NOT EXISTS idx_transcript_segments_speaker
  ON transcript_segments(session_id, speaker_id);

-- 003: allow session delete
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'sessions' AND policyname = 'Allow public delete sessions'
  ) THEN
    CREATE POLICY "Allow public delete sessions" ON sessions FOR DELETE USING (true);
  END IF;
END $$;
