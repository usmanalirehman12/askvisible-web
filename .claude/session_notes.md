# AskVisibleAI — Session Notes

**Last updated:** 2026-08-02  
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
| Prompts | ✅ Real stored prompts + full add/edit/delete UI |
| Competitors | ✅ Real data; no scan-against-competitors flow |
| AI Fixes → AI Visibility Fixes | ✅ Real Claude-generated fixes via server-side route |
| AI Fixes → SEO Audit | ✅ On-demand edge audit (12+ checks, no DOM parser needed) |
| Reports | ✅ Real scan history cards + full-screen ReportViewer + PDF export |
| Settings → Scan schedule | ✅ Weekly/monthly/off + day picker, saved to DB, Vercel Cron executes |
| Settings → Brand profile | ✅ Editable name/domain/description, Save persists via `PATCH /api/brands/settings` |
| Settings → Integrations | ✅ GSC connect/disconnect status |

### AI Fixes (FixEngine)
- Claude Haiku generates fixes post-scan
- `max_tokens` raised 1200→3000 to prevent JSON truncation
- `stop_reason` guard: only parse if `stop_reason === "end_turn"`
- Fixes are read client-side via `getFixes()` (`lib/data/fixes.ts`); the old `/api/fixes/list` RLS workaround route is gone
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

### Brand switcher fix (shipped 2026-07-31)
User reported: creating a new client didn't let you switch to it, and the "Your clients" modal showed a dark-navy background where it should be white/light, with a low-contrast close (X) button.
- **Root cause 1 (can't switch):** `activeBrand` was hardcoded to `ctx?.brands[0]` everywhere — no selection state existed at all, and the `<li>` rows in the client list had no `onClick`.
- **Root cause 2 (wrong colors):** the "Your clients" modal is defined inside `<BrandSwitcher>`, which is rendered as a JSX child of `<aside className="sidebar">`. `.sidebar` intentionally pins `--soft`/`--bg`/`--line` etc. to dark values "regardless of theme" for its own styling (see `app/globals.css` `.sidebar` rule) — but CSS custom properties inherit through the DOM tree, not visual position, so the modal (despite being a `position:fixed` centered overlay) inherited those dark tokens too. `.client-list li` and `.modal-x` both use `background:var(--soft)`, so they rendered dark navy instead of the page's real light-theme value.
- **Fix:** added `activeBrandId` state in `AppPage` (persisted to `localStorage` as `av-active-brand`), made `<li>` rows in `BrandSwitcher`'s client list clickable with an active-state highlight (blue, matching the existing nav active-state pattern) and a checkmark, and wrapped the modal in `createPortal(..., document.body)` so it's no longer a DOM descendant of `.sidebar` and picks up the correct page-level theme tokens. Newly-created brands now auto-select as active.
- Verified the CSS-inheritance root cause with an isolated static repro (same markup/CSS, nested-in-sidebar vs. portaled-to-body) before deploying; couldn't verify the live authenticated UI directly (no login access). **Confirmed working by manual click-through 2026-07-31.**
- **Was briefly reverted in production.** This fix was `vercel --prod` deployed but not committed, so a later unrelated `git push` rebuilt production without it (see "Deployment comes from git, not the CLI" below). Committed in `d828a06` and restored. Caught by diffing the deployed stylesheet against the local file — `.client-list li.active` was simply absent from the live CSS.

### Test suite bootstrapped (2026-07-31)
First tests in the project. `vitest` (dev dependency), config in `vitest.config.mts` (Node environment, `@/*` alias mirroring `tsconfig.json`), run with `npm test`.

- `lib/ai/scrape-edge.test.ts` — 13 tests. Covers the SSRF blocklist (`isObviouslyPrivateHost`: loopback, RFC1918, cloud-metadata `169.254.169.254`, and the `172.16.0.0/12` boundary in both directions) plus `scrapeHomepageMeta` behavior (private hosts short-circuit without ever calling `fetch`, non-OK responses, non-HTML content types, network errors, https scheme defaulting). `fetch` is stubbed — no live network in tests.
- `lib/ai/html-meta.test.ts` — 15 tests. Covers `decodeHtml`, `metaTag` (name vs property, case-insensitivity, entity decoding, missing tags), `pageTitle`.
- `isObviouslyPrivateHost` was exported from `scrape-edge.ts` purely to make it directly testable; no behavior change.

**Behavior the tests pinned down:** `scrapeHomepageMeta` is asymmetric about og-tags. Title prefers `og:title` and falls back to `<title>`; description prefers plain `<meta name="description">` and falls back to `og:description`. That is pre-existing behavior, not a deliberate design call — the tests document it rather than change it. Worth revisiting if og-tags should consistently win.

Extended 2026-07-31 with two more files:
- `lib/ai/scoring.test.ts` — the `score()` weighting (60/25/15), position credit decaying from #1 to #5 and clamping to zero at #6+, the 0.4 partial credit for a mention with no position, sentiment ordering (positive > neutral > negative), and the 0–100 bounds.
- `lib/data/stats.test.ts` — `summarizeScan`: mention counts against total, `avgPosition` rounded to one decimal and null when nothing is ranked, `confidence ?? 0`, and the empty-scan case.

45/45 passing, enforced in CI (`.github/workflows/ci.yml`) on every push to `master` and every PR.

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
- **Former exception (fixed 2026-07-29):** `fixes` SELECT was missing a policy. It was temporarily bypassed with a server-side `/api/fixes/list` route; the policy now exists in Supabase and that route has been deleted.

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
At brand-creation time, `app/api/brands/route.ts` scrapes the homepage (`scrapeHomepageMeta()` in `lib/ai/scrape-edge.ts`) and feeds the title/description into Claude's prompt-generation instruction, with `generateBuyerPrompts()` as the template fallback if the Claude call fails. Both paths get the scraped context, so brand-creation prompts are now on par with the public checker path.

**Edge vs Node SSRF trade-off:** this route is Edge Runtime, so it can't use `safePublicUrl()` (`lib/security/url.ts`) — that does DNS-based private-IP resolution via Node-only `node:dns`/`node:net`. `scrape-edge.ts` instead does a string-level blocklist (localhost, `.local`, loopback, RFC1918, `169.254.x`, `172.16–31.x`). This does NOT catch DNS rebinding — a hostname that *resolves* to a private IP gets through. Accepted because the route only extracts meta text server-side, never returns page content to the caller, and the caller is scraping their own brand's domain. Unit-tested in `lib/ai/scrape-edge.test.ts`.

### Deployment comes from git, not the CLI (learned the hard way 2026-07-31)

The Vercel project is connected to `usmanalirehman12/askvisible-web` via git integration. **Any push to `master` triggers a production build from the repo and re-aliases `askvisible-web-mfu2.vercel.app` to it.**

`npx vercel --prod` deploys the *local working directory*, uncommitted changes included. That is convenient for a fast preview of work-in-progress, but it creates a trap: production is then running code that does not exist in git. The next `git push` — even a totally unrelated one — rebuilds production from the repo and silently reverts everything that was only ever CLI-deployed.

This actually happened. The 2026-07-31 brand switcher fix, domain scraping, brand-profile save, and RLS cleanup were all `vercel --prod` deployed from a dirty tree and never committed. Pushing an unrelated test-infrastructure commit rebuilt production without any of them. The build passed clean and the site loaded fine, because the older tree is internally consistent — the regression was invisible to a build check and only showed up by diffing the deployed CSS against the local file.

**Rules going forward:**
- Commit before deploying anything meant to stay in production.
- Treat `vercel --prod` from a dirty tree as a preview, never as a ship.
- After any push, if production is expected to change, verify the *artifact*, not just the build status. Checking "did the build go green" does not tell you whether the build contained the right code. Fetch the deployed asset and grep for a string unique to the change.
- `git status` before `git push` is a real check, not a formality — uncommitted app code sitting next to a push is the warning sign.

---

## Known Bugs & Technical Debt

### 1. ~~Fixes RLS~~ — RESOLVED 2026-07-29
Added the missing SELECT policy in Supabase, switched `useFixes`/`Fixes` in `app/app/page.tsx` to call `getFixes()` (`lib/data/fixes.ts`) directly via the browser Supabase client, and deleted the `/api/fixes/list` workaround route.

### 2. ~~Weak auto-generated prompts~~ — RESOLVED 2026-07-29
`app/api/brands/route.ts` now scrapes the domain's homepage (`lib/ai/scrape-edge.ts`) and passes title/description to Claude before generating prompts. (Note: this was already calling Claude with name+domain, not the blank-template path this note originally described — the blank-context template was only ever the fallback for when the Claude call fails. That fallback now also gets scraped context.)

### 3. ~~Brand profile save not wired~~ — RESOLVED 2026-07-29
`PATCH /api/brands/settings` now accepts `name`/`domain`/`description`; Settings → Brand profile Save button is fully wired.

### 4. ~~Prompts tab has no edit UI~~ — was already built, this note was stale
Add/edit/delete all work via `/api/prompts`; nothing needed fixing.

### 5. ~~`scan_frequency` and `scan_day` not in schema.sql~~ — RESOLVED 2026-08-01
Both columns are now declared on `public.brands` with defaults matching the code's fallbacks (`'weekly'`, `1`) and check constraints. A schema rebuild from source no longer silently kills the scan scheduler.

Two things came out of this that are worth keeping:

- **`scan_day` had no validation anywhere.** `PATCH /api/brands/settings` validated the frequency but accepted any number for the day, so `scan_day: 999` stored cleanly and the cron then never matched it — the brand's scans just stopped, with no error in any log. The rule now lives in `lib/data/scan-schedule.ts` (0–6 weekly, 1–31 monthly, 0–31 when the frequency isn't part of a partial update) and returns a 400. `lib/data/types.ts` sources its frequency union from the same module so the type can't drift from the validator.
- **The DB check is deliberately looser than the app check.** One column serves both modes, so Postgres can only enforce `between 0 and 31` without a conditional constraint that would reject existing rows. The per-frequency rule is app-level on purpose — a constraint violation surfaces as a 500, a validator returns a clean 400.

**Optional, to make the live database match `schema.sql` exactly.** Production already has these columns so nothing here is required for the app to keep working — this only matters if you want a future rebuild to be byte-identical to what's live. Safe to re-run:

```sql
alter table public.brands alter column scan_frequency set default 'weekly';
alter table public.brands alter column scan_day set default 1;
update public.brands set scan_frequency = 'weekly' where scan_frequency is null;
update public.brands set scan_day = 1 where scan_day is null;
alter table public.brands alter column scan_frequency set not null;
alter table public.brands alter column scan_day set not null;
alter table public.brands drop constraint if exists brands_scan_frequency_check;
alter table public.brands add constraint brands_scan_frequency_check check (scan_frequency in ('weekly','monthly','off'));
alter table public.brands drop constraint if exists brands_scan_day_check;
alter table public.brands add constraint brands_scan_day_check check (scan_day between 0 and 31);
```

Run the two `update` lines before the `set not null` lines or they'll fail on existing null rows. If the last `add constraint` errors, you have rows with an out-of-range `scan_day` — find them with `select id, name, scan_day from public.brands where scan_day not between 0 and 31;` and fix before retrying.

### 6. GSC migration must be run manually
The `gsc_tokens` table + RLS policy must be run in Supabase SQL Editor. The SQL is in `supabase/schema.sql` but not auto-applied.

### 7. AI Overviews engine failing with a misleading "high demand" 503 — FIXED 2026-08-02
Reported by the user after a scan: `ai_overviews` skipped on two consecutive runs, both with Gemini's `"This model is currently experiencing high demand"` 503. Confirmed via `vercel logs askvisible-web-mfu2.vercel.app` — not a one-off, same reason both times, 11 minutes apart.

**Root cause: two stacked bugs in `geminiGroundingEndpoint()` (`lib/ai/providers.ts`).**
- The grounding-tool probe order tried the pre-Gemini-2.0 field name `googleSearchRetrieval` before the current one, `google_search` (confirmed against `ai.google.dev`'s live REST example, which uses `google_search` with model `gemini-3.6-flash`). Not fatal by itself — the loop still reaches the correct format eventually — but it doubles the probe count against every candidate model.
- The real bug: the function's last-resort fallback (used when every live-model probe fails) was hardcoded to `gemini-1.5-flash` — a model old enough to plausibly be retired by Google. A request to a retired model ID is exactly the case where Gemini's API is known to return a *misleading* 503 "high demand" instead of a clear 404 (same failure shape documented for the plain `gemini` engine in an earlier project). The plain `gemini` engine never hit this because its own discovery (`geminiEndpoint()`) succeeds without needing the extra `tools` param, so it never falls through to its hardcoded default; grounding's stricter probe (model **and** tool format) apparently was.

**Fix:** swapped the probe order to try `google_search` first, updated both hardcoded fallback model strings (`gemini-1.5-flash` → `gemini-3.6-flash`, matching Google's own current docs) in the `gemini` and `ai_overviews` provider setup, and fixed the ultimate grounding fallback to use `google_search` instead of the deprecated tool name.

**Not independently unit-tested** — `lib/ai/providers.ts` makes live HTTP calls and has no test file; verifying needs a real `GEMINI_API_KEY` and `GOOGLE_AI_OVERVIEWS=true`, which only exist in Vercel prod. Verify by running a scan and checking the AI Overviews engine returns real data instead of a skip. If it still fails, re-check `vercel logs` for the new failure reason — a different message would rule this fix out and point elsewhere (e.g. grounding not enabled for the API key's tier).

### 8. ChatGPT silently recording blank answers as "not mentioned" — FIXED 2026-08-02
User noticed ChatGPT at 0% and, per the new step-by-step-instructions convention, was walked through a Supabase SQL Editor query against `public.answers` rather than pointed at a UI section — good thing, since there's no UI for raw answer text yet (see below). The query showed the actual bug: 2 of 5 ChatGPT rows for the latest run had `raw_answer = ''` (empty string) and `brand_mentioned = false`, most tellingly on "alternatives to The Greeting Shelf" — a prompt that contains the brand's own name, which every *other* engine matched correctly. An empty answer isn't a real "not mentioned" result; it's missing data that happened to get stored as if it were one.

**Root cause:** OpenAI's Responses API, when a reasoning-capable model exhausts `max_output_tokens` on internal reasoning before emitting any visible text, returns a normal `200 OK` with `status: "incomplete"`, `incomplete_details.reason: "max_output_tokens"`, and an empty `output_text` — not an HTTP error. [`lib/ai/providers.ts`](../lib/ai/providers.ts)'s `postJson` only distinguishes success from failure by HTTP status, so this came back as a "successful" empty string, got scored as "brand not mentioned," and was inserted into `answers` like any other real result — no error, no skip, nothing in the logs. Confirmed against OpenAI's own developer community threads describing this exact failure shape for GPT-5-class reasoning models on tight token budgets (this app deliberately runs providers at 400 max output tokens to control per-scan cost).

**Fix:** bumped OpenAI's `max_output_tokens` 400 → 800 (more headroom before reasoning can eat the whole budget), and added an explicit check: if `output_text` comes back empty *and* `status === "incomplete"`, throw instead of returning an empty answer — so it now surfaces as a real provider failure (shows in the skip banner and `vercel logs`, like the Anthropic/Gemini issues) instead of silently poisoning the mention data. Deliberately didn't touch the model's `reasoning` effort parameter — can't confirm without knowing the live `OPENAI_MODEL` value (a Vercel env var whose value is never read/handled here) whether the currently configured model accepts that field, and getting it wrong risks breaking calls that currently work.

**Not independently unit-tested**, same reason as Known Bug #7 — live HTTP call, no test file. Verify with another scan: OpenAI should either return real text for every prompt, or show up in the skip banner/logs if it's still hitting the token ceiling (in which case 800 needs raising further, or the fix needs the `reasoning: {effort: "minimal"}` approach after confirming the configured model supports it).

**Related gap, not fixed here:** there is currently no UI anywhere in the app to view an answer's raw text — not in Prompts, not in Reports. The only way to see what an engine actually said is a direct Supabase query. Worth a future "expand row" or dedicated Answers view if this kind of debugging keeps coming up.

### 9. One-off provider timeouts — hardened, not really a "bug" (2026-08-02)
A single Gemini call hit its 12s timeout in an otherwise-clean scan (39/40 calls succeeded). Not a repeat of #7/#8 — no config error, just an isolated slow response. But it surfaced that `gemini`, `openai`, `anthropic`, and `perplexity` all called `postJson` with the default `attempts=1` — one slow response and the call just fails, no retry. `deepseek` was already the one exception, requesting 2 attempts. `postJson`'s retry (backoff + jitter) already existed; it just wasn't being asked for. Matched `deepseek`'s pattern for the other four. Worst case for 2 attempts at the 12s default timeout is ~25s, under the Edge function's 30s ceiling, same margin `deepseek` already runs with in production.

---

## Working conventions (standing instructions)

- **Ship a progress chart when work completes.** Every time a piece of work finishes, update the chart in [`PLAN.md`](../PLAN.md) and show it. It's a deliverable, not a footnote — progress should be readable at a glance without re-reading this file.
- **`PLAN.md` and this file are a pair.** `PLAN.md` holds the roadmap, the ranked next-up list and the chart. This file holds the detail: why a thing was built that way, what broke, what to watch for. Finishing an item means ticking it there and explaining it here.
- **Don't ask for approval on recommended work.** Proceed on obvious calls, state the assumption. Save questions for genuinely difficult or risky decisions.
- **Verify the artifact, not the build.** Green build ≠ shipped change. Fetch the deployed asset and grep for something unique to the change.
- **Production deploys come from `git push`.** Never `vercel --prod` from a dirty tree — see the 2026-07-31 revert below.
- **Give step-by-step instructions for anything the user has to do manually.** Numbered, concrete steps (exact menu names, exact SQL, exact button labels) — not a vague pointer like "check the Answers tab." Learned 2026-08-02 after pointing at an Answers section that doesn't exist in the shipped UI; a numbered walkthrough would have surfaced that immediately instead of sending the user hunting.

---

## Remaining Tasks

### Immediate / Needs doing before GSC works in prod
- [x] Run `gsc_tokens` migration SQL in Supabase (see schema.sql)
- [x] Add `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` to Vercel env vars — first save didn't take effect until a fresh `vercel --prod` redeploy picked it up (env vars are snapshotted at build start, not read live)
- [x] Register `https://askvisible-web-mfu2.vercel.app/api/gsc/callback` as authorized redirect URI in Google Cloud Console
- [x] Add `rehman.usman@gmail.com` as a test user under Google Auth Platform → Audience (OAuth consent screen was in Testing status, blocking sign-in with "Access blocked: has not completed verification" until added)

**GSC integration confirmed working end-to-end in production as of 2026-07-29.** Note: `webmasters.readonly` is a restricted scope — only test users added under Audience can connect until the app goes through Google's verification process (privacy policy, domain proof, demo video). Fine for now since only the founder is testing.

### Short-term
- [x] Fix Supabase RLS for `fixes` SELECT (remove the `/api/fixes/list` workaround) — added the missing SELECT policy in Supabase, then switched `useFixes` and the `Fixes` panel in `app/app/page.tsx` to call `getFixes()` from `lib/data/fixes.ts` directly via the browser Supabase client (same dynamic-import pattern as `getPrompts`/`getCompetitors`). Deleted `app/api/fixes/list/route.ts` — confirmed 404 in prod, `/api/fixes` (POST, fix generation) and `/api/fixes/status` (PATCH) are untouched.
- [x] Wire brand profile Save changes button — extended `PATCH /api/brands/settings` to accept `name`/`domain`/`description` (with required-field validation), made the Brand profile inputs in `app/app/page.tsx` controlled instead of `defaultValue`+`readOnly`, and added an `onBrandUpdated` callback so `AppPage`'s `ctx.brands` state updates immediately after save (no refetch needed). Deployed; needs a manual click-through to confirm (see below).
- [x] Add prompt edit UI (add/edit/delete prompts from Prompts tab) — turned out this was already fully built (`Prompts` component in `app/app/page.tsx`, wired to the existing `/api/prompts` GET/POST/PATCH/DELETE routes). This checklist item and Known Bug #4 were stale; no new work needed here.
- [x] Scrape domain at brand-creation time to give Claude context for prompt generation — `app/api/brands/route.ts` now calls `scrapeHomepageMeta()` (new: `lib/ai/scrape-edge.ts`) before generating prompts, and feeds the scraped title/description into both the Claude instruction and the template fallback. This route stays on Edge runtime (can't use the Node-only `safePublicUrl` SSRF check from `lib/security/url.ts`), so the new scraper does its own lightweight IP-literal/localhost blocklist instead of a DNS-based check — acceptable since it only extracts meta text server-side and never returns page content to the caller. Shared HTML-parsing helpers (`decodeHtml`/`metaTag`/`pageTitle`) were split into `lib/ai/html-meta.ts` so `lib/ai/website.ts` (Node-only `discoverBrand`, used by the public checker) and the new Edge scraper both use the same parsing logic. Tested standalone against a real domain (stripe.com) and against SSRF probes (`169.254.169.254`, `localhost`) — verified correctly before deploy.

### Short-term (open)
- [x] **Rate-limit migration applied and verified in production (2026-08-01).** `public.rate_limits` + `consume_rate_limit()` are live in Supabase. Verified two ways:
  - In SQL, with limit 2: calls 1–2 `allowed=true`, calls 3–4 `allowed=false`. The counter increments.
  - Against production, with limit 5: calls 1–5 → `400` (limiter passed, body validation rejected), call 6 → `429 Retry-After: 3596`, call 7 → `429 Retry-After: 3595`. The window counts down.
  - **Verification trick worth reusing:** the limiter runs *before* body validation in `/api/check`, so `POST {}` exercises the whole rate-limit path and stops at `400` without calling a single AI provider. You can prove the limiter end-to-end on production for free. Never `POST` a real URL just to test the limit — that spends provider credits per call.
  - Two gotchas if this is ever rebuilt: PostgREST caches the schema, so a fresh function needs `notify pgrst, 'reload schema';` or the RPC 404s despite existing; and the Supabase SQL editor shows only the last row-returning statement, which makes a multi-call test ambiguous — accumulate verdicts into a temp table and select from it at the end.
- [x] Manually verify the brand switcher fix in the live authenticated app — confirmed 2026-07-31, brand switching works
- [x] **CI is live.** `.github/workflows/ci.yml` runs `npx tsc --noEmit` + `npm test` on pushes to `master` and on all PRs. Green on its first run (`3def649`).
  - **Gotcha for next time:** the first push was rejected with *"refusing to allow a Personal Access Token to create or update workflow `.github/workflows/ci.yml` without `workflow` scope."* GitHub blocks any PAT from touching `.github/workflows/**` unless the token has the `workflow` scope specifically — `repo` alone is not enough. Fixed by regenerating the PAT with `repo` + `workflow` and clearing the cached credential from Windows Credential Manager. SSH auth sidesteps this entirely (keys have no scopes), if the token expiry ever gets annoying.
- [x] Widen test coverage beyond `lib/ai/` — added `lib/ai/scoring.test.ts` (the real scoring fn lives in `lib/ai/scoring.ts`, not `lib/data/scoring.ts` as this note previously claimed) and `lib/data/stats.test.ts`. 45 tests total.
- [x] Gitignore Office lock files — added `~$*` to `.gitignore`
- [x] **Dead-code cleanup + CI guard (2026-08-01).** Removed the naming-research artifacts (`DOMAIN-AVAILABILITY.md`, `outputs/`, `domain-check.mjs`, `domain-check.ps1` — nothing in the app ever imported them), `components/checker.tsx` (superseded by `HomeChecker.tsx`, which uses a completely different `checker-*` class family), the dead `createBrand`/`createPrompts` exports, and 12 orphaned rule groups in `globals.css`. `knip` now runs in CI as `npm run deadcode`; it found all of it in ~20 seconds where `tsc` and the tests saw nothing. Note `tsconfig.json` has `strict: true` but **not** `noUnusedLocals`, so a typecheck will never catch an orphaned import — knip is the only thing watching.
  - **CSS deletions need the reverse check.** A scan for declared-but-unreferenced classes cannot tell you whether JSX references a rule you just deleted — deleting the declaration silently removes it from that report. Verify both directions.
- [x] **Postgres-backed rate limiting (2026-08-01).** `/api/check` and `/api/audit` are unauthenticated and spend real money per call. Their limiter was a module-level `Map`, so on Vercel each serverless instance had its own counter: "5 per hour" was really "5 per instance", and instances scale out under load, so the ceiling rose exactly when it should have held. Counts now live in `public.rate_limits`, incremented by `consume_rate_limit()` in a single upsert (no read-then-write race). RLS on with zero policies + `revoke execute` from `anon`/`authenticated`, because a `security definer` function left open lets anyone with the anon key burn a victim's window by guessing their key. The helper **fails closed** — a DB outage degrading the free checker beats a DB outage removing the only spend limit on an open endpoint. `429` means the caller really is over; `503` means we couldn't check, so a blocked user isn't told they were hammering the endpoint. Response caching deliberately stays per-instance: a cache miss costs latency, not money.
- [x] Keyboard accessibility for the brand switcher list — rows are now real `<button>`s inside each `<li>` (not `<li onClick>`), so they're tab-reachable and Enter/Space activatable natively with no ARIA. Added a `:focus-visible` ring and `aria-current` on the active brand. **Visually verified 2026-08-01** — see below.

#### How the modal was visually verified without auth (2026-08-01)
The client switcher is auth-gated and the sandbox can't screenshot, so instead: copied the real `app/globals.css` verbatim into a scratch dir, rebuilt the exact modal DOM from `app/app/page.tsx:147-155` around it, served it over `http://localhost:4321` (a static `python -m http.server` entry in `.claude/launch.json`), and read computed styles + geometry out of the live page. No rules were hand-transcribed, so the measurements are of the shipped CSS.

Results — correct in both themes:
- Rows: 384px wide, 34px tall, 8px gap, no horizontal overflow; a 39-char name + 37-char domain wraps to 50px instead of overflowing.
- Light: modal `#FFF`, inactive row `#F8FAFC` on `#0F172A` ink, active row `#E0F2FE` with `#0EA5E9` border/ink.
- Dark: modal `#131B2E`, inactive row `#1A2440` on `#F1F5F9` ink, active row `rgba(14,165,233,.15)` with `#0EA5E9` border/ink.
- Portal fix holds: with `.sidebar` pinned to `--soft:#1A2440`, the modal still resolves its own `--soft` from `:root` (`#F8FAFC` in light). This is the regression the `createPortal` fix exists to prevent.
- Keyboard: tab order is close-X → row 1 → row 2 → row 3 → name → website → submit. All rows are natively focusable, `:focus-visible` matches, `aria-current="true"` only on the active row, and no `role` is set on any `<li>`.

Gotcha for future runs: the in-app browser reports *stale* computed colors while `.client-list button`'s `transition:.15s` is in flight — it froze at the pre-toggle value for 3+ seconds and looked like a theming bug. Suppress with an injected `*{transition:none!important}`, or measure a freshly-created element. It's a quirk of that browser's computed-style serialization, not an app defect; the real modal mounts fresh in the current theme anyway. Same caveat for `outline` — it serializes the UA default over `:focus-visible`, so trust `el.matches(':focus-visible')` rather than the reported outline color.

#### Running the dev preview from another working directory (fixed 2026-08-01)
`preview_start` rejects any `launch.json` entry with an absolute `cwd` ("cwd must be a relative path within the project root") — and it validates *every* entry in the file, not just the one being started, so one bad entry blocks all of them. When Claude is running from a directory other than this repo (e.g. `D:\claude skill`), don't use `cwd`; point npm at the repo instead:

```json
{ "runtimeExecutable": "npm",
  "runtimeArgs": ["--prefix", "C:\\Users\\zayns\\OneDrive\\Documents\\websitefixer", "run", "dev"],
  "port": 3000 }
```

`npm --prefix` runs the script with the package folder as its working directory, so Next picks up `.env.local` and the app config normally. Verified: `✓ Ready`, `Environments: .env.local`, `GET / 200`, landing page renders, console clean. Running Claude from inside the repo makes all of this moot — `.claude/launch.json` here already has a plain `npm run dev` entry that works as-is.

### Medium-term
> Ranked, with sizes and reasoning, in [`PLAN.md`](../PLAN.md#whats-next). Everything still open is blocked on a decision or an account only the founder can supply.

- [x] **Competitor share of voice (2026-08-01)** — see below.
- [x] **Score-drop email alerts (2026-08-01)** — see below.
- [x] **Team members (2026-08-01)** — see below. Migration run in Supabase 2026-08-02, tab is live.
- [x] **Multi-workspace switching (2026-08-01)** — see below.
- [x] **Delete stale Vercel projects (2026-08-02, you)** — `websitefixer`, `askvisible-web`, `askvisible-web-tghb` deleted. Only `askvisible-web-mfu2` remains.
- [ ] Billing & usage tab (Stripe integration) — `workspaces.plan` and `usage_months` exist. Blocked on a Stripe account, real price points, and the over-quota policy (block / warn / bill overage), which shapes the schema.
- [ ] Resend setup (domain verify, API key, env vars in Vercel) — score-drop alerts are coded and deployed but `emailConfigured()` is false until this is done.

#### Team members (shipped 2026-08-01)

**RUN THIS MIGRATION** — the app expects these and the Team tab errors without them. Safe to re-run:

```sql
alter table public.workspace_members add column if not exists joined_at timestamptz not null default now();

create table if not exists public.invitations (
  id uuid primary key default uuid_generate_v4(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  email text not null,
  role text not null default 'member' check (role in ('admin','member','viewer')),
  token text not null unique,
  invited_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days',
  accepted_at timestamptz,
  constraint invitations_email_lower check (email = lower(email))
);
create unique index if not exists invitations_pending_unique on public.invitations (workspace_id, email) where accepted_at is null;
create index if not exists invitations_token_idx on public.invitations (token);
alter table public.invitations enable row level security;

drop policy if exists "members read teammates" on public.workspace_members;
create policy "members read teammates" on public.workspace_members for select using (public.is_workspace_member(workspace_id));
```

**The team list was invisible to its own members.** `workspace_members` only had a "read own membership rows" policy, so nobody could see teammates. The new policy uses `is_workspace_member()`, which is `security definer` and therefore bypasses RLS — that's what stops a policy on `workspace_members` recursing into `workspace_members`.

**Invitations are service-role only.** RLS on, zero policies. The token is the only credential a link-clicker presents, so it's 64 hex chars from two `randomUUID()`s and expires in 7 days. Every read goes through `/api/team`, which checks the caller's role first using their *session* client — the service role is only reached after that gate.

**Permission rules are pure functions** in `lib/data/team.ts`, tested rather than buried in a route handler:
- The owner can never be removed, by anyone including themselves. `workspaces.owner_id` points at them, so removal would orphan the workspace and surface as an opaque FK error.
- Anyone can remove themselves; only owner/admin can remove others.
- Only the owner can remove an admin — admin-removes-admin is a privilege fight with no tiebreaker.
- `owner` isn't grantable at all. There's exactly one, created by `handle_new_user`.

**The accept flow had a gap that would have made invites look broken.** `getWorkspaceContext` picks a *single* membership, so an invited user would have landed in the empty workspace their own signup created, seen nothing, and concluded the invite failed. Membership selection now orders by `joined_at desc` so the just-accepted workspace wins. That's a stopgap — see the next section.

`/invite/[token]` handles unknown token, already used, expired, signed out (routes through `/signup?invite=…` and back), and **signed in as a different address than the invite names** — that last one would otherwise silently add the wrong person. Membership is inserted *before* the invite is marked accepted, so a failure leaves it reusable rather than burning the token.

The invite URL is returned from the API even when the email send fails. An invitation the inviter can't see is worse than one they paste into Slack themselves.

#### Multi-workspace switching (shipped 2026-08-01)
`getWorkspaceContext(supabase, preferredId?)` now returns every workspace the user belongs to with their role in each — the same round trip as fetching one, and the switcher needs the names. The sidebar switcher renders **only when there are 2+ workspaces**, so the ordinary single-workspace user sees no change.

- **The preference is user-controlled and that's fine.** It comes from `localStorage`, and is only honoured when it matches a row that already came back through RLS. A forged id matches nothing and falls through to the default. `pickWorkspaceId` is pure with the fallback order pinned by tests — the check is for correctness, not security.
- **Switching clears the remembered brand.** It belongs to the old workspace; keeping it would open the new workspace on a brand that isn't in it.
- **The resolved id is written back, not the requested one.** A stale id — from being removed from a team — self-corrects on load instead of being retried every time.
- **`/api/team` takes an explicit `workspaceId`.** Its default is the newest membership, which after a switch is the *wrong team*. Silently managing the wrong team is the sort of bug nobody notices until they've removed the wrong person.

**CSS specificity trap, caught by rendering rather than reading.** `.sidebar button{border:0}` is (0,1,1) and out-specifies a bare `.workspace-switch` (0,1,0), so the border silently did not exist — computed `border-style: none`, width `0`. What made it look plausible was the reported `border-color` matching the text colour exactly, because with no border the value falls back to inherited `currentColor`. Scoping the rule as `.sidebar .workspace-switch` fixes it. **Any new sidebar control needs that scope**, or `.sidebar button` will quietly strip its border.

#### Score-drop email alerts (shipped 2026-08-01)
Cron sends the workspace owner an email when a brand's score falls 10+ points against the previous scan. **Not live until `RESEND_API_KEY` and `ALERT_FROM_EMAIL` are set in Vercel** — `emailConfigured()` is checked first, so until then the cron skips alerting and nothing errors.

**Why Resend over the domain's own Fasthosts SMTP.** Volume wasn't the deciding factor: Fasthosts allows 1,000/day (50 per 10 min) and Resend 3,000/month (100/day), both far above a daily cron over a few brands. Two things decided it:
- **Blast radius.** A Resend key can only send. A Fasthosts mailbox password can send *as you* and read your mail over IMAP — sitting in a Vercel env var, that's a much bigger prize if it leaks. If SMTP is ever revisited, use a dedicated `alerts@` mailbox, never the primary address.
- **Failure visibility.** SMTP gives no bounce or complaint signal; a failing alert is silent forever. Resend has webhooks and 30-day logs.

Resend also needs no runtime change (plain HTTPS works on Edge and Node), where SMTP needs a TCP socket and therefore Node only. `RESEND_API_KEY` was already sitting in `.env.example`, so this was the intended provider from the start.

**A correction worth recording:** "Supabase edge function" was listed as a third provider option in an earlier version of these notes. That was wrong — Edge Functions are a place to run code (Deno on Supabase infra), not an email service. Supabase only sends email for *auth* flows, and even there tells you to plug in your own SMTP for production. It would still need Resend or SMTP behind it, plus a second deploy target and secrets store. The one case where it would genuinely be right is email triggered by a **database event** (Postgres trigger/webhook) rather than app code — not this, since the cron already is the trigger and already holds the data.

Design points:
- **`sendEmail` never throws.** It runs in the cron loop *after* the scan and its fixes are saved. An email problem must not turn a successful scan into a failed one, so it returns `{sent, error}` for the caller to log. Alerting is last in the loop for the same reason.
- **Threshold is 10 points**, in `lib/email/alerts.ts`. Scores move a few points between scans from ordinary model variance; a lower threshold would train people to ignore the mail.
- **`previous == null` means no alert.** A brand's first scan isn't a drop however low it lands. Note this is an explicit null check — `if (!previous)` would silently disable alerting for any brand recovering from a score of 0, and there's a test pinning that.
- **Score isn't stored on `scan_runs`** (only confidence is), so `getPreviousScore` recomputes it from the previous run's answers. Two queries, once per brand per day.
- **Recipient comes from `auth.users`** via the admin API — `profiles` has no email column. That's why the lookup needs the service client, and it's memoised per workspace since most workspaces own several brands.

#### Competitor share of voice (shipped 2026-08-01)
**Gap found and fixed the same day:** `runAndSaveScan` — the *scheduled* scan path — wasn't writing `competitor_mentions`, only the manual `/api/scan/prompt` path was. Share of voice would have populated from a button click and stayed permanently empty for cron-driven brands. Both paths write it now. Worth remembering that this codebase has two scan paths and a change to one usually needs the other.

The `answers` table already had an unused `competitor_mentions jsonb` column — the schema anticipated this feature and nothing had ever written to it. Competitors are now matched against the **same answer text** the brand is scored on, inside the same scan.

**Why not scan competitors separately.** It would multiply the provider fan-out by the number of competitors and still answer the wrong question. What matters isn't "how does Rival score on Rival's prompts", it's "when someone asks *our* question, who gets named". One answer, one matcher, one comparison — cheaper and more honest.

- `analyzeCompetitors()` in `lib/ai/analyze.ts` reuses the brand matcher, so name/domain/alias matching is identical for both sides. Every tracked competitor is returned whether or not it was named — an absence is a result, and share of voice needs the zero rows for its denominator.
- `/api/scan/start` returns competitors once; the client passes them through to `/api/scan/prompt`. Fetching per prompt-provider pair would have been dozens of identical queries.
- `shareOfVoice()` in `lib/data/stats.ts` aggregates across a run.

**Shares don't sum to 100, on purpose.** One answer naming three brands counts for all three. Forcing a total would mean picking a winner per answer and throwing away the fact that being listed alongside a rival is the normal case — the interesting signal is who gets listed more often. The UI states this so it doesn't read as a bug.

**Old scans read as brand-only.** Pre-existing answers have an empty `competitor_mentions`, so they count toward the denominator without inflating anyone. The tab detects this and asks for a fresh scan rather than showing every competitor at 0%.

**Latent bug fixed on the way through.** `analyzeMention` built its regex from aliases filtered to `length > 2`. With a short name and no domain the list came out empty, compiling to `/\b(?:)\b/i` — which matches nearly any text and reported a mention *everywhere*. Unreachable for most brands, ordinary for a user-entered competitor row. `aliasMatcher()` now returns null for an empty list and the caller reports not-mentioned. `lib/ai/analyze.ts` had no tests before this; it has 20 now.

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
