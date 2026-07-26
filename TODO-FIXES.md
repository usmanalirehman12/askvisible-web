# To-Be-Fixed Log

Issues identified during code review but deferred for a future pass.

---

## Cron Scanner (`app/api/cron/scan/route.ts`)

### [CRON-1] Double-scan race condition (line 75)
**Severity:** Medium  
**Description:** The "is this brand due?" check (`hoursSinceScan >= threshold`) is read before the scan starts with no mutual exclusion. If Vercel retries a timed-out cron invocation while the previous one is still running, both instances pass the threshold check independently and each calls `runAndSaveScan`, inserting a separate `scan_run` (random UUIDs don't prevent this) — duplicating answers and fixes in the DB for the same window.  
**Proposed fix:** Before scanning, insert a sentinel `scan_run` with `status: "running"` and skip the brand if one already exists. Use the `unique(idempotency_key)` constraint on `scan_runs` as the lock.

---

### [CRON-2] Sequential brand loop will time out at scale (line 80)
**Severity:** Medium  
**Description:** Brands are scanned one at a time in a `for` loop. Each `runAndSaveScan` call takes ~30–40 s (all providers × all prompts run concurrently within it, but brands are sequential). With more than ~7–8 brands the total exceeds `maxDuration=300`, Vercel kills the function, and the remaining brands are silently skipped — no error in the response and no retry.  
**Proposed fix:** Fan out with `Promise.allSettled` across brands, or impose a self-deadline (~250 s) and return a `partial: true` flag so the caller knows to re-trigger.

---

### [CRON-3] `maxDuration=300` has no effect on Vercel Hobby plan (line 8)
**Severity:** Low  
**Description:** Vercel Hobby hard-caps all serverless functions at 60 s regardless of the exported `maxDuration` value. On Hobby, even a single brand scan that takes longer than 60 s is killed mid-execution — `runAndSaveScan` may have called AI providers but not yet committed `scan_runs`/`answers` rows.  
**Proposed fix:** Document the Pro-plan requirement in `DEPLOYMENT-GUIDE.md`. Optionally add a startup check that logs a warning when the runtime limit is likely to be exceeded.

---

### [CRON-4] Timing-unsafe CRON_SECRET comparison (line 11)
**Severity:** Low  
**Description:** `token === secret` uses JavaScript's native string equality, which short-circuits on the first non-matching byte. A sufficiently precise attacker could enumerate `CRON_SECRET` byte-by-byte via response latency.  
**Proposed fix:** Replace with constant-time comparison:
```ts
import { timingSafeEqual } from "crypto";
// inside authorized():
timingSafeEqual(Buffer.from(token), Buffer.from(secret))
```

---

*Logged: 2026-07-26 · PR #1 review*
