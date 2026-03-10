# LiNa AI System

LiNa is a multi-provider AI orchestrator with Telegram as the primary conversational interface and a future dashboard for operations and observability.

## Current status

This repository already includes:

- multi-LLM provider factory with fallback and API key rotation
- local HTTP API bootstrap
- persistent local conversation memory fallback
- skill loading from `./.agents/skills`
- Telegram polling integration using the Bot API directly
- canonical architecture documents under `docs/architecture`

## Project structure

```text
apps/
  api/
  dashboard/
packages/
  lina-sdk/
  config/
  ui/
supabase/
  migrations/
  seeds/
docs/
  architecture/
  adr/
  prompts/
```

## Local setup

1. Copy `.env.example` to `.env`
2. Fill in provider keys and Telegram config if needed
3. Install dependencies:

```bash
npm install
```

4. Run typecheck:

```bash
npm run typecheck
```

5. Start the API:

```bash
npm run dev:api
```

## HTTP endpoints

- `GET /health`
- `GET /status`
- `GET /skills`
- `POST /orchestrator/run`

Example:

```bash
curl -sS http://localhost:3000/orchestrator/run \
  -H 'Content-Type: application/json' \
  -d '{"text":"resuma a arquitetura da LiNa"}'
```

## Telegram mode

If `TELEGRAM_BOT_TOKEN` is configured, LiNa starts polling automatically and handles text messages from allowed user IDs.

## Current gaps

- no real Supabase persistence yet
- no web dashboard implementation yet
- no audio/document ingestion pipeline yet
- no LLM-driven skill router yet
