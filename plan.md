# Yoto Sync - Architecture

## Overview

A web application for syncing YouTube content to Yoto cards. Built with React Router v7 running on Node.js and Docker for self-hosting.

## Tech Stack

| Component        | Technology                               |
| ---------------- | ---------------------------------------- |
| Framework        | React Router v7 (Framework Mode)         |
| Runtime          | Node.js 22 / Docker                      |
| YouTube Download | yt-dlp + ffmpeg (in-container or local)  |
| UI               | shadcn/ui + Tailwind CSS v4              |
| Auth             | @yotoplay/oauth-device-code-flow         |
| Auth Storage     | Encrypted HTTP-only cookie (AES-256-GCM) |

## Project Structure

```
yoto/
├── app/
│   ├── root.tsx                      # Layout with header
│   ├── routes.ts                     # Route definitions
│   ├── routes/
│   │   ├── landing.tsx               # Landing page
│   │   ├── login.tsx                 # Device code auth
│   │   ├── cards.tsx                 # Dashboard (card grid)
│   │   ├── cards.$id.tsx             # Card detail (track list)
│   │   ├── api.import.$cardId.tsx    # Streaming import endpoint
│   │   ├── api.imports.$importId.ts  # Import status endpoint
│   │   └── api.icons.ts              # Icon search endpoint
│   ├── components/ui/                # shadcn components
│   ├── middleware/
│   │   └── auth.server.ts            # Auth middleware
│   └── lib/
│       ├── app-context.ts            # Application env/context access
│       ├── auth.server.ts            # Token management, SDK creation
│       ├── auth-cookie.server.ts     # Encrypted cookie storage
│       ├── import-progress.server.ts # In-memory SSE import progress
│       ├── import-workflow.server.ts # Background async import runner
│       ├── sandbox.server.ts         # Media processing (yt-dlp, ffmpeg)
│       ├── youtube.server.ts         # YouTube helpers
│       └── import.server.ts          # Upload and sync logic
├── Dockerfile                        # Multi-stage production container
├── docker-compose.yml                # Docker Compose deployment definition
└── public/                           # Static assets (favicon)
```

## Routes

| Route                    | Purpose                     |
| ------------------------ | --------------------------- |
| `/`                      | Landing page                |
| `/cards`                 | Card grid with search/sort  |
| `/login`                 | Device code authentication  |
| `/cards/:id`             | Card detail with track list |
| `/api/import/:cardId`    | Streaming import endpoint   |
| `/api/imports/:importId` | Import status endpoint      |
| `/api/icons`             | Icon search endpoint        |

## Data Flow

### Authentication

1. User clicks Login → Device code flow initiated
2. User opens Yoto website, confirms matching device code in browser
3. Tokens encrypted and stored in HTTP-only cookie
4. SDK created with JWT for API calls

### YouTube Import

1. User pastes YouTube URL on card detail page
2. Backend runs yt-dlp to extract video/playlist metadata
3. Each track: download audio via yt-dlp → split chapters via ffmpeg → upload to Yoto
4. Card updated with new chapters via Yoto SDK
5. Live progress streamed to the frontend via Server-Sent Events (SSE)
