# Stage 1: Build the application
FROM node:22-bookworm-slim AS build-env
WORKDIR /app

RUN npm install -g npm@11

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build
RUN npm prune --omit=dev

# Stage 2: Production runtime with yt-dlp, ffmpeg, and Node.js
FROM node:22-bookworm-slim

ENV NODE_ENV=production
ENV PORT=3000

# Install yt-dlp, ffmpeg, and runtime dependencies
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        ca-certificates \
        curl \
        ffmpeg \
        python3 && \
    curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp && \
    chmod a+rx /usr/local/bin/yt-dlp && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=build-env /app/package.json ./package.json
COPY --from=build-env /app/node_modules ./node_modules
COPY --from=build-env /app/build ./build
COPY --from=build-env /app/public ./public

EXPOSE 3000

CMD ["npm", "run", "start"]