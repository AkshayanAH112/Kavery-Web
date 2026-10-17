# Kavery Design System — Master

> When building a page, first check `design-system/kavery/pages/<page>.md`. If it exists, it overrides
> this file. If not, follow the rules below. The tokens themselves live in `app/globals.css`; this file
> explains them. Change both together.

**Project:** Kavery Sports Club, Periyaneelavanai (KSC, est. 1981) and its education wing, the Kavery
Education Development Association (KEDA, since 2023).
**Generated:** 2026-10-12, curated from `ui-ux-pro-max --design-system` ("Sports Team/Club", Hero-Centric,
Vibrant & Block-based).
**Stack:** Next.js 16 · Tailwind v4 · one app, three surfaces (public site, KEDA section, staff console).

## What was taken from the generator and what was overridden

| Generator said | Decision | Why |
|---|---|---|
| Team red `#DC2626` + championship gold | **Overridden.** Red `#E00000`, yellow `#FFF200`, blue `#003C9C` | Sampled from the actual KSC crest. Its second colour is a flat process yellow, not gold. |
| Light background `#FEF2F2` | **Overridden.** The public site is dark ("night") | Yellow is unreadable on a light ground and is the crest's loudest colour. On ink it is 17:1. |
| Bebas Neue / Source Sans 3 | **Overridden.** Big Shoulders / Hanken Grotesk / Anek Tamil | Bebas has one weight and no Tamil partner. Anek Tamil has a width axis, so Tamil headings can be condensed to sit beside Big Shoulders. |
| Hero-centric, one primary CTA, sticky nav CTA | **Kept** | |
| Large type, bold hover, block layout | **Kept** | |

KCSC (the sister project this is ported from) is maroon and gold on a warm paper console. None of that is
reused: Kavery's crest is brighter and more graphic, and the two clubs should not look like one template.

## The one signature: the crest's diagonal

The KSC shield is quartered on two diagonals. That angle is the only decorative idea in the system, and it
appears in exactly three places:

1. **Sashes** — a wide red band and a thin yellow one at −24°, behind the hero and the login panel.
2. **The cut** — `--cut: 8deg`. Buttons lean on it (`.btn`, label counter-skewed so text stays upright).
3. **Section edges** — KEDA and the app band enter on a 5vw diagonal `clip-path`.

Nothing else is skewed, rotated or clipped. If a new element wants an angle, it uses one of these three.

## Tokens (three layers)

Components read **semantic** and **component** tokens only. A raw hex in a component is a bug.

### 1. Primitives

| Token | Value | Source |
|---|---|---|
| `--red-500` | `#E00000` | KSC crest red |
| `--red-400` / `--red-600` / `--red-700` | `#FF453A` / `#C00000` / `#8E0000` | small text on ink / console primary / pressed |
| `--yellow-400` | `#FFF200` | KSC crest yellow |
| `--blue-600` | `#003C9C` | the batsman on the KSC crest |
| `--blue-700` / `--blue-900` / `--blue-50` | `#003084` / `#071B45` / `#EAF0FB` | KEDA cap blue / KEDA text / KEDA tint |
| `--cream-200` | `#FBF1B0` | KEDA lettering |
| `--ink-950 … --ink-100` | `#0B0909 … #EDE8E8` | warm near-black ramp |
| `--paper-50` | `#FCFAF4` | KEDA background |

### 2. Semantic — swapped by a theme class

| Token | `.theme-night` (public site) | `.theme-keda` | `.theme-console` (light / dark) |
|---|---|---|---|
| `--bg` | ink-950 | paper-50 | `#F6F6F7` / `#0E0E10` |
| `--surface` / `--surface-2` | ink-900 / ink-800 | white / blue-50 | white, `#F1F1F3` / `#17171A`, `#222226` |
| `--fg` | `#F8F4EF` | blue-900 | `#111113` / `#F4F4F5` |
| `--muted` | ink-300 | `#4A5878` | `#6B6B74` / `#A1A1AA` |
| `--line` | white 12% | blue-900 14% | `#E6E6E9` / `#2B2B30` |
| `--brand` / `--on-brand` | red-500 / white | blue-700 / white | ink / white (inverted in dark) |
| `--brand-text` | red-400 | blue-700 | red-600 / red-400 |
| `--accent` / `--on-accent` | yellow-400 / ink-950 | cream-200 / blue-900 | yellow-400 / ink-950 |
| `--focus` | yellow-400 | blue-600 | ink / near-white |

**The console is monochrome on purpose.** It follows the shadcnspace dashboard reference: ink does the
job a brand colour would (active nav item, primary button, avatar), and the crest colours are kept for
*data and status* — red is the second chart series and the "live" state, yellow marks a six. A red
primary button would make every destructive action look like the default one.

The console also defines `--ok`, `--warn`, `--danger` (with `--on-danger`/`--on-warn` for filled
buttons) and four chart series `--data-1…4` (ink, red, grey, blue), each with a dark-mode value. Dark
mode is `data-theme="dark"` on `<html>`, set by the toggle in the top bar and applied before first paint.

**shadcn names.** `@theme` aliases the semantic tokens to shadcn's vocabulary — `bg-card`,
`text-muted-foreground`, `border-border`, `bg-primary`, `text-destructive`, `bg-muted` — so shadcn-style
components work unchanged. `bg-accent` is the exception: here it is the crest yellow.

A theme class can be nested: the KEDA section sits inside the night page, and the console's sidebar is a
`.theme-night` slab inside `.theme-console`. Tailwind utilities (`bg-bg`, `text-fg`, `text-muted`,
`border-line`, `bg-brand`, `text-accent`…) resolve against the nearest theme.

### 3. Component

`--btn-h 3rem` · `--btn-px 1.5rem` · `--card-radius 6px` · `--field-radius 6px` · `--nav-h 4.5rem` ·
`--gutter clamp(1rem, 4vw, 3rem)` · `--section-y clamp(4.5rem, 10vw, 9rem)` · `--cut 8deg`.

## Colour rules

- **Red is the brand, yellow is the accent, blue belongs to KEDA.** Blue never appears as a UI colour on
  the night site, and red never leads inside the KEDA section.
- **Yellow is a fill or large text on ink. Never text on a light surface** (1.2:1 on white).
- **`--brand` red is 3.9:1 on ink** — graphics, fills and large display type only. Small red text on ink
  uses `--brand-text` (red-400, 5.8:1).
- Status is never colour alone: live matches carry a label and a dot; console states carry a word.

Computed (WCAG 2 relative luminance), not estimated:

| Pair | Ratio |
|---|---|
| `--fg` on ink-950 | 18.1:1 |
| yellow-400 on ink-950 (and ink on yellow) | 17.0:1 |
| ink-300 (muted) on ink-950 | 9.7:1 |
| red-400 (`--brand-text`) on ink-950 | 5.8:1 |
| red-500 on ink-950 | 3.9:1 — large type and graphics only |
| white on red-500 (buttons, app band) | 5.0:1 |
| white on ink `#111113` (console primary) | 18.9:1 |
| blue-900 on paper-50 | 16.1:1 |
| blue-700 on paper-50 | 11.5:1 |
| blue-900 on cream-200 (motto chip) | 14.6:1 |
| `#4A5878` (KEDA muted) on paper-50 | 6.8:1 |
| `#6B6B74` (console muted) on `#F6F6F7` | 4.9:1 |
| `--ok` / `--warn` / `--danger` on white | 5.0 / 5.0 / 6.6:1 |

## Typography

| Role | Face | Use |
|---|---|---|
| Display | **Big Shoulders** 900, uppercase, line-height 0.88 | Hero, section titles, scores, numerals, button labels |
| Body | **Hanken Grotesk** 400–700 | Everything read at length; all console UI text |
| Tamil | **Anek Tamil** (variable width) | Tamil body, and Tamil display at `wdth 78`, weight 800 |

All three are self-hosted through `next/font`. No request goes to Google from a visitor.

**Tamil is not a string swap.** It has no capitals, taller glyphs and long unbreakable words:

- `.display` under `:lang(ta)` switches to Anek Tamil condensed, **line-height 1.18** (0.88 clips vowel signs)
  and drops the letter-spacing.
- Tamil has its own, smaller scale: `.hero-line1/2` and `.h-section` each have a `:lang(ta)` size. At the
  Latin size a single Tamil word is wider than a phone.
- Grid children holding headings need `min-w-0`, or one long word widens the whole column.
- **Check every layout change in `/ta` as well as `/en`.**

Scale: hero line 1 `clamp(5rem, min(21vw, 32svh), 17rem)` · hero line 2 half of that · section title
`clamp(2.75rem, 7.2vw, 4.75rem)` · body 1rem/1.125rem · eyebrow 0.875rem, 0.18em tracking, uppercase.

## Motion

Scroll is the trigger, with one exception: the home page's hero plays an entrance as it opens, and its
crest keeps floating. Nothing else autoplays beyond the marquee and the countdown.

| Pattern | Where | Notes |
|---|---|---|
| Layered parallax | Hero: founding year, two sashes, crest, headline each travel at a different speed | `components/site/Hero.tsx` |
| Hero entrance | Sashes slide in along their diagonal, the year drifts in, the crest springs in, the copy rises in turn | CSS only (`.hero-*` in `globals.css`), plays once |
| Float | Hero crest bobs; the floodlight breathes | CSS only, 6s / 9s, infinite |
| Countdown | Stands in for the whole public site until the opening (`OPENING` in `lib/site.ts`); signed-in staff see the site | `<OpeningCountdown>` — digits roll up as they change; at zero "we are open", then the home page loads |
| Parallax drift | Crest watermark, KEDA logo tile, the "KSC" ghost word | `<Parallax distance>` |
| Reveal | Section headings, cards | `<Reveal>` — 28px rise, 700ms, `--ease-out` |
| Count-up | Stats | `<CountUp>` — the server renders the final number |
| Marquee | Yellow band under the hero | CSS only, 32s linear |

Rules that were learned the hard way and must hold:

- **Server HTML is always fully visible.** `Reveal` hides content only after hydration and only if it is
  below the fold. Never render `opacity: 0` on the server. The hero entrance is the one exception that
  starts at `opacity: 0`, and it is a CSS animation, so it finishes with or without JavaScript.
- **Load animations move `translate` / `scale` / `rotate`, never `transform`.** The same hero elements
  carry Motion's parallax as an inline `transform`; animating `transform` in CSS would overwrite it.
- **Reduced motion is read after mount** (`usePrefersReducedMotion`), never during render — reading it
  during render is a hydration mismatch for every user who has it switched on.
- With reduced motion: no parallax, no reveal, no count-up, no hero entrance or float, countdown digits
  change in place, marquee stopped, smooth scroll off.
- Transitions 150–300ms on hover/focus; 700ms for reveals. Animate `transform` and `opacity` only.

## Components

**Button (`.btn`)** — skewed −8° with an upright label, 48px tall, Big Shoulders 800. Variants:
`btn-brand` (the one primary action in a view), `btn-accent` (yellow; install, notify), `btn-ghost`
(inset outline). Hover lifts 2px. The label must be wrapped in a `<span>`.

**Console kit** (`components/console/ui.tsx`) — nothing in the console is skewed; the diagonal stays on
the public side and the login panel. Cards are white with a hairline border and a 14px radius, no
shadow. Buttons are 44px, 9px radius, sentence case, ink-filled for the primary action. Headings are
Hanken Grotesk semibold — Big Shoulders is not used inside the console. A card is `CardHeader` (title +
one line of context + optional control) over its content; list rows are an `IconTile`, two lines of
text and a `Badge` or figure.

**Console shell** (`components/console/Shell.tsx`) — sidebar on the page background with small-caps
group labels and an ink pill for the current page; the working area is an inset rounded panel with a
sticky top bar (sidebar toggle, page search, theme toggle, account menu). The sidebar collapses to
icons on desktop and becomes a drawer on phones.

**Console charts** (`components/console/charts.tsx`) — hand-written SVG, no chart library: stacked
rounded bars and a donut. Every chart has a text summary for screen readers and its numbers repeated as
text beside it. On a phone a chart scrolls sideways rather than shrinking its labels.

**Match card** — status chip (LIVE red with pulsing dot / UPCOMING yellow / RESULT outline), two team
rows with a colour bar and `runs/wickets (overs)` in display numerals, a footer with result or time.

**Empty states** say what will appear and offer the next useful action. A section with nothing to show
that is not core to the page (news, gallery, stats at zero) is **not rendered at all**.

**Forms** — label above the field, hint below, error in a `role="alert"` note. 44px minimum targets.

## Layout

- Public site: `container-x` (82rem max, fluid gutter), sections separated by `--section-y`.
- Navigation links collapse to the menu below `xl` — in Tamil they stop fitting much earlier than in English.
- Console: ink sidebar on desktop, a horizontally scrolling strip on phones (scoring and scanning are
  phone jobs). Content area has no max width; tables need the room.
- Breakpoints to check: 375, 768, 1024, 1440. No horizontal page scroll at any of them.

## Do not

- Do not add a fee, invoice or payment surface to anything KEDA. The classes are free.
- Do not use yellow as text on a light surface, or gold/maroon from KCSC anywhere.
- Do not use emoji as icons — Lucide only.
- Do not skew, rotate or clip anything beyond the three uses of the diagonal.
- Do not ship a UI string in one language only.
- Do not hide content on the server and reveal it with JavaScript.

## Pre-delivery checklist

- [ ] Checked in `/en` **and** `/ta`, at 375px and 1440px
- [ ] Text contrast ≥ 4.5:1; red-500 and yellow only where the colour rules allow
- [ ] Visible focus on every interactive element (`--focus`)
- [ ] `prefers-reduced-motion` leaves a complete, static page
- [ ] Page is readable with JavaScript disabled
- [ ] Touch targets ≥ 44px; `cursor-pointer` on clickable things
- [ ] No raw hex in components
