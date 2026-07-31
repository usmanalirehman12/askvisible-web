# AskVisibleAI — Session Notes

**Last updated:** 2026-07-31  
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
- Verified the CSS-inheritance root cause with an isolated static repro (same markup/CSS, nested-in-sidebar vs. portaled-to-body) before deploying; couldn't verify the live authenticated UI directly (no login access) — **still worth a manual click-through.**
- **Was briefly reverted in production.** This fix was `vercel --prod` deployed but not committed, so a later unrelated `git push` rebuilt production without it (see "Deployment comes from git, not the CLI" below). Committed in `d828a06` and restored. Caught by diffing the deployed stylesheet against the local file — `.client-list li.active` was simply absent from the live CSS.

### Test suite bootstrapped (2026-07-31)
First tests in the project. `vitest` (dev dependency), config in `vitest.config.mts` (Node environment, `@/*` alias mirroring `tsconfig.json`), run with `npm test`.

- `lib/ai/scrape-edge.test.ts` — 13 tests. Covers the SSRF blocklist (`isObviouslyPrivateHost`: loopback, RFC1918, cloud-metadata `169.254.169.254`, and the `172.16.0.0/12` boundary in both directions) plus `scrapeHomepageMeta` behavior (private hosts short-circuit without ever calling `fetch`, non-OK responses, non-HTML content types, network errors, https scheme defaulting). `fetch` is stubbed — no live network in tests.
- `lib/ai/html-meta.test.ts` — 15 tests. Covers `decodeHtml`, `metaTag` (name vs property, case-insensitivity, entity decoding, missing tags), `pageTitle`.
- `isObviouslyPrivateHost` was exported from `scrape-edge.ts` purely to make it directly testable; no behavior change.

**Behavior the tests pinned down:** `scrapeHomepageMeta` is asymmetric about og-tags. Title prefers `og:title` and falls back to `<title>`; description prefers plain `<meta name="description">` and falls back to `og:description`. That is pre-existing behavior, not a deliberate design call — the tests document it rather than change it. Worth revisiting if og-tags should consistently win.

28/28 passing. There is still no CI running them — that's a gap.

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

### 5. `scan_frequency` and `scan_day` not in schema.sql
These columns were added to the `brands` table via a previous migration but are not reflected in `supabase/schema.sql`. If the schema is ever reset, those columns would be missing.

### 6. GSC migration must be run manually
The `gsc_tokens` table + RLS policy must be run in Supabase SQL Editor. The SQL is in `supabase/schema.sql` but not auto-applied.

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
- [ ] Manually verify the brand switcher fix in the live authenticated app: open the client modal, confirm the list renders light (not dark navy), confirm the X button is visible, click a brand and confirm the dashboard actually switches to its data
- [ ] Add CI to run `npm test` on push — the tests exist but nothing enforces them
- [ ] Widen test coverage beyond `lib/ai/` (scoring in `lib/data/scoring.ts` is the next highest-value pure-function target)
- [ ] Gitignore Excel lock files (`~$*.xlsx`) — one is currently sitting untracked in `outputs/domain-availability-export/`
- [ ] Keyboard accessibility for the brand switcher list: rows are `<li onClick>` with no `role`/`tabIndex`/key handler, so brands can't be switched by keyboard (the sidebar nav next to it uses real `<button>`s)

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
