create extension if not exists "uuid-ossp";

create type public.plan_name as enum ('free','starter','pro','agency');
create type public.run_status as enum ('queued','running','complete','delayed','failed');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  created_at timestamptz not null default now()
);
create table public.workspaces (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  -- on delete cascade: without this, deleting an auth.users row cascades to their profiles
  -- row (profiles.id references auth.users.id on delete cascade), but any workspace still
  -- pointing at that profile as owner_id blocks the delete with a foreign-key violation —
  -- surfaced by Supabase's admin deleteUser as an opaque 500, not a clear error. Found by
  -- testing actual account deletion, not by inspection. This also matters for Plan B's
  -- documented data policy (client data deletable on request/cancellation) — that promise
  -- doesn't hold if deleting an account 500s instead.
  owner_id uuid not null references public.profiles(id) on delete cascade,
  plan plan_name not null default 'free',
  prompt_quota integer not null default 3,
  created_at timestamptz not null default now()
);
-- joined_at exists so getWorkspaceContext can order deterministically. It picks a single
-- membership (multi-workspace switching is still deferred), and ordering newest-first means
-- someone who accepts an invite lands in the workspace they were just invited to rather
-- than the empty one handle_new_user made for them at signup.
create table public.workspace_members (
  workspace_id uuid references public.workspaces(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('owner','admin','member','viewer')),
  joined_at timestamptz not null default now(),
  primary key(workspace_id,user_id)
);

-- Invitations are consumed by an unauthenticated visitor clicking a link, so the token is
-- the only credential — it must be unguessable and it expires. Nothing here is readable by
-- anon or authenticated clients (RLS on, zero policies); every read goes through the
-- service role in /api/team/*, which checks the caller's role first.
create table public.invitations (
  id uuid primary key default uuid_generate_v4(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  email text not null,
  role text not null default 'member' check (role in ('admin','member','viewer')),
  token text not null unique,
  invited_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days',
  accepted_at timestamptz,
  -- One live invite per email per workspace. Re-inviting replaces rather than piles up,
  -- and a partial index lets an accepted invite sit alongside a fresh one for the same
  -- person if they're ever removed and re-added.
  constraint invitations_email_lower check (email = lower(email))
);
create unique index invitations_pending_unique on public.invitations (workspace_id, email) where accepted_at is null;
create index invitations_token_idx on public.invitations (token);
-- scan_frequency/scan_day drive the daily cron in app/api/cron/scan/route.ts. They were
-- added to production by a manual migration and were missing from this file until
-- 2026-08-01 — a schema rebuild from source would have silently broken the scheduler.
-- Defaults match the code's fallbacks (`?? "weekly"`, `?? 1`), so a row written without
-- them behaves identically whether the default comes from Postgres or from TypeScript.
-- scan_day means day-of-week 0-6 when weekly and day-of-month 1-31 when monthly; the
-- check stays permissive across both because one column serves both modes. The tighter
-- per-frequency rule is enforced in lib/data/scan-schedule.ts so users get a 400 rather
-- than a constraint violation.
create table public.brands (
  id uuid primary key default uuid_generate_v4(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  domain text not null,
  description text,
  aliases text[] not null default '{}',
  scan_frequency text not null default 'weekly' check (scan_frequency in ('weekly','monthly','off')),
  scan_day integer not null default 1 check (scan_day between 0 and 31),
  created_at timestamptz not null default now()
);
create table public.competitors (
  id uuid primary key default uuid_generate_v4(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  name text not null,
  domain text,
  aliases text[] not null default '{}'
);
create table public.prompts (
  id uuid primary key default uuid_generate_v4(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  query text not null,
  engines text[] not null default array['openai','google','perplexity','anthropic'],
  frequency text not null default 'weekly' check (frequency in ('daily','weekly','manual')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create table public.scan_runs (
  id uuid primary key default uuid_generate_v4(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  status run_status not null default 'queued',
  scheduled_for timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  error_message text,
  idempotency_key text unique not null,
  -- 0-100, derived from provider-response completeness and cross-provider mention
  -- agreement (see lib/ai/orchestrator.ts's confidence()) — surfaced next to the
  -- score so a scan built from 1 surviving provider isn't shown with the same
  -- implied certainty as one where 4 providers agree.
  confidence integer,
  -- 'competitor' scans reuse this same table/engine (runVisibilityCheck) rather than
  -- a parallel schema — a brand's own visibility and its competitors' visibility are
  -- the same measurement run against a different domain. competitor_id is set only
  -- when subject_type = 'competitor'.
  subject_type text not null default 'brand' check (subject_type in ('brand','competitor')),
  competitor_id uuid references public.competitors(id) on delete cascade,
  created_at timestamptz not null default now()
);
create table public.answers (
  id uuid primary key default uuid_generate_v4(),
  run_id uuid not null references public.scan_runs(id) on delete cascade,
  prompt_id uuid not null references public.prompts(id) on delete cascade,
  engine text not null,
  raw_answer text,
  brand_mentioned boolean not null default false,
  position integer,
  sentiment text,
  cited_sources jsonb not null default '[]',
  competitor_mentions jsonb not null default '[]',
  tokens_in integer not null default 0,
  tokens_out integer not null default 0,
  cost_usd numeric(10,6) not null default 0,
  created_at timestamptz not null default now(),
  unique(run_id,prompt_id,engine)
);
create table public.fixes (
  id uuid primary key default uuid_generate_v4(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  answer_id uuid references public.answers(id) on delete set null,
  -- Free-text by design, not an enum: existing values are schema-markup/NAP/page-rewrite
  -- fix categories; 'gbp' and 'reviews' (Google Business Profile + reviews audit findings,
  -- see lib/audit/) reuse this same table and dashboard tab rather than a parallel one.
  category text not null,
  title text not null,
  rationale text,
  generated_content text,
  impact_low integer,
  impact_high integer,
  status text not null default 'ready',
  created_at timestamptz not null default now()
);
create table public.reports (
  id uuid primary key default uuid_generate_v4(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  title text not null,
  period_start date not null,
  period_end date not null,
  payload jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create table public.usage_months (
  workspace_id uuid references public.workspaces(id) on delete cascade,
  period date not null,
  prompts_used integer not null default 0,
  tokens_in bigint not null default 0,
  tokens_out bigint not null default 0,
  cost_usd numeric(12,6) not null default 0,
  primary key(workspace_id,period)
);
create table public.subscriptions (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  status text,
  current_period_end timestamptz
);
create table public.gsc_tokens (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  access_token text not null,
  refresh_token text,
  expires_at timestamptz,
  property_url text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.brands enable row level security;
alter table public.competitors enable row level security;
alter table public.prompts enable row level security;
alter table public.scan_runs enable row level security;
alter table public.answers enable row level security;
alter table public.fixes enable row level security;
alter table public.reports enable row level security;
alter table public.usage_months enable row level security;
alter table public.subscriptions enable row level security;
alter table public.gsc_tokens enable row level security;

create function public.is_workspace_member(target uuid) returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.workspace_members m where m.workspace_id=target and m.user_id=auth.uid());
$$;
create policy "members read workspaces" on public.workspaces for select using (public.is_workspace_member(id));
create policy "members read brands" on public.brands for select using (public.is_workspace_member(workspace_id));
create policy "members manage brands" on public.brands for all using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));
create policy "members read scans" on public.scan_runs for select using (public.is_workspace_member(workspace_id));
create policy "members read reports" on public.reports for select using (public.is_workspace_member(workspace_id));
create policy "members read usage" on public.usage_months for select using (public.is_workspace_member(workspace_id));
create policy "members read subscriptions" on public.subscriptions for select using (public.is_workspace_member(workspace_id));
create policy "members manage gsc_tokens" on public.gsc_tokens for all using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));
-- These three were missing: RLS was enabled on profiles/workspace_members/competitors with
-- zero policies defined, which under Postgres RLS means deny-all, not "no restriction" —
-- every query against them would silently return zero rows. Required for basic auth/data
-- wiring to work at all, not an optional hardening pass.
create policy "users read own profile" on public.profiles for select using (id = auth.uid());
create policy "users update own profile" on public.profiles for update using (id = auth.uid());
-- Reading your own row is what getWorkspaceContext needs; reading the whole team is what
-- the Team members tab needs. is_workspace_member is security definer, so it bypasses RLS
-- and this policy can't recurse into itself.
create policy "members read own membership rows" on public.workspace_members for select using (user_id = auth.uid());
create policy "members read teammates" on public.workspace_members for select using (public.is_workspace_member(workspace_id));

alter table public.invitations enable row level security;
-- Deliberately no policies: invitations carry a bearer token, so they're service-role only.
create policy "members read competitors" on public.competitors for select using (exists(select 1 from public.brands b where b.id = competitors.brand_id and public.is_workspace_member(b.workspace_id)));
create policy "members manage competitors" on public.competitors for all using (exists(select 1 from public.brands b where b.id = competitors.brand_id and public.is_workspace_member(b.workspace_id))) with check (exists(select 1 from public.brands b where b.id = competitors.brand_id and public.is_workspace_member(b.workspace_id)));

-- Phase 2 additions: same deny-all gap as above, now hit for real by scan execution and
-- fix generation. prompts/fixes join through brands; answers joins through scan_runs
-- (answers has no workspace_id/brand_id of its own — run_id is the only path back to a
-- workspace). scan_runs already had a read policy but no write policy, so inserting a real
-- scan from the app would have been silently blocked.
create policy "members manage prompts" on public.prompts for all using (exists(select 1 from public.brands b where b.id = prompts.brand_id and public.is_workspace_member(b.workspace_id))) with check (exists(select 1 from public.brands b where b.id = prompts.brand_id and public.is_workspace_member(b.workspace_id)));
create policy "members manage scans" on public.scan_runs for insert with check (public.is_workspace_member(workspace_id));
create policy "members update scans" on public.scan_runs for update using (public.is_workspace_member(workspace_id));
create policy "members read answers" on public.answers for select using (exists(select 1 from public.scan_runs r where r.id = answers.run_id and public.is_workspace_member(r.workspace_id)));
create policy "members manage answers" on public.answers for insert with check (exists(select 1 from public.scan_runs r where r.id = answers.run_id and public.is_workspace_member(r.workspace_id)));
create policy "members read fixes" on public.fixes for select using (exists(select 1 from public.brands b where b.id = fixes.brand_id and public.is_workspace_member(b.workspace_id)));
create policy "members manage fixes" on public.fixes for all using (exists(select 1 from public.brands b where b.id = fixes.brand_id and public.is_workspace_member(b.workspace_id))) with check (exists(select 1 from public.brands b where b.id = fixes.brand_id and public.is_workspace_member(b.workspace_id)));

-- Workspace bootstrap: every signed-up user needs a profile row and a workspace to attach
-- brands to before the dashboard means anything. security definer lets this run before the
-- new user is a member of anything (RLS would otherwise block their own bootstrap insert).
-- Runs once, on auth.users insert — not on every login.
create function public.handle_new_user() returns trigger language plpgsql security definer set search_path='' as $$
declare
  new_workspace_id uuid;
begin
  insert into public.profiles (id, full_name) values (new.id, new.raw_user_meta_data->>'full_name');
  insert into public.workspaces (name, owner_id, plan, prompt_quota)
    values (coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)) || '''s workspace', new.id, 'free', 3)
    returning id into new_workspace_id;
  insert into public.workspace_members (workspace_id, user_id, role) values (new_workspace_id, new.id, 'owner');
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- Rate limiting for the unauthenticated public endpoints (/api/check, /api/audit).
-- Each call spends real money (LLM fan-out, Google Places), so the counter has to
-- survive serverless scale-out. The previous limiter lived in a module-level Map, which
-- on Vercel gave every instance its own counter — "5 per hour" was really "5 per
-- instance", and instances scale with load, so the ceiling rose exactly when it mattered.
--
-- Fixed window, one statement. Concurrent requests can't both read a stale count and
-- each conclude they're under the limit, because the increment happens inside the upsert.
-- Rows are ~50 bytes and keyed by bucket+IP; prune with
--   delete from public.rate_limits where window_start < now() - interval '1 day';
-- if the table ever grows enough to notice.
create table public.rate_limits (
  key text primary key,
  window_start timestamptz not null default now(),
  count integer not null default 0
);
alter table public.rate_limits enable row level security;
-- No policies on purpose: RLS on with zero policies denies everyone. Only the
-- service-role client (which bypasses RLS) touches this table.

create function public.consume_rate_limit(p_key text, p_limit integer, p_window_seconds integer)
  returns table(allowed boolean, retry_after integer)
  language plpgsql security definer set search_path='' as $$
declare
  v_count integer;
  v_window_start timestamptz;
begin
  insert into public.rate_limits as r (key, window_start, count)
  values (p_key, now(), 1)
  on conflict (key) do update
    set count = case when r.window_start < now() - (p_window_seconds * interval '1 second') then 1 else r.count + 1 end,
        window_start = case when r.window_start < now() - (p_window_seconds * interval '1 second') then now() else r.window_start end
  returning r.count, r.window_start into v_count, v_window_start;

  return query select
    v_count <= p_limit,
    greatest(0, p_window_seconds - extract(epoch from (now() - v_window_start))::integer);
end;
$$;
-- security definer means this would otherwise be callable by anyone holding the anon key,
-- who could burn a victim's window by guessing their key. Only the service role gets it.
revoke all on function public.consume_rate_limit(text, integer, integer) from public, anon, authenticated;
