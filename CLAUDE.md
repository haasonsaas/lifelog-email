# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Core Development
- `wrangler dev src/index.ts` - Start local development server
- `wrangler deploy` - Deploy to Cloudflare Workers
- `bun run src/test.ts` - Run tests

### Environment Setup
- `wrangler secret put LIMITLESS_API_KEY` - Set Limitless API key
- `wrangler secret put RESEND_API_KEY` - Set Resend email API key  
- `wrangler secret put OPENAI_API_KEY` - Set OpenAI API key
- `wrangler kv:namespace create TOKEN_KV` - Create KV storage namespace

### Testing Endpoints
- `curl http://localhost:8787/preview` - Preview digest for test date range
- `curl http://localhost:8787/test` - Send test digest email

## Architecture

### Core Components
- **Worker Entry Point** (`src/index.ts`): Handles scheduled events and HTTP requests with `/preview` and `/test` endpoints
- **Extractor System** (`src/extractors.ts`): Single `gpt_summary` extractor that processes lifelogs using OpenAI GPT-4o
- **Utility Functions** (`src/utils.ts`): Date handling, lifelog fetching, and markdown formatting
- **Type Definitions** (`src/types.ts`): TypeScript interfaces for Env, Lifelog, and LifelogContent

### Data Flow
1. Scheduled trigger (daily at 8AM Pacific) or HTTP request
2. Fetch lifelogs from Limitless API for yesterday's date range
3. Transform lifelog contents to markdown format
4. Process through `gpt_summary` extractor with OpenAI
5. Send formatted email via Resend API

### Configuration
- Environment variables set via `wrangler.toml` (vars) and secrets
- Cron schedule: `"0 16 * * *"` (8AM Pacific = 4PM UTC)
- Multi-environment support: dev, staging, production
- KV namespace required for token storage

### Email Generation
The `gpt_summary` extractor creates structured summaries with:
- Overview (2-3 sentences, outcomes-first)
- Action Items & Deadlines (table format with explicit due dates only)
- Key Decisions (bullet list)
- Discussion Log (topics with time ranges and duration)

Uses GPT-4o with specific prompts to prevent hallucination of due dates and maintain factual accuracy.