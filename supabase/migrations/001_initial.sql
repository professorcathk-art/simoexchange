-- LiveTranslate initial schema

CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  source_lang TEXT NOT NULL CHECK (source_lang IN ('en', 'zh', 'ja', 'ko')),
  target_lang TEXT NOT NULL CHECK (target_lang IN ('en', 'zh', 'ja', 'ko')),
  status TEXT DEFAULT 'waiting' CHECK (status IN ('waiting', 'live', 'ended')),
  created_at TIMESTAMPTZ DEFAULT now(),
  ended_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS transcript_segments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES sessions(id) ON DELETE CASCADE,
  seq_no INTEGER NOT NULL,
  source_text TEXT NOT NULL,
  is_final BOOLEAN DEFAULT false,
  translated_text TEXT,
  audio_base64 TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_transcript_segments_session_id ON transcript_segments(session_id);
CREATE INDEX IF NOT EXISTS idx_transcript_segments_seq ON transcript_segments(session_id, seq_no);

ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE transcript_segments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read sessions" ON sessions FOR SELECT USING (true);
CREATE POLICY "Allow public insert sessions" ON sessions FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update sessions" ON sessions FOR UPDATE USING (true);
CREATE POLICY "Allow public delete sessions" ON sessions FOR DELETE USING (true);

CREATE POLICY "Allow public read segments" ON transcript_segments FOR SELECT USING (true);
CREATE POLICY "Allow public insert segments" ON transcript_segments FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update segments" ON transcript_segments FOR UPDATE USING (true);
