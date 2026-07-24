# AskVisible — Model 1 Web SaaS

A responsive end-to-end product implementation based on the supplied AskVisible public product strategy. The app runs in a safe demo mode without credentials and provides adapter-ready configuration for the production services.

## Included

- Public marketing site and pricing for Free, Starter, Pro, and Agency
- Interactive free visibility checker
- SaaS dashboard with visibility, mentions, position, and trends
- Prompt tracking and add-prompt workflow
- Four-engine breakdown (ChatGPT, Gemini, Perplexity, Claude)
- Competitor intelligence and share-of-voice views
- AI fix generator experience with impact estimates
- Reports, usage quota, workspace settings, and scan feedback
- Responsive desktop/mobile navigation
- Live multi-provider orchestration endpoint at `POST /api/check`, returning a score and a
  confidence rating (data completeness + cross-provider agreement) alongside it
- Google Business Profile + reviews audit endpoint at `POST /api/audit` (Google Places API)
- Provider readiness endpoint at `GET /api/providers` (never exposes keys)
- SSRF-safe website discovery, transient retry/backoff, timeouts, partial failure handling, result caching, and basic rate limiting
- Supabase-compatible relational schema in `supabase/schema.sql`
- Environment contract for Supabase, Stripe, AI providers, Inngest, Resend, and PostHog

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`; the dashboard is at `http://localhost:3000/app`.

The checker requires at least one provider key in `.env.local`. It automatically uses every configured provider and returns partial results if one fails.

## Production integration order

1. Create a Supabase project and run `supabase/schema.sql`.
2. Copy `.env.example` to `.env.local` and supply credentials.
3. Replace demo session data with Supabase Auth and server-side queries.
4. Keep provider keys server-only. The public checker already runs live provider calls; move scheduled/high-volume scans to queued jobs.
5. Add Stripe Checkout and a signed webhook that updates `subscriptions`.
6. Schedule scans through Inngest with per-plan concurrency and quota checks.
7. Send scan alerts and weekly digests through Resend.

Never expose AI provider or service-role keys through `NEXT_PUBLIC_*` variables.

## Live checker configuration

Copy `.env.example` to `.env.local`, then supply one or more of:

```env
OPENAI_API_KEY=
GEMINI_API_KEY=
PERPLEXITY_API_KEY=
ANTHROPIC_API_KEY=
```

Model names are configurable using the corresponding `*_MODEL` variables. Restart the development server after changing environment variables. `GET /api/providers` reports which integrations are active without returning secrets.

The included in-memory cache and rate limiter are appropriate for local development and a single warm server instance. Before a high-volume public launch, replace them with shared Redis/Upstash state and move long-running scheduled scans into Inngest or Trigger.dev.

## Local audit configuration (Google Business Profile + reviews)

Copy `.env.example` to `.env.local`, then supply:

```env
GOOGLE_PLACES_API_KEY=
```

This uses the Google Places API (New) — a plain API-key lookup, not the full Google Business
Profile API, so no business-owner OAuth consent flow is required. It looks up any public
listing (yours or a competitor's) and returns rating, review count, up to 5 recent reviews,
website/hours presence, and photo count, feeding an audit score and fix suggestions through
`POST /api/audit`. `GET /api/providers` reports `localAudit.ready` once the key is set.
