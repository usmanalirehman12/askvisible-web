# AskVisible — Plan & Progress

Working plan for the product. Detailed history, architectural decisions and debugging
notes live in [`.claude/session_notes.md`](.claude/session_notes.md); this file is the
short version: what's done, what's next, and why.

Last updated: 2026-08-01 (`208a368`)

---

## Progress chart

Counts are **tracked items, not effort** — "Billing & Stripe" is one row and several
weeks; "delete stale Vercel projects" is one row and five minutes. Read the size column
in the backlog before reading anything into the percentage.

```
Product features    ███████████████████░░░░░░░  11 / 15   73%
Engineering health  ██████████████████████████   6 / 6    100%
Known debt          ████████████░░░░░░░░░░░░░░   2 / 3     67%
────────────────────────────────────────────────────────────
Overall             ███████████████████░░░░░░░  19 / 24    79%
```

| Area | Done | Open |
|---|---:|---:|
| Product features | 11 | 4 |
| Engineering health | 6 | 0 |
| Known debt | 2 | 1 |
| **Total** | **19** | **5** |

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

### Shipped — engineering health

| # | Item | Evidence |
|---|---|---|
| 1 | Test suite | 56 tests across 5 files, `vitest` |
| 2 | CI pipeline | Typecheck + tests + dead-code on every push and PR |
| 3 | Dead-code guard | `knip` as `npm run deadcode`; catches what `tsc` can't (no `noUnusedLocals`) |
| 4 | Rate limiting | Postgres-backed, survives serverless scale-out, fails closed |
| 5 | Keyboard accessibility | Brand switcher rows are real `<button>`s, verified in both themes |
| 6 | Deploy discipline | Documented: production comes from git, never `vercel --prod` on a dirty tree |

---

## What's next

Ranked. Do them in this order unless something external changes the priority.

### 1. Close the `schema.sql` drift — size XS, ~15 min

`scan_frequency` and `scan_day` are read and written by four files
(`lib/data/types.ts`, `app/app/page.tsx`, `app/api/brands/settings/route.ts`,
`app/api/cron/scan/route.ts`) but are **not declared in `supabase/schema.sql`**. They were
added by a manual migration that never made it back into the file. Rebuild the schema from
source today and the scan scheduler breaks silently.

Cheapest item on the list and the only one that is a live correctness risk rather than a
missing feature. Same failure class as the rate-limit migration, which is now in the file
correctly — worth fixing while the context is fresh.

### 2. Delete the stale Vercel projects — size XS, ~5 min

`websitefixer`, `askvisible-web`, `askvisible-web-tghb`. Only `askvisible-web-mfu2` is
live. Three dead projects pointing at the same repo is exactly the confusion that already
caused one accidental production revert. Housekeeping, but it removes a real foot-gun.

### 3. Competitor scan flow — size L

The largest remaining product gap, and the groundwork is already in place: the
`competitors` table exists, `lib/data/competitors.ts` has `getCompetitors` and
`createCompetitor`, and `app/app/page.tsx` already references competitors in 25 places.
What's missing is running competitors through the same prompts as the brand and rendering
the comparison. This is the feature that turns a score into a market position.

### 4. Notifications tab — size M

Email alerts on score drops. Needs a delivery provider decision first (Resend, Postmark,
Supabase edge function) — that's the blocking question, not the UI.

### 5. Team members tab — size M

Invite by email, roles. `workspace_members` already supports multi-user with a `role`
column; RLS is written against it. Mostly UI plus an invite flow.

### 6. Billing & usage — size L

Stripe. The biggest of the remaining items and the one most likely to change shape
depending on how pricing lands. `workspaces.plan` and `usage_months` already exist.

---

## Known debt

| # | Item | Status |
|---|---|---|
| 5 | `scan_frequency` / `scan_day` missing from `schema.sql` | **Open** — item 1 above |
| 6 | GSC migration must be run manually | Open by design; documented in `schema.sql` |
| 1–4 | Fixes RLS, weak prompts, brand profile save, prompts edit UI | Resolved |

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
