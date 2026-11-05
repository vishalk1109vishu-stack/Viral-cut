# =============================================================================
# ViralCut — single-image self-host deployment
#   Layers:  ffmpeg+python  →  node+bun  →  app
#   Runs:    Caddy (80/443) → Next.js standalone (3000)
# =============================================================================

FROM node:20-bookworm-slim AS base

# --- system deps (ffmpeg, python, fonts for non-Latin captions, caddy) -------
RUN apt-get update && apt-get install -y --no-install-recommends \
      ffmpeg \
      python3 python3-pip python3-venv \
      fonts-noto-cjk fonts-noto-color-emoji fonts-noto \
      curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# --- python deps -------------------------------------------------------------
# faster-whisper + opencv + yt-dlp need to be on the PATH that Node spawns.
COPY requirements.txt /tmp/requirements.txt
RUN pip3 install --break-system-packages --no-cache-dir -r /tmp/requirements.txt

# --- bun (faster cold start than stock node) ---------------------------------
RUN curl -fsSL https://bun.sh/install | bash && \
    ln -s /root/.bun/bin/bun /usr/local/bin/bun

# --- build the Next.js app ---------------------------------------------------
WORKDIR /app
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile || bun install

COPY . .
RUN bun run build

# --- runtime -----------------------------------------------------------------
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
ENV DATABASE_URL=file:/data/db/custom.db
# the storage folder holds rendered clips + downloaded source videos
RUN mkdir -p /data/db /app/storage

EXPOSE 3000

# Use node for production stability (bun has some spawn edge-cases)
CMD ["node", ".next/standalone/server.js"]
