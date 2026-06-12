# LiveTranslate

Real-time speech translation web service. Host captures live speech, audience joins via QR code to read live captions and listen to translated audio.

## Features

- **Host/Admin**: Capture mic audio → live source transcript + translated captions + TTS per phrase
- **Audience/Guests**: Join via QR code on mobile, pick language, read captions, auto-play translated audio
- **Audio Output**: Dedicated page for feeding translated audio into Zoom via virtual audio cable

## Supported Languages

| Code | Language |
|------|----------|
| `en` | English |
| `zh` | Chinese (Mandarin) |
| `ja` | Japanese |
| `ko` | Korean |

## Tech Stack

- Next.js 14 (App Router) + TypeScript + Tailwind CSS
- Custom server with Socket.io + WebSocket (`ws`)
- Supabase (Postgres) for sessions and transcript segments
- Deepgram Nova-3 for streaming STT
- GPT-4o mini via [AIML API](https://docs.aimlapi.com/) for translation
- ElevenLabs Flash v2.5 for TTS

## Setup

### 1. Environment variables

Copy the example file and fill in your API keys:

```bash
cp .env.local.example .env.local
```

| Variable | Description |
|----------|-------------|
| `DEEPGRAM_API_KEY` | Deepgram API key for Nova-3 streaming STT |
| `AIML_API_KEY` | AIML API key for GPT-4o mini translation ([docs](https://docs.aimlapi.com/api-references/text-models-llm)) |
| `ELEVENLABS_API_KEY` | ElevenLabs API key for Flash v2.5 TTS |
| `NEXT_PUBLIC_APP_URL` | Public app URL (e.g. `http://localhost:3000`) |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_ANON_KEY` | Supabase anon/public key |

### 2. Supabase migration

Run the SQL in `supabase/migrations/001_initial.sql` in your Supabase SQL Editor (Dashboard → SQL → New query).

### 3. Install and run

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

> **Important:** Always use `npm run dev` (not `next dev`) and `npm start` (not `next start`). The app requires the custom server for WebSocket audio streaming and Socket.io. This cannot run on Vercel serverless — deploy to a Node.js host (Railway, Render, Fly.io, VPS, etc.).

On startup, the server prints warnings for any missing env vars.

## Usage

1. **Create a session** — Go to home → "Create New Session", pick source and target languages
2. **Host the session** — On the host page, click "Start Recording" to begin mic capture
3. **Share with audience** — Scan the QR code or copy the listener link
4. **Guests listen** — Open the link on mobile, tap to enable audio, toggle audio on/off
5. **Zoom integration** — Open `/session/[id]/audio-out`, click to unlock audio, route via BlackHole (macOS) or VB-Cable (Windows) as Zoom mic input

## API Routes

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/sessions` | List all sessions |
| POST | `/api/sessions` | Create session |
| GET | `/api/sessions/[id]` | Get session details |
| PATCH | `/api/sessions/[id]/status` | Update status (`waiting` / `live` / `ended`) |
| GET | `/api/sessions/[id]/segments` | Get transcript segments |
| GET | `/api/sessions/[id]/qrcode` | Get QR code as base64 data URL |

## WebSocket

- **Audio stream**: `ws://localhost:3000/api/ws/audio?sessionId=<uuid>` — host sends WebM/Opus mic chunks
- **Real-time events**: Socket.io at `/socket.io` — rooms named `session:{id}`

## AIML API Note

Translation uses the OpenAI-compatible AIML API endpoint (`https://api.aimlapi.com/v1`) with model `gpt-4o-mini`. No direct OpenAI API key is required — only `AIML_API_KEY`.
