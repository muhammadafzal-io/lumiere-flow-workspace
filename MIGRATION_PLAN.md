# Lumière Flow Workspace Migration Plan

## Goal

Migrate the working backend from `e:\lumiere-ai-system` into `e:\Office\lumiere-flow-workspace` and convert the workspace into a fully functional Next.js application with:

- backend API routes under `app/api`
- messaging abstraction for Telegram and future WhatsApp swap
- Airtable client sync and Google Sheets ops logging
- Google Calendar booking and retention cron endpoints
- chat widget hosted under `app/widget`
- Anthropic Claude LLM integration per PRD

## Current state

### `lumiere-ai-system`

- Next.js app with backend API routes
- Telegram webhook route
- cron retention API routes
- `lib/agent` with tool functions and OpenAI chat integration
- `lib/integrations` for Airtable, Google Calendar, Google Sheets, Slack
- `lib/messaging` providers and abstraction layer
- `scripts/seed-airtable.ts`
- `.env.example` with all required third-party keys

### `lumiere-flow-workspace`

- Vite + React frontend using `src/`
- Tailwind / Radix UI component library
- No existing Next.js `app/` or API route structure
- Existing TypeScript config with `@/*` path alias

## Migration approach

### Phase 1: Add Next.js scaffold

1. Install Next.js runtime dependencies: `next`, `react`, `react-dom`
2. Add `src/app/layout.tsx`, `src/app/page.tsx`, and `src/app/widget/page.tsx`
3. Configure `next.config.ts` and update `tsconfig.json`
4. Add scripts: `dev`, `build`, `start`, `lint`

### Phase 2: Copy backend API routes

1. Create `src/app/api/webhook/telegram/route.ts`
2. Create `src/app/api/cron/reminders/route.ts`
3. Create `src/app/api/cron/noshow/route.ts`
4. Create `src/app/api/cron/reactivation/route.ts`
5. Create `src/app/api/cron/birthday/route.ts`
6. Add `src/app/api/chat/route.ts` if the widget needs direct backend messaging

### Phase 3: Copy shared backend libraries

1. Copy `lib/agent/*`
2. Copy `lib/integrations/*`
3. Copy `lib/messaging/*`
4. Copy `lib/knowledge-base.ts`
5. Copy `lib/session.ts`
6. Copy `scripts/seed-airtable.ts`

### Phase 4: Implement messaging abstraction

1. Use `process.env.MESSAGING_PROVIDER`
2. Default provider: `telegram`
3. Keep `WhatsAppProvider` implementation as configuration-ready stub
4. Ensure webhook route only depends on `MessagingProvider` interface
5. Place provider config in `.env.local` and deployment env

### Phase 5: Adapt agent to PRD requirements

1. Swap OpenAI client to Anthropic Claude
2. Preserve tool-driven workflow for:
   - calendar availability
   - booking
   - Airtable lookup/upsert
   - logging operations
   - Slack escalation
3. Keep session history and RAG knowledge base support
4. Add guardrails so the agent does not hallucinate prices or services

### Phase 6: Separate UI migration path

1. Keep current Vite UI files in `src/` as reusable components
2. Build a minimal Next.js `src/app/page.tsx` landing/demo page first
3. Add `src/app/widget/page.tsx` chat widget that uses the same backend APIs
4. Later refactor any current `src/` component logic into Next page components

### Phase 7: Environment and config

1. Copy `.env.example` from `lumiere-ai-system`
2. Add required variables:
   - `ANTHROPIC_API_KEY`
   - `TELEGRAM_BOT_TOKEN`
   - `TELEGRAM_WEBHOOK_SECRET`
   - `GOOGLE_SERVICE_ACCOUNT_JSON`
   - `GOOGLE_CALENDAR_ID`
   - `GOOGLE_SHEETS_ID`
   - `GOOGLE_SHEETS_TAB`
   - `AIRTABLE_API_KEY`
   - `AIRTABLE_BASE_ID`
   - `AIRTABLE_CLIENTS_TABLE`
   - `SLACK_ESCALATION_WEBHOOK_URL`
   - `NEXT_PUBLIC_APP_URL`
   - `CRON_SECRET`
   - `MESSAGING_PROVIDER`
3. Add `TZ=America/Chicago`

### Phase 8: Testing and integration

1. Run local Next.js dev server
2. Test Telegram webhook with ngrok or Railway local tunnel
3. Test chat widget page against `/api/chat` or webhook flow
4. Validate:
   - booking creates Google Calendar events
   - Airtable client create/update works
   - Sheets ops log writes rows
   - Slack escalation posts
   - cron endpoints succeed with auth header

### Phase 9: Deployment readiness

1. Deploy backend to Railway / Render / Fly.io
2. Deploy widget/demo page to Vercel / Netlify if separate static hosting is desired
3. Verify public URL in `NEXT_PUBLIC_APP_URL`
4. Register Telegram webhook endpoint

## File mapping

| Source                                                 | Target                                   |
| ------------------------------------------------------ | ---------------------------------------- |
| `lumiere-ai-system/app/api/webhook/telegram/route.ts`  | `src/app/api/webhook/telegram/route.ts`  |
| `lumiere-ai-system/app/api/cron/reminders/route.ts`    | `src/app/api/cron/reminders/route.ts`    |
| `lumiere-ai-system/app/api/cron/noshow/route.ts`       | `src/app/api/cron/noshow/route.ts`       |
| `lumiere-ai-system/app/api/cron/reactivation/route.ts` | `src/app/api/cron/reactivation/route.ts` |
| `lumiere-ai-system/app/api/cron/birthday/route.ts`     | `src/app/api/cron/birthday/route.ts`     |
| `lumiere-ai-system/lib/agent/*`                        | `src/lib/agent/*`                        |
| `lumiere-ai-system/lib/integrations/*`                 | `src/lib/integrations/*`                 |
| `lumiere-ai-system/lib/messaging/*`                    | `src/lib/messaging/*`                    |
| `lumiere-ai-system/lib/knowledge-base.ts`              | `src/lib/knowledge-base.ts`              |
| `lumiere-ai-system/lib/session.ts`                     | `src/lib/session.ts`                     |
| `lumiere-ai-system/scripts/seed-airtable.ts`           | `scripts/seed-airtable.ts`               |

## Important notes

- The existing `lumiere-ai-system` agent is built around OpenAI; PRD requires Anthropic Claude. That must be updated during migration.
- The Telegram/WhatsApp abstraction must be demonstrable in code via `lib/messaging/index.ts` and env-driven provider selection.
- The migration should preserve existing UI components while moving the app into Next.js; first priority is backend + API routes.
- We should not lose the Vite frontend until the Next.js replacement is stable.

## Next action

1. Create `src/app/` plus Next.js scaffolding
2. Add backend route stubs and copy backend libs
3. Sync `package.json` and `tsconfig.json`
4. Keep the Vite UI intact until Next.js pages are ready

---

_This file is the working migration plan for turning `lumiere-flow-workspace` into the full Next.js implementation required by the PRD._
