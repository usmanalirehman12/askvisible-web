# Design System — AskVisible

## Product Context
- **What this is:** AI search visibility SaaS for marketing agencies — tracks how often clients are cited by ChatGPT, Gemini, Perplexity, and Claude
- **Who it's for:** Agency staff managing multiple client accounts; their clients reviewing results
- **Space/industry:** SEO / AI visibility / digital marketing analytics
- **Project type:** Multi-client SaaS dashboard

## Aesthetic Direction
- **Direction:** Data-Expressive Utility — purpose-built analytics intelligence. Color codes meaning; whitespace creates hierarchy; every pixel earns its place.
- **Decoration level:** Intentional — colored left-border stat cards, semantic chart fills, color-coded nav icons. No blobs, no gradient backgrounds.
- **Mood:** Serious software that knows things other tools don't. Not playful, not corporate. The kind of tool that marketing directors actually trust.
- **Reference:** SEMrush analytics dashboard (light sidebar, multi-color data taxonomy, medium font density)

## Typography
- **Display/Hero:** `"Outfit", system-ui, sans-serif` — geometric, clean, optimistic; used at 700–800 weight for score numbers and page headings
- **Body:** `"Plus Jakarta Sans", system-ui, sans-serif` — excellent x-height at 14px; slightly more personality than DM Sans
- **UI/Labels:** Same as body
- **Data/Tables:** `"Geist Mono", "Cascadia Code", Consolas, monospace` — monospace-influenced, tabular figures for score numbers and engine breakdown
- **Loading:** Google Fonts via `next/font/google` — `Outfit` (weights 700, 800) + `Plus_Jakarta_Sans` (weights 400, 500, 600, 700)
- **Scale:**
  - Score hero: 72–80px / weight 800
  - Page heading h1: 22px / weight 700
  - Panel heading: 13px / weight 700
  - Body: 14px / weight 400
  - Secondary / labels: 12px / weight 500
  - Micro / captions: 10–11px / weight 600 (uppercase + tracking for labels)
  - **Minimum font size in the dashboard: 12px** (current codebase uses 8–10px in many places — all must come up)

## Color
- **Approach:** Expressive — each data category has its own color identity so users can scan at a glance

| Token | Hex | Meaning |
|-------|-----|---------|
| `--sky` | `#0EA5E9` | AI visibility score, primary CTA |
| `--sky-d` | `#E0F2FE` | Sky tint for backgrounds / badges |
| `--em` | `#10B981` | Traffic, growth, positive delta |
| `--em-d` | `#D1FAE5` | Emerald tint |
| `--am` | `#F59E0B` | SEO issues, warnings, action needed |
| `--am-d` | `#FEF3C7` | Amber tint |
| `--pl` | `#8B5CF6` | Competitor data (repurposed from brand) |
| `--pl-d` | `#EDE9FE` | Plum tint |
| `--cr` | `#EF4444` | Critical errors, breaking issues |
| `--cr-d` | `#FEE2E2` | Crimson tint |
| `--bg` | `#F1F5F9` | Page background (slate-100) |
| `--surface` | `#FFFFFF` | Panel / card background |
| `--surface2` | `#F8FAFC` | Secondary surface, hover states |
| `--sidebar` | `#FFFFFF` | Sidebar background (light, SEMrush-style) |
| `--sidebar2` | `#F1F5F9` | Sidebar hover / active area |
| `--ink` | `#0F172A` | Primary text |
| `--muted` | `#64748B` | Secondary text |
| `--faint` | `#94A3B8` | Disabled / placeholder |
| `--line` | `#E2E8F0` | Borders, dividers |
| `--line2` | `#CBD5E1` | Stronger borders |

- **Dark mode:** Surfaces darken to `#0B0F1A` page / `#131B2E` panel / `#1A2440` sidebar. Semantic accent hues stay the same; tint backgrounds become `rgba()` at ~15% opacity. Sidebar becomes a dark panel `#131B2E` with matching border.

## Spacing
- **Base unit:** 8px
- **Density:** Comfortable (current dashboard is too tight — 10–11px labels in cramped containers)
- **Scale:** 2xs=2 xs=4 sm=8 md=12 lg=16 xl=24 2xl=32 3xl=48
- **Panel padding:** 20px (was 19px — unchanged effectively)
- **Page padding:** 28px (current) — keep
- **Sidebar padding:** 18px 12px

## Layout
- **Approach:** Grid-disciplined
- **Sidebar:** 240px wide, white background, right border `1px solid var(--line)`, sticky full-height. Light sidebar mirrors SEMrush — professional, scan-friendly.
- **Content area:** `calc(100% - 240px)`, slate-100 background
- **App header:** 60px, white background, sticky
- **Max content width:** 1500px (current — keep)
- **Border radius:** sm=6px, md=8–10px, lg=14px, pill=9999px
- **Stat grid:** 4 columns in Overview (AI Score hero spans full width above), 3 supporting stats below

## Motion
- **Approach:** Intentional
- **Easing:** enter=ease-out, exit=ease-in, move=ease-in-out
- **Duration:** micro=100ms, short=200ms, medium=300ms, long=500ms
- **Key moments:**
  - Scan result arrival: stat card numbers animate from 0 to value (500ms, ease-out)
  - Nav hover: 150ms background transition
  - Chart line draw: SVG stroke-dasharray animation on scan completion (600ms)
  - Sidebar active pill: 150ms background transition

## Key Design Rules
1. **Purple is the competitor color.** Never use `--pl` for AskVisible brand elements. Blue (`--sky`) is the brand color.
2. **No rings or circles around the AI score.** The number stands alone. Decoration hedges; the number doesn't need it.
3. **Left-border accent on stat cards**, not top border or icon color alone. The 3px left border is the category signal.
4. **Minimum 12px** for all text in the dashboard. No 8px, 9px, 10px labels.
5. **Nav icon color = content color.** When Traffic (emerald) nav item is active, you'll see emerald data. The sidebar is a legend.
6. **chart competitor line = dashed purple.** Your trend = solid sky blue area fill. Never flip this.

## Decisions Log
| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-07-24 | Moved sidebar from dark (#18162D) to light (#FFFFFF) | Matches SEMrush convention; easier to scan nav categories; dark sidebar was a risk that didn't pay off |
| 2026-07-24 | Purple repurposed from brand to competitor color | Creates visual narrative: blue = you, purple = them. More meaningful than decorative use of purple. |
| 2026-07-24 | AI score displayed as bare 72px number, no ring/circle | Rings hedge. The number is the product — show it directly. |
| 2026-07-24 | Outfit + Plus Jakarta Sans replaces Manrope + DM Sans | Outfit reads friendlier at large sizes; Plus Jakarta Sans has better x-height at 14px body |
| 2026-07-24 | Minimum font size raised to 12px | Current 8–10px micro-labels are illegible at normal viewing distance |
