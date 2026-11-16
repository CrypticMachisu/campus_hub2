---
name: kesho-design
description: The Kesho design system for the standalone CampusHub build, using the chosen Signal direction (campus daily edition) — newsprint palette, Anton/Archivo/IBM Plex Mono type, masthead, pausable campus wire, numbered bulletins, officer desk tables, and a non-negotiable WCAG 2.2 AA contract. Use this skill whenever building, restyling, reviewing or adding any UI to Kesho / the standalone CampusHub branch: pages, navigation, event rows, club pages, commitments, officer tables, forms, empty states, motion, or accessibility fixes — even when the request does not mention design. Trigger on "Kesho", "CampusHub standalone", "Signal", "this-week home", "club page", "commitment", "officer desk", "wire", "theme tokens", "design system", or any styling work in `src/`.
---

# Kesho design system — Signal

Kesho (Swahili, "tomorrow"; tagline _Show up tomorrow_) is the standalone
CampusHub product: campus clubs, events, commitments and the officer desk. The
chosen direction is **Signal**, a campus daily edition: a lead story, numbered
bulletins, a live wire, and a quiet data desk for officers.

The mockup that defines the bar is `docs/standalone/mockups/broadcast.html`; the
reasoning and the comparison with the alternatives are in
`docs/standalone/design-direction.md`. The earlier Kesho/Field Ledger board
(`field-ledger.html`) is a kept alternative — do **not** mix its warm paper,
Fraunces or leaf green into Signal.

## Non-negotiables

These are why the system is worth following. If a request conflicts with them,
say so and propose the closest compliant version.

1. **AA contrast, minimum.** Body 4.5:1, large text 3:1, UI edges and focus
   indicators 3:1. Vermilion is a signal colour, not a body colour.
2. **Status is never colour alone.** "6 on the waitlist", "Seats left", "Waitlist
   open" are written out. Colour may reinforce, never carry, meaning.
3. **Motion is never the only channel.** The wire repeats in the static
   schedule; everything works with JS off and with reduced motion.
4. **Keyboard first.** Real `button`/`a`/`input`, visible `:focus-visible`, DOM
   order equals visual order, skip link on every page.
5. **44 px minimum** for primary controls; 24 px absolute floor for dense table
   actions.
6. **No dead ends.** Every list has an empty state with one next action; every
   error says what to do, inline and in text.

## Brand

- **Idea:** a well-edited campus paper, not a startup dashboard. The product
  reports what is happening, then lets you commit to it.
- **Voice:** plain, specific, civic. "The planting day is Saturday." Not
  "Unlock your weekend potential!"
- **Person:** second person for members ("Your commitments"), first-person
  plural for a club ("We leave at 7:30").
- **Place:** use the real geography in the data — Nairobi, Main campus, Kajiado,
  Karen, Ngong river bank. Never generic "City Campus".
- **Edition language** is allowed in navigation and labels (Today, The desk,
  Wire, Edition), but never at the cost of clarity: "Events", "Clubs",
  "Commitments" remain the primary nouns.
- **Name:** Kesho is the product name. Do not rename packages, the database or
  deployed URLs until the trademark/domain check clears; the user will say when.

## Tokens

Single source: `src/styles/theme.css` as CSS custom properties. Components use
`var(--token)`; a raw hex in a component file is a bug. (Existing leftovers in
`src/pages/Home.module.css` — `#0070f3`, `#f9f9f9` — are scheduled for removal.)

| Token           | Value     | Role and contrast                                       |
| --------------- | --------- | ------------------------------------------------------- |
| `--paper`       | `#F4F2EC` | Page background                                         |
| `--paper-2`     | `#EAE7DD` | Recessed bands, hover fills                             |
| `--card`        | `#FFFEF9` | Only where a surface must lift (stub, dialogs)          |
| `--ink`         | `#0E0F0C` | Body and headings · 17.2:1 on paper                     |
| `--ink-2`       | `#33352C` | Secondary prose · ~11:1                                 |
| `--muted`       | `#5C5E52` | Mono labels, metadata · 5.9:1 (never below 9px)         |
| `--signal`      | `#C63312` | Primary action, live markers, lead kicker · white 5.4:1 |
| `--signal-deep` | `#8F2209` | Signal text on paper · 7.8:1                            |
| `--tint`        | `#F8E4DE` | Attention band, dispatch callout                        |
| `--rule`        | `#C9C6B8` | Hairline rules and borders                              |

Rules of use: vermilion marks the live/urgent layer only — the wire label, the
lead kicker, the primary action, a waitlist count. Never body text, never a
decorative fill. One primary action per view. No gradients except photographic
placeholders (which must be labelled). No drop shadows except overlays.

## Type

**Anton** for display: headlines, club names, big numerals, stamps. Single
weight, uppercase, `line-height: 0.9`, tracking `-0.01em`. Never below 24 px,
never for a paragraph, never for a sentence a user must read quickly at small
size. **Archivo** for body and UI (400/500/600/700). **IBM Plex Mono** for
times, places, counts, labels, table heads, wire items and anything compared
down a column.

| Step     | Size                          | Use                                     |
| -------- | ----------------------------- | --------------------------------------- |
| Headline | `clamp(46px, 6.6vw, 82px)`    | One lead statement per page (Anton)     |
| Page     | `clamp(30px, 4vw, 44px)`      | Secondary page titles (Anton)           |
| Section  | `24–28px`                     | Section headings (Anton or Archivo 700) |
| Card     | `23–26px`                     | Event and club names (Anton)            |
| Body     | `16px / 1.55`, 62–68ch        | Prose                                   |
| Small    | `13px / 1.45`                 | Dense lists, table cells                |
| Label    | `11px` mono, `0.08em` tracked | Eyebrows, table heads, metadata         |
| Micro    | `9–9.5px` mono                | Only non-essential metadata             |

Four families is the hard ceiling; adding a fourth breaks the system.

## Layout

- 12-column grid, max 1180 px, 26 px page gutters; asymmetric splits (5/3,
  3/2) for lead and body.
- **Masthead pattern:** edition line (volume, date, live marker) → wordmark +
  section links + search/avatar → wire strip. On mobile the section links
  collapse to a labelled sheet; never an unlabelled hamburger.
- **Rules do the dividing:** 1 px hairlines, 3 px section rules, inverted black
  bands for "what else is on". Boxes are the exception, used for notices,
  tickets and the sign-up stub.
- Radius 2 px only (wire label, stamps); everything else square.
- Bulletin rows: numbered `01`, title, mono metadata, spots, arrow. Hover and
  focus **invert** the row rather than lifting it.
- Officer desk: one dense table language at 12.5–13 px, inverted `thead`,
  `th scope`, sticky totals, an audit strip in mono. No cards inside the table
  area; cards are for requests only.

## Components

- **Wire:** a black strip with a "Wire" label. Pausable by an explicit button
  with `aria-pressed`, and pauses on hover/focus. Items repeat in the static
  schedule. No wire on pages where it would be the only place an item appears.
- **Buttons:** vermilion fill for primary (`Join the work day`), black outline
  for secondary, text + arrow for tertiary. Min height 44 px. Hover darkens;
  pressed is a 1 px inset, not a bounce.
- **Capacity:** a 6 px rule with vermilion fill, always paired with "38 of 60
  going · 6 on the waitlist". Never a bare bar.
- **Chips:** uppercase mono, 1 px border, max two per row; membership may use a
  tint. Status chips always contain the status word.
- **Commitment:** notice number, dateline, headline, run sheet, bring list,
  host, updates, and a tear-off sign-up stub. The stub is the only sticky
  element, and becomes static under 940 px.
- **Club page order:** section front (name, deck, stats, photos) → next event →
  the term → dispatches → officers → join.
- **Forms:** label above input, 44 px height, error under the field with
  `aria-describedby`; never placeholder-as-label.
- **Empty states:** one sentence of what is missing, one action.

## Motion

Confident and sparse: 180 ms micro (hover, chip), 320 ms state (filter, expanding
row), 500 ms for one reveal per page (10 px rise + fade, 45 ms stagger), easing
`cubic-bezier(0.2, 0.7, 0.2, 1)`. Animate `opacity` and `transform` only. The
wire is the one continuous motion allowed, and only with a visible pause control
and a static duplicate. No parallax, no scroll-jacking, no auto-playing audio,
nothing that flashes.

Under `prefers-reduced-motion: reduce`: stops the wire, removes reveals and
transitions, keeps all content visible, and never depends on JS to reveal
anything.

## Accessibility contract (check before saying done)

- Landmarks: one `main`, labelled `nav`, ordered headings, page `lang`, skip
  link.
- Focus: 3 px vermilion ring, 3 px offset, visible on paper, black bands and
  vermilion fills; Escape closes overlays; focus returns to the trigger.
- Wire: explicit pause button with `aria-pressed`; pauses on hover/focus;
  duplicated statically; no item exists only in the crawl.
- Status: written text plus colour, never colour alone; counts include their
  units and the total.
- Tables: caption or labelled region, `th scope`, no layout tables; dense tables
  may scroll inside a labelled region with a visible affordance.
- Time: `<time datetime="2026-11-22T07:30+03:00">Sat 22 Nov</time>`.
- Images: meaningful `alt`; decorative images `alt=""`; photo placeholders are
  labelled and must be replaced with real alt text.
- Forms: labels, autocomplete, inline errors and an error summary; no
  colour-only validation.
- Live updates: polite `aria-live` for spot/waitlist changes after an action.
- Touch: 44 px targets, 8 px spacing between adjacent targets.
- Zoom/reflow: usable at 200% and 320 px; prose never scrolls sideways.
- Motion: honour reduced motion; no flashes over three per second.

## Anti-slop bans

No purple/blue SaaS gradients, glassmorphism, neon glows, emoji as icons,
floating pill clusters, three competing display faces, centered marketing
stacks, "elevate your campus experience" copy, invented testimonials or metrics,
or decorative dashboards that do not map to real data. If a screen needs a card,
shadow and gradient to look finished, the hierarchy is wrong.

## Repo conventions

- React + CSS Modules (`Component.module.css`); tokens only from `theme.css`.
- Self-host fonts (woff2, `font-display: swap`), subset Anton to display
  characters; no runtime Google Fonts link in the app.
- Reuse `Button`, `BulletinRow`, `EventRow`, `Wire`, `LedgerTable`, `NoticeStub`
  variants before inventing a new primitive.
- Keep mockups in `docs/standalone/mockups/` as single-file HTML; production
  code never imports from `docs/`.
- Signal's mockup is the visual source of truth; if a design question is not
  answered here, resolve it there first, then update this skill.

## Final pass

1. Squint: one lead statement, one primary action, no competing emphasis?
2. Keyboard-only: tab through; is focus always visible and every action
   reachable?
3. Wire: pause it, then check the same items exist in the static schedule.
4. Reduced motion: does anything stay invisible?
5. 320 px and 200%: prose reflows, controls reachable?
6. Contrast: check every muted/mono label against its real background.
7. Copy: would a student say it out loud?

For deeper motion or audit work, pair with `elite-accessibility` or
`elite-gsap` only when needed; the system above is the default.
