# AskVisible — Plan & Progress

Working plan for the product. Detailed history, architectural decisions and debugging
notes live in [`.claude/session_notes.md`](.claude/session_notes.md); this file is the
short version: what's done, what's next, and why.

Last updated: 2026-08-06 (First-run UX extended to every tab — per-tab tips gated by real account age, not just device localStorage — code shipped, not yet pushed)

---

## Progress chart

Counts are **tracked items, not effort** — "Billing & Stripe" is one row and several
weeks; "delete stale Vercel projects" is one row and five minutes. Read the size column
in the backlog before reading anything into the percentage.

```
Product features    █████████████████████████░  17 / 18   94%
Engineering health  ██████████████████████████   7 / 7    100%
Known debt          ██████████████████████████   4 / 4    100%
────────────────────────────────────────────────────────────
Overall             █████████████████████████░  28 / 29    97%
```

| Area | Done | Open |
|---|---:|---:|
| Product features | 17 | 1 |
| Engineering health | 7 | 0 |
| Known debt | 4 | 0 |
| **Total** | **28** | **1** |

Only billing is left, and it needs your Stripe account and real pricing. Everything I can
build without you is built. (The gap analysis also flagged a landing-page demo video, a
custom domain, and a free pre-signup checker tool — those need you too, not code; see
`.claude/session_notes.md` #12.)

### Shipped — product

| # | Feature | Notes |
|---|---|---|
| 1 | Auth & workspaces | Supabase auth, `handle_new_user` bootstrap trigger |
| 2 | Brand management + switcher | Multi-brand, `localStorage` active brand, portalled modal |
| 3 | Prompt generation | Claude-authored from scraped homepage title/description |
| 4 | Scan engine | Async multi-provider pipeline (OpenAI, Gemini, Perplexity, Claude, DeepSeek) |
| 5 | Scoring & confidence | Mention 60 / position 25 / sentiment 15, averaged over all answers |
| 6 | Dashboard sections | Overview, prompts, answers, competitors, settings |
| 7 | AI Fixes (FixEngine) | Claude-generated fixes with status tracking |
| 8 | Reports tab | Per-run report view |
| 9 | Scan schedule | `scan_frequency` / `scan_day`, daily Vercel cron at 06:00 UTC |
| 10 | SEO Audit | 12+ regex checks over fetched HTML, grouped by category |
| 11 | Google Search Console | Full OAuth, token refresh, metrics + top queries |
| 12 | Competitor share of voice | Competitors matched against the same answers, in the same scan |
| 13 | Score-drop email alerts | Resend, fires on a 10+ point fall vs the previous scan |
| 14 | Team members | Invite by email with roles, accept flow, revoke and remove |
| 15 | Multi-workspace switching | Sidebar switcher; appears only for people in 2+ workspaces |
| 16 | Reports, SEO Audit & Traffic upgrade | Timestamps everywhere; GSC 7/30/90-day + custom date ranges; 10-tab SEO audit (incl. Google PageSpeed Insights); reports embed the full audit + traffic + a historical score-trend chart. Detail in `.claude/session_notes.md`. Migration run 2026-08-04 — Run Audit confirmed working in production. |
| 17 | First-run UX | Onboarding checklist (4 steps, derived from real brand/prompt/scan state), consistent empty states across Prompts/Competitors/Overview, a skippable coach-mark tour, and a new Answers tab showing every engine's raw response with the brand mention highlighted. Driven by a competitive gap analysis; detail in `.claude/session_notes.md` #12. Shipped 2026-08-06. **Extended 2026-08-06:** the tour/checklist only covered Overview — every other tab (Prompts, Answers, Competitors, AI Fixes, Reports, Settings) now gets a dismissible first-visit tip, gated by a real account-age signal (`workspaces.created_at`, new `workspaceCreatedAt` on `WorkspaceContext`) rather than a device-local flag. Detail in `.claude/session_notes.md` #13. |

### Shipped — engineering health

| # | Item | Evidence |
|---|---|---|
| 1 | Test suite | 56 tests across 5 files, `vitest` |
| 2 | CI pipeline | Typecheck + tests + dead-code on every push and PR |
| 3 | Dead-code guard | `knip` as `npm run deadcode`; catches what `tsc` can't (no `noUnusedLocals`) |
| 4 | Rate limiting | Postgres-backed, survives serverless scale-out, fails closed |
| 5 | Keyboard accessibility | Brand switcher rows are real `<button>`s, verified in both themes |
| 6 | Deploy discipline | Documented: production comes from git, never `vercel --prod` on a dirty tree |
| 7 | Schema matches code | `scan_frequency`/`scan_day` declared; `scan_day` validated instead of silently killing the cron |

---

## What's next

Ranked. Do them in this order unless something external changes the priority.

### ~~1. Close the `schema.sql` drift~~ — DONE 2026-08-01

Both columns are declared with defaults matching the code's fallbacks. Turned up a
second bug on the way in: `scan_day` was never validated, so `999` stored fine and the
cron then silently stopped scanning that brand. Rule now lives in
`lib/data/scan-schedule.ts` with 17 tests. Detail and the optional
make-live-match-the-file `ALTER` block are in `.claude/session_notes.md` under Known Bug #5.

### ~~2. Delete the stale Vercel projects~~ — DONE 2026-08-02 (you)

`websitefixer`, `askvisible-web`, `askvisible-web-tghb` deleted. Only
`askvisible-web-mfu2` remains — one project, one repo, no more ambiguity about which
one is live.

### ~~3. Competitor scan flow~~ — DONE 2026-08-01

Competitors are matched against the same answer text the brand is scored on, during the
same scan, and the Competitors tab renders share of voice. The `answers` table already had
an unused `competitor_mentions` jsonb column, which turned out to be exactly the right
hook. Detail in `.claude/session_notes.md`.

**Needs a fresh scan to show data.** Answers recorded before this change have an empty
`competitor_mentions`, so the tab will say so and ask for a new run rather than showing
everyone at 0%.

### ~~4. Score-drop email alerts~~ — DONE 2026-08-01

Resend, chosen over the domain's own Fasthosts SMTP. Volume wasn't the deciding factor —
both are far above a daily cron over a handful of brands. Blast radius was: a Resend key
can only send, while a mailbox password can send as you and read your mail over IMAP, and
it would live in a Vercel env var. Bounce and complaint webhooks were the tiebreaker.

**Not live until you set `RESEND_API_KEY` and `ALERT_FROM_EMAIL` in Vercel.** Until then
`emailConfigured()` returns false and the cron skips alerting — nothing errors.

Setup: sign up at resend.com → add your domain → paste the DNS records into Fasthosts →
create a send-only API key → add both env vars. The from-address must be on the verified
domain or every send returns 403.

### ~~5. Team members tab~~ — DONE 2026-08-01, migration applied 2026-08-02

Invite by email with a role, accept flow, revoke, remove, leave. Permission rules are pure
functions in `lib/data/team.ts` with 23 tests. Migration is live in Supabase — the tab
should work end to end now. Worth one check: open Settings → Team members and confirm
you're listed as `owner`.

### ~~5b. Multi-workspace switching~~ — DONE 2026-08-01

Sidebar switcher, rendered only for people in 2+ workspaces. `getWorkspaceContext` returns
every membership with the caller's role in each, and `/api/team` takes an explicit
workspace id so it can't manage the wrong team after a switch.

### ~~6. First-run UX~~ — DONE 2026-08-06

Onboarding checklist, standardized empty states, a skippable coach-mark tour, and a new
Answers tab (raw engine responses with the brand mention highlighted). Came out of a
competitive gap analysis showing AskVisible matches or beats Peec/Profound on raw capability
but ships with zero guided onboarding — new users landed on an empty dashboard with no
signal of what to do first. Detail, scope boundaries, and what's still explicitly out of
scope (demo video, custom domain, the free pre-signup checker) in
`.claude/session_notes.md` #12. Pushed to `origin/master` 2026-08-06.

### 7. Billing & usage — size L — **needs your Stripe account and pricing**

`workspaces.plan` and `usage_months` already exist. Blocked on things only you can supply:
a Stripe account and keys, the actual price points and tiers, and what happens when a
workspace exceeds its quota (block, warn, or bill overage). Those decisions shape the
schema, so guessing them would mean rework.

---

## Known debt

| # | Item | Status |
|---|---|---|
| 5 | `scan_frequency` / `scan_day` missing from `schema.sql` | **Open** — item 1 above |
| 6 | GSC migration must be run manually | Open by design; documented in `schema.sql` |
| 7 | `seo_audits` migration must be run manually | Resolved 2026-08-04 (you) — table + RLS created, Run Audit confirmed working |
| 1–4 | Fixes RLS, weak prompts, brand profile save, prompts edit UI | Resolved |

Optional on top of #7: set `PAGESPEED_API_KEY` in Vercel to enable the Performance and
Accessibility tabs. Without it those two tabs just say "not configured" instead of showing
fabricated data — nothing else depends on it.

---

## Working conventions

These are standing instructions, not one-off notes.

- **Ship a progress chart when work completes.** At the end of any completed piece of
  work, update the progress chart above and show it. The chart is the deliverable, not an
  afterthought — it's how progress gets read at a glance without re-reading the notes.
- **Keep this file and `.claude/session_notes.md` in sync.** `PLAN.md` is the roadmap and
  the chart; `session_notes.md` is the detail, the gotchas and the reasoning. A finished
  item gets ticked here and explained there.
- **Don't ask for approval on recommended work.** Proceed on obvious calls and state the
  assumption. Reserve questions for genuinely difficult or risky decisions.
- **Verify the artifact, not the build.** A green build says the code compiled, not that
  the change shipped. Fetch the deployed asset and grep for something unique to the change.
- **Production deploys come from `git push`.** Never `vercel --prod` from a dirty tree.
- **Give step-by-step instructions for anything manual.** Numbered, concrete steps — not a vague pointer to a tab or section that might not exist.
