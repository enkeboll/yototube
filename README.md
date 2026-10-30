# Yoto Sync

A web application for syncing YouTube content to Yoto cards. Download audio from YouTube videos or playlists and upload them directly to your Yoto cards. Built for self-hosting with Node.js and Docker (e.g., on a Synology NAS or any Docker host).

## Features

- Browse and manage your Yoto cards
- Import audio from YouTube videos and playlists
- Split YouTube videos by chapters into individual Yoto tracks
- Drag-and-drop track reordering
- Track deletion and card title/cover management
- Search and sort cards

## Prerequisites

- **For local Node.js development:**
    - Node.js 22+
    - `ffmpeg` and `yt-dlp` installed locally (`brew install ffmpeg yt-dlp`)
- **For Docker / Synology NAS:**
    - Docker / Synology Container Manager (all audio tools like `yt-dlp` and `ffmpeg` are built into the Docker image)

## Quick Start (Docker)

The fastest way to run Yoto Sync is using Docker Compose:

1. Create a `.env` file from `.env.example`:

    ```bash
    cp .env.example .env
    ```

    Generate a 32-character secret:

    ```bash
    openssl rand -base64 32
    ```

    Set `YOTO_AUTH_SECRET` in `.env`.

2. Start the container:

    ```bash
    docker compose up -d
    ```

3. Open [http://localhost:3000](http://localhost:3000) in your browser.

## Local Development

```bash
# Install dependencies
npm install

# Start Vite dev server
npm run dev

# Run test suite
npm run test

# Check types, linting, and formatting
npm run typecheck
npm run lint
npm run format
```

## Production Deployment

### Synology NAS (Container Manager)

1. Open **Container Manager** on your Synology NAS.
2. Under **Project** (Docker Compose), create a new project pointing to this directory or use the provided `docker-compose.yml`.
3. Provide the environment variables in your `.env` file:
    - `YOTO_AUTH_SECRET`: (Required) Encryption secret for secure cookie auth storage
    - `PORT`: (Default: `3000`)
    - `RESEND_API_KEY`: (Optional) For sending feedback emails
4. Start the project. Yoto Sync will be accessible on your local network at `http://<nas-ip>:3000`.

### Building & Publishing Docker Image (GitHub Container Registry)

This repository includes a GitHub Actions workflow in `.github/workflows/docker.yml` to build and publish multi-platform container images to GitHub Container Registry (GHCR).

The workflow is configured for **manual deployment (`workflow_dispatch`)** to conserve GitHub Actions compute:

1. In your GitHub repository, navigate to **Actions**.
2. Select **Publish Docker Image**.
3. Click **Run workflow**.

The resulting image will be published to:

```
ghcr.io/<your-github-username>/yototube:latest
```

## Available Scripts

| Command              | Description                                               |
| -------------------- | --------------------------------------------------------- |
| `npm run dev`        | Starts the Vite development server                        |
| `npm run build`      | Builds the React Router client and server bundles         |
| `npm run start`      | Runs the production Node.js server (`react-router-serve`) |
| `npm run test`       | Runs the Vitest test suite                                |
| `npm run typecheck`  | Checks TypeScript types                                   |
| `npm run lint`       | Lints files with ESLint                                   |
| `npm run format`     | Checks Prettier code formatting                           |
| `npm run format:fix` | Automatically formats files with Prettier                 |

## Tech Stack

- **Runtime:** Node.js 22 / Docker
- **Framework:** [React Router v7](https://reactrouter.com/) (Framework Mode, SSR)
- **UI:** [Tailwind CSS v4](https://tailwindcss.com/) + [shadcn/ui](https://ui.shadcn.com/)
- **Media Tools:** [yt-dlp](https://github.com/yt-dlp/yt-dlp) + [ffmpeg](https://ffmpeg.org/)
- **Yoto Client:** [@yotoplay/yoto-sdk](https://www.npmjs.com/package/@yotoplay/yoto-sdk)
- **Authentication:** [@yotoplay/oauth-device-code-flow](https://www.npmjs.com/package/@yotoplay/oauth-device-code-flow) with AES-256-GCM encrypted cookies
