# Contributing to ViralCut

Thanks for considering a contribution! 🙏

## Dev setup

```bash
git clone https://github.com/<you>/viralcut.git
cd viralcut
bun install
pip install -r requirements.txt
cp .env.example .env
bun run db:push
bun run dev
```

## Code style

- TypeScript strict mode is on. Don't disable it with `// @ts-ignore` — fix the type instead.
- Lint with `bun run lint` before pushing.
- Keep components in `src/components/`, hooks in `src/hooks/`, libs in `src/lib/`.
- The Python helpers in `ai-scripts/` must stay CLI-compatible — they're spawned by the Node pipeline.

## Commit messages

Conventional Commits style:

```
feat: add 60fps support for shorts
fix: prevent face tracking from drifting on fast pans
docs: clarify Vercel timeout limits
```

## Before opening a PR

- [ ] `bun run lint` passes
- [ ] `bun run build` succeeds
- [ ] If you touched `ai-scripts/`, test with a real video end-to-end
- [ ] If you changed the Prisma schema, run `bun run db:push` and verify the migration is non-destructive

## Areas that need love

- GPU support for faster-whisper (CUDA/CORE-ML)
- A worker queue (BullMQ?) so the Next.js process isn't blocked on long jobs
- Caching of downloaded YouTube videos (avoid re-downloading the same URL)
- Better subject tracking — currently 2 fps Haar; could be MediaPipe Pose

Open an issue first if you want to tackle any of these so we can discuss the approach.
