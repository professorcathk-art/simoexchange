-- Allow public delete on sessions (transcript_segments cascade via FK)
CREATE POLICY "Allow public delete sessions" ON sessions FOR DELETE USING (true);
