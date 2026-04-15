# Clicky Mobile — ElevenHacks 4 Project

## Overview

A voice-first AI assistant mobile app built for the ElevenHacks 4 hackathon using ElevenLabs and Turbopuffer.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Artifacts

### 1. Clicky Mobile (Expo React Native)
- **Path**: `artifacts/clicky-mobile/`
- **Preview**: `/` (root)
- **Description**: Voice-first AI assistant mobile app
- **Key Features**:
  - Voice input via Web Speech API (web) / device mic (native)
  - Text chat with ElevenLabs TTS response (streaming audio)
  - Vector memory with Turbopuffer (stores/retrieves conversation context)
  - Dark theme with glowing orb UI inspired by ChatGPT mobile

### 2. API Server (Express)
- **Path**: `artifacts/api-server/`
- **Preview**: `/api`
- **Routes**:
  - `GET /api/assistant/agent-config` — ElevenLabs agent config
  - `POST /api/assistant/signed-url` — Get ElevenLabs Conversational AI signed URL
  - `POST /api/assistant/chat` — Send message → get TTS audio + text reply
  - `POST /api/assistant/memories` — Query Turbopuffer vector memories
  - `POST /api/assistant/tts` — Text-to-speech (ElevenLabs)

## Environment Variables / Secrets Required

- `ELEVENLABS_API_KEY` — ElevenLabs API key
- `TURBOPUFFER_API_KEY` — Turbopuffer API key
- `TURBOPUFFER_REGION` — Turbopuffer region (default: `gcp-us-central1`)
- `ELEVENLABS_AGENT_ID` — (optional) ElevenLabs Conversational AI agent ID for real-time voice
- `GROQ_API_KEY` — (optional) Groq API key for faster LLM responses (llama-3.1-8b-instant)

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks
- `pnpm --filter @workspace/api-server run dev` — run API server locally

## Architecture

The app uses a **hybrid memory approach**:
1. **Short-term**: Messages stored in AsyncStorage on device
2. **Long-term**: Conversation vectors stored in Turbopuffer namespace `clicky-memories` with session-based filtering
3. **Voice**: ElevenLabs TTS streams audio directly from the `/chat` endpoint

See the `pnpm-workspace` skill for workspace structure details.
