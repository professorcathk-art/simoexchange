-- Run this in Supabase SQL Editor if migrations 002/003/004 were not applied yet.

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

-- 004: glossary + transcript polish jobs
CREATE TABLE IF NOT EXISTS glossary_terms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_term TEXT NOT NULL,
  target_term TEXT NOT NULL,
  source_lang TEXT NOT NULL DEFAULT '*' CHECK (source_lang IN ('en', 'zh', 'ja', 'ko', '*')),
  target_lang TEXT NOT NULL DEFAULT '*' CHECK (target_lang IN ('en', 'zh', 'ja', 'ko', '*')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_glossary_langs ON glossary_terms (source_lang, target_lang);

CREATE TABLE IF NOT EXISTS transcript_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES sessions(id) ON DELETE SET NULL,
  job_type TEXT NOT NULL CHECK (job_type IN ('session_polish', 'import_polish')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  progress_percent INTEGER NOT NULL DEFAULT 0 CHECK (progress_percent >= 0 AND progress_percent <= 100),
  progress_message TEXT NOT NULL DEFAULT 'Queued',
  source_lang TEXT CHECK (source_lang IN ('en', 'zh', 'ja', 'ko')),
  target_lang TEXT CHECK (target_lang IN ('en', 'zh', 'ja', 'ko')),
  input_text TEXT,
  result_text TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_transcript_jobs_session ON transcript_jobs (session_id);
CREATE INDEX IF NOT EXISTS idx_transcript_jobs_status ON transcript_jobs (status);

ALTER TABLE glossary_terms ENABLE ROW LEVEL SECURITY;
ALTER TABLE transcript_jobs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'glossary_terms' AND policyname = 'Allow public read glossary') THEN
    CREATE POLICY "Allow public read glossary" ON glossary_terms FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'glossary_terms' AND policyname = 'Allow public insert glossary') THEN
    CREATE POLICY "Allow public insert glossary" ON glossary_terms FOR INSERT WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'glossary_terms' AND policyname = 'Allow public update glossary') THEN
    CREATE POLICY "Allow public update glossary" ON glossary_terms FOR UPDATE USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'glossary_terms' AND policyname = 'Allow public delete glossary') THEN
    CREATE POLICY "Allow public delete glossary" ON glossary_terms FOR DELETE USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'transcript_jobs' AND policyname = 'Allow public read transcript_jobs') THEN
    CREATE POLICY "Allow public read transcript_jobs" ON transcript_jobs FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'transcript_jobs' AND policyname = 'Allow public insert transcript_jobs') THEN
    CREATE POLICY "Allow public insert transcript_jobs" ON transcript_jobs FOR INSERT WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'transcript_jobs' AND policyname = 'Allow public update transcript_jobs') THEN
    CREATE POLICY "Allow public update transcript_jobs" ON transcript_jobs FOR UPDATE USING (true);
  END IF;
END $$;
