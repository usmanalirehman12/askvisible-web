# AskVisible — Plan & Progress

Working plan for the product. Detailed history, architectural decisions and debugging
notes live in [`.claude/session_notes.md`](.claude/session_notes.md); this file is the
short version: what's done, what's next, and why.

Last updated: 2026-08-01 (step 1 of the backlog complete)

---

## Progress chart

Counts are **tracked items, not effort** — "Billing & Stripe" is one row and several
weeks; "delete stale Vercel projects" is one row and five minutes. Read the size column
in the backlog before reading anything into the percentage.

```
Product features    ███████████████████░░░░░░░  11 / 15   73%
Engineering health  ██████████████████████████   7 / 7    100%
Known debt          ██████████████████████████   3 / 3    100%
────────────────────────────────────────────────────────────
Overall             ████████████████████░░░░░░  21 / 25    84%
```

| Area | Done | Open |
|---|---:|---:|
| Product features | 11 | 4 |
| Engineering health | 7 | 0 |
| Known debt | 3 | 0 |
| **Total** | **21** | **4** |

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

### 2. Delete the stale Vercel projects — size XS, ~5 min — **needs you**

I can't do this one: no Vercel CLI here, and deleting projects is destructive on your
account. Dashboard → each project → Settings → scroll to bottom → Delete Project.
Delete `websitefixer`, `askvisible-web`, `askvisible-web-tghb`. Keep
**`askvisible-web-mfu2`** — that's production.

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
