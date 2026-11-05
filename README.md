# ViralCut

Turn any long video into 3–4 viral short-form clips with karaoke captions, AI-selected highlights, and smart reframing that keeps subjects in frame. Mobile-first web app — no app install, no desktop software.

Works with **YouTube links** (any duration) **or** direct uploads from your phone gallery.

![ViralCut](public/logo.svg)

---

## What it does

1. **Paste a YouTube link** (or upload a video file).
2. Pick aspect ratio (9:16 / 1:1 / 4:5 / 16:9), clip count (3 or 4), clip length (Auto / 30 / 45 / 60s).
3. ViralCut downloads / ingests the video, transcribes it with faster-whisper, measures audio energy, tracks faces/motion with OpenCV, then **picks the best moments** and renders each one with burned-in karaoke captions and a smooth subject-following crop.

Each clip comes with:
- A **virality score** (0–100) broken down into Hook, Energy, Pacing, Flow
- An **AI-written title** and **hashtag set**
- A one-line reason explaining *why* this moment was chosen
- Streamable preview + poster image + one-tap download

---

## Tech stack

| Layer | Tech |
|---|---|
| Web | Next.js 16 (App Router, standalone output) · React · TypeScript · Tailwind · shadcn/ui |
| DB | Prisma + SQLite (zero-config, file-based) |
| Transcription | [faster-whisper](https://github.com/SYSTRAN/faster-whisper) (tiny or base model, CPU int8) — 90+ languages, word-level timestamps |
| Subject tracking | OpenCV Haar (frontal + profile face) + motion saliency on a 2 fps proxy |
| Reframing | FFmpeg `sendcmd`-driven smooth crop path so subjects stay centered |
| Audio | FFmpeg `loudnorm` + 16 kHz mono extraction for Whisper |
| Captions | ASS subtitle format with karaoke highlighting (Hindi/Urdu/Arabic scripts render correctly) |
| YouTube ingestion | [yt-dlp](https://github.com/yt-dlp/yt-dlp) with `android,ios` player clients — bypasses YouTube's datacenter-IP bot-check |

---

## Repository layout

```
.
├── ai-scripts/                # Python helpers called by the Next.js pipeline
│   ├── energy.py               #   per-step RMS loudness (numpy)
│   ├── track_faces.py          #   OpenCV face + motion tracking
│   └── transcribe.py           #   faster-whisper speech-to-text (with VAD fallback)
├── prisma/
│   └── schema.prisma           # Job + Clip tables
├── public/                     # static assets
├── src/
│   ├── app/                    # Next.js App Router pages + API routes
│   │   ├── page.tsx            #   the studio UI
│   │   └── api/jobs/...        #   job CRUD + clip streaming (HTTP 206 Range)
│   ├── components/viralcut/     # studio + marketing components
│   ├── hooks/                  # useToast etc.
│   └── lib/
│       ├── db.ts               # Prisma client
│       └── pipeline/            # the clip-generation pipeline
│           ├── runner.ts       #   orchestrates the whole job
│           ├── ytdlp.ts        #   yt-dlp wrapper (android/ios bypass)
│           ├── media.ts        #   ffprobe / ffmpeg helpers
│           ├── highlights.ts   #   virality scoring + clip selection
│           ├── captions.ts     #   ASS subtitle generation
│           ├── render.ts       #   ffmpeg sendcmd reframing + render
│           └── util.ts         #   spawn helper with line streaming
├── .env.example                # DATABASE_URL template
├── requirements.txt            # Python deps
├── package.json
├── Dockerfile                  # self-host (single container, Caddy + Next.js)
├── docker-compose.yml
├── vercel.json                 # one-click Vercel deploy
└── README.md
```

---

## Prerequisites (system-level binaries)

These must be installed on the host (or Docker image) **in addition** to npm/pip packages:

- **Node.js 18+** (or **Bun** — faster cold starts)
- **Python 3.10+**
- **FFmpeg 6+** (with libx264, libmp3lame, libass)
- **yt-dlp** (latest — older versions fail on YouTube's bot-check)

On Debian/Ubuntu:

```bash
sudo apt install -y ffmpeg python3 python3-pip
pip install -r requirements.txt   # installs yt-dlp + faster-whisper + opencv
```

On macOS:

```bash
brew install ffmpeg python@3.12 yt-dlp
pip install -r requirements.txt
```

---

## Quick start (local dev)

```bash
# 1. Clone
git clone https://github.com/<you>/viralcut.git
cd viralcut

# 2. Install JS deps
bun install        # or: npm install

# 3. Install Python deps
pip install -r requirements.txt

# 4. Configure DB
cp .env.example .env
# edit .env if you want a non-default DB path

# 5. Push the schema to SQLite
bun run db:push    # or: npx prisma db push --accept-data-loss

# 6. Run!
bun run dev        # or: npm run dev
# open http://localhost:3000
```

---

## Deployment options

### Option A — Docker (recommended for self-hosting)

The included `Dockerfile` builds a single self-contained image with Node, Python, FFmpeg, yt-dlp, and faster-whisper. The default `docker-compose.yml` mounts a volume for the SQLite DB and rendered clips.

```bash
docker compose up -d --build
# app is on http://localhost:8080
```

The container runs Caddy (port 80/443) → Next.js standalone (port 3000). For HTTPS with a real domain, edit `Caddyfile` to use your domain.

### Option B — Vercel

⚠️ **Vercel serverless functions have a 60s timeout on the free tier** and the filesystem is read-only except `/tmp`. Long videos will not finish in time. Use Vercel only for short videos, or pair with a separate worker (Render, Railway, Fly.io) for the heavy pipeline.

1. Push this repo to GitHub.
2. Import into Vercel.
3. Set env var `DATABASE_URL=file:/tmp/custom.db`.
4. Add Python build commands in Vercel project settings:
   - Install Command: `pip install -r requirements.txt && bun install`
   - Build Command: `bun run build`
5. Deploy.

### Option C — Railway / Render / Fly.io

These platforms give you a long-running container with a writable disk — better fit than Vercel for video processing.

1. Push to GitHub.
2. Create a new service pointing at this repo.
3. Set the start command to: `node .next/standalone/server.js`
4. Add a persistent volume mounted at `/data` and set `DATABASE_URL=file:/data/db/custom.db`.

### Option D — Plain VPS (Linux)

```bash
# on the server:
git clone https://github.com/<you>/viralcut.git
cd viralcut
bun install
pip install -r requirements.txt
bun run build
sudo apt install -y caddy
# edit Caddyfile to point at your domain, then:
sudo caddy run --config Caddyfile &
DATABASE_URL=file:/var/lib/viralcut/custom.db \
  node .next/standalone/server.js &
```

---

## How the YouTube link fix works

YouTube serves a BotGuard challenge to most datacenter IPs. Older yt-dlp versions would fail with `Sign in to confirm you're not a bot`.

The fix in `src/lib/pipeline/ytdlp.ts`:

```ts
"--extractor-args", "youtube:player_client=android,ios,default",
"--user-agent", "Mozilla/5.0 (Linux; Android 13; SM-S908U) ..."
```

The **mobile player clients** speak a different API path that does not trigger the BotGuard challenge. yt-dlp falls through `android → ios → default` so a single failed client doesn't abort the whole download. Tested working on datacenter IPs where the web client alone returns the bot-check error.

If your server IP gets rate-limited (HTTP 429) after heavy use, wait a few minutes — the limit resets. The Upload tab is always available as a fallback.

---

## How transcription handles music videos

`ai-scripts/transcribe.py` first tries with VAD (Voice Activity Detection) enabled to skip long silences — this is fast for podcasts/interviews. If VAD over-filters (which happens on music videos with constant background music), it automatically retries without VAD so you always get segments.

---

## Configuration

All config is in `.env` (copy from `.env.example`):

| Variable | Default | Notes |
|---|---|---|
| `DATABASE_URL` | `file:/tmp/custom.db` | SQLite path. Use a persistent volume in production. |

That's the only env var. Everything else is hardcoded sensible defaults.

---

## API reference

| Method | Endpoint | Description |
|---|---|---|
| `GET`  | `/api/jobs` | List recent jobs (for the "Recent renders" shelf) |
| `POST` | `/api/jobs` | Create a job. Body: JSON `{url, ratio, clipCount, clipLength, captions}` for YouTube, or raw video bytes with `Content-Type: video/*` and options in query string for upload. |
| `GET`  | `/api/jobs/:id` | Poll job status + clips |
| `DELETE` | `/api/jobs/:id` | Delete job + files |
| `GET`  | `/api/jobs/:id/clips/:clipId` | Stream the MP4 (supports HTTP Range) |
| `GET`  | `/api/jobs/:id/clips/:clipId?poster=1` | Get the poster JPEG |
| `GET`  | `/api/jobs/:id/clips/:clipId?dl=1` | Force download with friendly filename |

---

## Performance

On a 4-core CPU with 4 GB RAM:

| Source length | Wall-clock time |
|---|---|
| 5 min | ~2 min |
| 30 min | ~6 min |
| 2 hours | ~25 min |

Long videos use the `tiny` Whisper model; shorter ones use `base` for better accuracy.

---

## Known limitations

- **CPU-only Whisper.** No GPU support — would 5–10× the speed.
- **Subject tracking samples at 2 fps.** Fast camera movement may briefly lag.
- **Vercel free tier can't run long jobs.** Use Docker / Railway / a VPS instead.
- **YouTube bot-checks can still happen** if your IP is heavily abused — the Upload tab is the fallback.

---

## License

MIT — see `LICENSE`. Use it, fork it, ship it.

---

## Credits

Built on top of incredible open-source work:
- [faster-whisper](https://github.com/SYSTRAN/faster-whisper) (SYSTRAN)
- [yt-dlp](https://github.com/yt-dlp/yt-dlp)
- [FFmpeg](https://ffmpeg.org)
- [OpenCV](https://opencv.org)
- [Next.js](https://nextjs.org)
