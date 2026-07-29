# AskVisibleAI — Session Notes

**Last updated:** 2026-07-29  
**Repo:** usmanalirehman12/askvisible-web  
**Deploy:** https://askvisible-web-mfu2.vercel.app  
**Local:** `C:\Users\zayns\OneDrive\Documents\websitefixer`  
**Stack:** Next.js 14.2 App Router · Edge Runtime · Supabase · Vercel

---

## What the Product Does

AskVisibleAI tracks how a brand appears in AI engine responses (ChatGPT, Gemini, Perplexity, Claude, DeepSeek, Google AI Overviews). It runs prompts that buyers use, scores how often the brand is mentioned and at what position, and then uses Claude to generate specific content fixes. The goal is to help brands "own the AI answer."

---

## Progress — Shipped Features

### Foundation (early sessions)
- Initial Next.js scaffold + Vercel deploy
- Landing page with pricing, FAQ, testimonials, engine trust logos
- Dark/light theme toggle (localStorage + `data-theme` on `<html>`)
- 6-engine scan: OpenAI, Gemini, Perplexity, Anthropic, DeepSeek, Google AI Overviews

### Authentication & Database
- Supabase auth: signup, login, logout pages
- `handle_new_user()` DB trigger: auto-creates profile + workspace + adds member row on first sign-in
- Full RLS policy set for all tables (profiles, workspaces, workspace_members, brands, competitors, prompts, scan_runs, answers, fixes)

### Scan Engine
- Async pipeline to beat Vercel Hobby 10s function limit — scan starts in background, frontend polls
- All 6 providers run concurrently per prompt with Edge Runtime
- Gemini: probe-based model auto-discovery via ListModels API (no hardcoded model name)
- AI Overviews: separate grounding endpoint discovery with probe cache
- DeepSeek: correct API endpoint wired
- Provider `max_tokens` cut 900→400 (~55% token cost saving)

### Scoring & Confidence
- **AI Visibility Score:** `mentionScore×0.6 + positionScore×0.25 + sentimentScore×0.15` → 0–100
- **Coverage label** (renamed from "confidence"): `Full scan` (≥70), `Partial scan` (≥40), `Limited data` (<40) — measures data quality, not brand strength
- **Score rating bands:** Strong (≥70) · Good (≥50) · Fair (≥30) · Weak (≥10) · Critical (<10) — shown with colored label next to score
- ScoreHero now shows rating label + plain-English context line ("Regularly mentioned…" vs "Rarely appears…")

### Dashboard Sections
| Section | Status |
|---|---|
| Overview → Summary | ✅ Real data (score, mentions, engine bars, fixes preview) |
| Overview → Traffic & Reach | ✅ Real GSC data (connect flow built) |
| Overview → Rankings | ✅ Real data (position dist, per-engine table, best/missed prompts) |
| Prompts | ✅ Lists real stored prompts; no edit UI yet |
| Competitors | ✅ Real data; no scan-against-competitors flow |
| AI Fixes → AI Visibility Fixes | ✅ Real Claude-generated fixes via server-side route |
| AI Fixes → SEO Audit | ✅ On-demand edge audit (12+ checks, no DOM parser needed) |
| Reports | ✅ Real scan history cards + full-screen ReportViewer + PDF export |
| Settings → Scan schedule | ✅ Weekly/monthly/off + day picker, saved to DB, Vercel Cron executes |
| Settings → Brand profile | ⚠️ Read-only display; save button wired but no mutation |
| Settings → Integrations | ✅ GSC connect/disconnect status |

### AI Fixes (FixEngine)
- Claude Haiku generates fixes post-scan
- `max_tokens` raised 1200→3000 to prevent JSON truncation
- `stop_reason` guard: only parse if `stop_reason === "end_turn"`
- Server-side `/api/fixes/list` route bypasses client-side RLS bug on `fixes` SELECT
- All error cases surface as toasts

### Reports Tab (shipped 2026-07-28)
- Phase 1: `useScanHistory` hook — real scan history cards (score, mentions, delta)
- Phase 2: Full-screen `ReportViewer` modal — dark navy header, engine bars, prompt table, fixes list
- Phase 3: PDF export via `window.print()` + `@media print` CSS
- First-scan edge case: "Baseline" amber badge, no delta arrow
- API: `GET /api/reports/[runId]` returns full scan data

### Scan Schedule (shipped prev session)
- Weekly/Monthly/Off frequency picker + day selector
- `PATCH /api/brands/settings` saves `scan_frequency` + `scan_day` to `brands` table
- Vercel Cron: daily at 06:00 UTC, `shouldScanToday()` filters by each brand's schedule

### SEO Audit (shipped 2026-07-29)
- `GET /api/seo-audit?domain=...` — Edge Runtime, fetches raw HTML, runs 12+ regex checks
- Categories: technical, meta, content, social, schema
- Checks: HTTPS, title (30–65 chars), meta description (100–160), H1 count, H2 subheadings, Open Graph (title+desc+image), Twitter Card, canonical URL, Schema.org JSON-LD, mobile viewport, robots meta, image alt texts, internal links
- Score: `passed / total × 100`
- UI: inside AI Fixes → SEO Audit sub-tab; "Audit domain.com" button triggers fetch + renders results grouped by category

### Google Search Console Integration (shipped 2026-07-29)
- OAuth 2.0 flow: `/api/gsc/auth` → Google → `/api/gsc/callback` stores tokens
- Token storage: `gsc_tokens` table (per workspace, primary key = `workspace_id`)
- Auto-matches GSC property to brand domain (tries `sc-domain:`, then `https://`, then `http://`, then first property)
- Token refresh: auto-refreshes if `expires_at` within 60s
- `/api/gsc/metrics`: fetches overview (impressions, clicks, CTR, avg position), top 25 queries, 28-day daily trend
- UI: connect CTA with TrendingUp icon, bar chart trend, top queries table, disconnect button
- Settings → Integrations: shows connected property URL + disconnect
- After OAuth redirect, toast shows "Google Search Console connected!" and navigates to Settings

---

## Architectural Decisions

### Edge Runtime everywhere
All API routes use `export const runtime = "edge"`. This:
- Beats Vercel Hobby's 10s Node timeout (edge has 30s)
- Prevents use of Node.js-only APIs (no `crypto`, no DOM parser, no `fs`)
- **Consequence:** SEO audit uses regex on raw HTML, not DOM — works for all key signals
- **Consequence:** `cookies()` from `next/headers` still works in Edge Runtime (Next.js 14+)

### Supabase RLS everywhere
Every table has RLS enabled. Access is gated through `is_workspace_member(workspace_id)`. The pattern:
- `profiles` + `workspace_members`: `user_id = auth.uid()`
- All other tables: join back to workspace via `is_workspace_member()`
- **Exception:** `fixes` SELECT had a missing policy — bypassed with server-side `/api/fixes/list` route (user client → service-role-equivalent auth through route handler)

### Async scan pipeline
Vercel Hobby functions timeout at 10s. Scans take 20–40s. Solution:
1. `POST /api/scan/start` creates a `scan_runs` row (status = `queued`), returns the `runId` immediately
2. Background: calls each provider × each prompt concurrently (all in one edge function)
3. Frontend polls every 6s for `status === "complete"`
4. Writes go to `scan_runs` + `answers` tables via Supabase

### Score vs Coverage separation
- **Score** = brand performance (are you mentioned? at what position? positive sentiment?)
- **Coverage** = data quality (how many providers responded? did they agree?)
- These are completely independent. "High coverage + Low score" is CORRECT: the scan reliably captured that the brand is rarely mentioned. This was previously confusing because both were shown as a single "confidence" label.

### Demo mode fallback
`demo = !supabaseConfigured()` — the entire dashboard falls back to static demo content when Supabase env vars are absent. This lets the app "run safely without credentials" (per README). All components accept a `demo` boolean prop and branch on it.

### GSC token storage
OAuth tokens stored in `gsc_tokens` (one row per workspace). Access via regular Supabase user client + RLS (workspace members can manage their workspace's token row). The raw `access_token` is never sent to the browser — all GSC API calls happen in Edge Runtime routes.

### Brand prompts generation
At brand-creation time, `generateBuyerPrompts()` is called with Claude to generate buyer-intent prompts. **Known weakness:** these prompts are generated with only the brand name (no description, no scraped site content) — they tend to be generic. The public checker path is better because it scrapes the domain first.

---

## Known Bugs & Technical Debt

### 1. Fixes RLS (workaround in place)
`fixes` table SELECT policy is either missing or broken on Supabase. Fixed via server-side `/api/fixes/list` route. The correct Supabase SQL to add permanently:
```sql
CREATE POLICY "Users can read fixes for their brands" ON fixes FOR SELECT
USING (brand_id IN (
  SELECT b.id FROM brands b
  INNER JOIN workspace_members wm ON b.workspace_id = wm.workspace_id
  WHERE wm.user_id = auth.uid()
));
```

### 2. Weak auto-generated prompts
`createBrand()` in `workspace.ts` calls `generateBuyerPrompts({ name, title: "", description: "" })` — blank context. The prompts are generic and don't reflect the actual brand's use case. Fix: scrape the brand's domain at creation time and pass the scraped content to Claude for prompt generation.

### 3. Brand profile save not wired
Settings → Brand profile has a "Save changes" button that is not wired to any mutation (no PATCH call implemented). It just reads the current values.

### 4. Prompts tab has no edit UI
Prompts tab lists the stored prompts but users cannot edit, add, or delete them from the dashboard.

### 5. `scan_frequency` and `scan_day` not in schema.sql
These columns were added to the `brands` table via a previous migration but are not reflected in `supabase/schema.sql`. If the schema is ever reset, those columns would be missing.

### 6. GSC migration must be run manually
The `gsc_tokens` table + RLS policy must be run in Supabase SQL Editor. The SQL is in `supabase/schema.sql` but not auto-applied.

---

## Remaining Tasks

### Immediate / Needs doing before GSC works in prod
- [ ] Run `gsc_tokens` migration SQL in Supabase (see schema.sql)
- [ ] Add `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` to Vercel env vars
- [ ] Register `https://askvisible-web-mfu2.vercel.app/api/gsc/callback` as authorized redirect URI in Google Cloud Console

### Short-term
- [ ] Fix Supabase RLS for `fixes` SELECT (remove the `/api/fixes/list` workaround)
- [ ] Wire brand profile Save changes button (`PATCH /api/brands/settings` or separate route)
- [ ] Add prompt edit UI (add/edit/delete prompts from Prompts tab)
- [ ] Scrape domain at brand-creation time to give Claude context for prompt generation

### Medium-term
- [ ] Competitor scan flow — scan competitors against the same prompts and compare
- [ ] Notifications tab in Settings (email alerts for score drops)
- [ ] Team members tab in Settings (invite by email, roles)
- [ ] Billing & usage tab (Stripe integration)
- [ ] Delete stale Vercel projects: `websitefixer`, `askvisible-web`, `askvisible-web-tghb`

---

## Infrastructure

| Item | Value |
|---|---|
| Active Vercel project | `askvisible-web-mfu2` |
| Production URL | https://askvisible-web-mfu2.vercel.app |
| Vercel Cron | Daily 06:00 UTC → `/api/cron/scan` |
| GSC redirect URI | `https://askvisible-web-mfu2.vercel.app/api/gsc/callback` |

### Required env vars (all in Vercel, never in code)
| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key |
| `OPENAI_API_KEY` | ChatGPT provider |
| `GEMINI_API_KEY` | Gemini provider (model auto-discovered at runtime) |
| `PERPLEXITY_API_KEY` | Perplexity provider |
| `ANTHROPIC_API_KEY` | Claude provider + fix generation |
| `DEEPSEEK_API_KEY` | DeepSeek provider |
| `GOOGLE_CLIENT_ID` | GSC OAuth — **must add** |
| `GOOGLE_CLIENT_SECRET` | GSC OAuth — **must add** |
| `CRON_SECRET` | Authenticates Vercel Cron calls to `/api/cron/scan` |

### Security rule (permanent)
API keys and secrets go ONLY into Vercel environment variables. Never in source code, never in chat, never in `NEXT_PUBLIC_*` variables (those are exposed to the browser).
