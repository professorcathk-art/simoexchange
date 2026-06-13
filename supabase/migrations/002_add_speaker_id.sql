-- Add speaker diarization support to transcript segments
ALTER TABLE transcript_segments
  ADD COLUMN IF NOT EXISTS speaker_id INTEGER;

CREATE INDEX IF NOT EXISTS idx_transcript_segments_speaker
  ON transcript_segments(session_id, speaker_id);
