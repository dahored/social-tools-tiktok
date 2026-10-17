# Render worker: renders scene transitions with HyperFrames on demand.
# Build context is the repo root (it needs widgets/ and assets/ too).
#   docker compose up            → starts it next to the web server
FROM node:22-bookworm-slim

# System Chromium (Chrome builds don't exist for Linux ARM64) + FFmpeg + fonts
RUN apt-get update \
 && apt-get install -y --no-install-recommends chromium ffmpeg fonts-liberation fonts-dejavu-core ca-certificates \
 && rm -rf /var/lib/apt/lists/*

ENV HYPERFRAMES_BROWSER_PATH=/usr/bin/chromium \
    PUPPETEER_SKIP_DOWNLOAD=true \
    HYPERFRAMES_SKIP_SKILLS=1 \
    HYPERFRAMES_NO_TELEMETRY=1 \
    HYPERFRAMES_NO_UPDATE_CHECK=1 \
    HYPERFRAMES_NO_AUTO_INSTALL=1

WORKDIR /app/video
COPY video/package*.json ./
RUN npm ci

COPY widgets /app/widgets
COPY assets  /app/assets
COPY video/*.mjs ./

CMD ["node", "render-worker.mjs"]
