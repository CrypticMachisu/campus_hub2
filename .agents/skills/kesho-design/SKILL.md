---
name: kesho-design
description: The Kesho design system for the standalone CampusHub build — Field Ledger palette, Fraunces/Instrument Sans/JetBrains Mono type scale, component and ledger-table conventions, confident motion, and a non-negotiable WCAG 2.2 AA accessibility contract. Use this skill whenever building, restyling, reviewing, or adding any UI to Kesho / the standalone CampusHub branch: pages, navigation, event rows, club pages, commitments, officer tables, forms, empty states, motion, or accessibility fixes — even when the request does not mention design. Trigger on "Kesho", "CampusHub standalone", "this-week home", "club page", "commitment", "officer ledger", "theme tokens", "design system", or any styling work in `src/`.
---

# Kesho design system

Kesho (Swahili, "tomorrow"; tagline _Show up tomorrow_) is the standalone
CampusHub product: campus clubs, events, commitments and the officer desk. The
approved visual direction is **Field Ledger**, with **Campus Press**'s dense
table language for officer and data views.

This skill exists so every screen looks like it came from the same hand. Read it
before writing UI, not after. The mockups that define the bar are in
`docs/standalone/mockups/field-ledger.html`; the reasoning is in
`docs/standalone/design-direction.md`.

`Signal` (broadcast/newsprint) and `Orbit` (dark spatial) are exploratory
boards in the same folder. Do **not** mix them into Kesho unless the user
explicitly picks one; they exist as comparisons.

## Non-negotiables

These are the reasons the system is worth following. If a request conflicts with
them, say so and propose the closest compliant version.

1. **AA contrast, minimum.** Body text 4.5:1, large text 3:1, UI boundaries and
   focus indicators 3:1. Never use the leaf green for small text on paper
   without checking; use `--leaf` for large type and surfaces, `--ink` for
   reading.
2. **Status is never colour alone.** "6 on the waitlist", "Seats left", "Bus
   confirmed" are written out. Colour may reinforce, never carry, the meaning.
3. **Keyboard first.** Every interactive thing is a real `button`, `a`, `input`
   or `select`; visible `:focus-visible` ring on every one; DOM order matches
   visual order; a skip link on every page.
4. **44 × 44 px minimum** for primary controls, 24 × 24 px absolute floor for
   dense table actions (WCAG 2.2 target size).
5. **Motion is optional by construction.** Everything must be legible and
   complete with `prefers-reduced-motion: reduce`, with JS disabled, and at
   200% zoom / 320 px width.
6. **No dead ends.** Every list has an empty state with a next action; every
   form error says what to do, inline and in text.

## Brand

- **Voice:** plain, specific, warm, unhurried. Campus-paper, not startup-pitch.
  "The planting day is Saturday." Not "Unlock your weekend potential!"
- **Person:** second person for members ("Your commitments"), first-person
  plural for the club ("We leave at 7:30").
- **Place:** use the real campus geography already in the data — Nairobi, Main
  campus, Kajiado, Karen, Ngong river bank. Never invent generic "City Campus".
- **Numbers are content:** spots, counts and times deserve mono and tabular
  figures, not decoration.
- **Name:** Kesho is the working product name. Do not rename packages, the
  database, or deployed URLs until the trademark/domain check clears; the user
  will say when.

## Tokens

Single source: `src/styles/theme.css` as CSS custom properties. Components use
`var(--token)`; a raw hex in a component file is a bug. (Existing leftovers in
`src/pages/Home.module.css` — `#0070f3`, `#f9f9f9` — are scheduled for removal.)

| Token         | Value     | Role                                              |
| ------------- | --------- | ------------------------------------------------- |
| `--paper`     | `#FAF7F0` | Page background                                   |
| `--paper-2`   | `#F3EEE2` | Recessed bands, hover fills                       |
| `--card`      | `#FFFDF8` | Only where a surface must lift (sign-up, dialogs) |
| `--ink`       | `#16170F` | Body and headings (16.9:1 on paper)               |
| `--ink-2`     | `#4A4638` | Secondary prose (9.1:1)                           |
| `--muted`     | `#6B6455` | Mono labels, metadata (5.6:1 — never below 9px)   |
| `--leaf`      | `#204C3A` | Primary action, links, one emphasis per screen    |
| `--leaf-dark` | `#183A2C` | Hover/pressed on leaf                             |
| `--leaf-tint` | `#E6EDE8` | Current day, selected rows, member chip           |
| `--clay`      | `#C2542F` | Attention: almost full, overdue — text only       |
| `--sun`       | `#E9B44C` | Highlight fills only, never text                  |
| `--rule`      | `#DFD8C8` | Hairline rules and borders                        |

Rules of use: leaf appears at most twice per screen (primary action + one
emphasis). Clay is for attention, not decoration. Sun is a fill behind dark
text, never a text colour. No gradients except photographic placeholders.

Type: **Fraunces** (variable serif) for statements — page titles, event names,
big numerals. **Instrument Sans** for reading and UI. **JetBrains Mono** for
times, places, counts, labels, table heads, and anything a user might compare
down a column. Never set a paragraph in mono or a data table in the serif.

| Step    | Size                          | Use                             |
| ------- | ----------------------------- | ------------------------------- |
| Display | `clamp(34px, 4.4vw, 52px)`    | Page statement, one per screen  |
| Title   | `clamp(24px, 2.4vw, 32px)`    | Section and club names          |
| Heading | `20px`                        | Card and rail headings          |
| Body    | `15px / 1.55`                 | Prose, 62–68ch measure          |
| Small   | `13px / 1.45`                 | Dense lists, table cells        |
| Label   | `11px` mono, `0.08em` tracked | Eyebrows, table heads, metadata |
| Micro   | `9px` mono                    | Only non-essential metadata     |

Use a 4 px space scale: 4, 8, 12, 16, 24, 32, 48, 64, 96. Layout: 12-column
editorial grid, max width 1180 px, 24 px gutters, asymmetric splits (7/5, 3/2).
Borders are 1 px `--rule`; radius 2 px; **no drop shadows** except overlays and
the mobile sheet. Hierarchy comes from size, weight, space and rules — not
boxes, pills or colour blocks.

## Components

- **Navigation:** wordmark left, four text links (This week · Clubs ·
  Commitments · My stuff), campus switcher and avatar right. Current page gets
  `aria-current="page"`, leaf underline. Mobile collapses to a labelled sheet
  trigger, never an unlabelled hamburger alone.
- **Buttons:** `Join the work day` (leaf fill, paper text), `See the term`
  (ghost, rule border), `Open workspace` (text + arrow). One primary per view.
  Hover moves 1 px at most; pressed state is a 1 px inset, not a bounce.
- **Event row:** date column (mono + serif numeral), title, club/place, spots,
  arrow. Rules between rows, hover fills `--paper-2` and shifts 4 px. The whole
  row is one link; the arrow is decorative.
- **Capacity:** a 4 px rule with leaf fill, always paired with "38 of 60 going ·
  6 on the waitlist". Never a bare progress bar.
- **Chips:** uppercase mono, 1 px border, no fill except `--leaf-tint` for
  membership. Max two per row.
- **Club page order:** identity → next event → term plan → announcements →
  officers → join. Photo strip may sit between identity and next event.
- **Officer desk:** one dense table language at 13 px, mono heads, `th scope`,
  row actions as text buttons, sticky totals, and an audit strip in mono. No
  cards inside the table area; cards are for requests only.
- **Forms:** label above input, 44 px control height, focus ring, inline error
  under the field with `aria-describedby`, never placeholder-as-label.
- **Empty states:** one sentence of what is missing, one action. No illustration
  required.

## Motion

Confident, not expressive: 180 ms for micro (hover, chip), 320 ms for state
(filters, expanding rows), 500 ms for one reveal per page (8 px rise + fade,
stagger 45 ms), easing `cubic-bezier(0.2, 0.7, 0.2, 1)`. Animate `opacity` and
`transform` only. One hero transition per screen; no parallax, no scroll-jacking,
no infinite marquees, no type that moves while being read.

Under `prefers-reduced-motion: reduce`, remove transforms and animation, keep
colour/opacity changes instant, and never hide content that only appears via
animation. Reveal content must be visible if JS fails.

## Accessibility contract (check before saying done)

- Semantic landmarks: one `main`, `nav` labelled, headings in order, no skipped
  levels, page `lang`.
- Focus: `:focus-visible` 2 px leaf ring with 2 px offset, visible on paper and
  on leaf fills; focus never trapped except in a modal, and Escape closes it.
- Images: meaningful `alt`; decorative images `alt=""`; photo placeholders
  labelled in the mockup, real `alt` in production.
- Tables: `<caption>` or labelled region, `th scope="col"/"row"`, no layout
  tables.
- Time and dates: `<time datetime="2026-11-22T07:30+03:00">Sat 22 Nov</time>`.
- Live updates: polite `aria-live` for spots/waitlist changes after an action;
  no announcement of purely visual state.
- Forms: labels, autocomplete, error summary, no colour-only validation.
- Zoom/reflow: usable at 200% and 320 px; no horizontal scrolling for prose;
  dense tables may scroll inside a labelled region with a visible affordance.
- Motion: honour reduced motion; no auto-playing media; nothing flashes more
  than three times per second.
- Touch: 44 px targets, 8 px spacing between adjacent targets.

## Anti-slop bans

No purple/blue SaaS gradients, glassmorphism, neon glows, emoji as icons,
floating pill clusters, three competing display faces, centered-everything
marketing stacks, "elevate your campus experience" copy, invented testimonials
or metrics, or decorative dashboards that don't map to real data. If a screen
needs a card, shadow and gradient to look finished, the hierarchy is wrong.

## Repo conventions

- React + CSS Modules (`Component.module.css`); tokens only from `theme.css`.
- Self-host fonts (woff2, `font-display: swap`); no runtime Google Fonts link in
  the app. Subset Fraunces (it is a variable font — ship one file, not six).
- Reuse existing primitives before adding new ones; ask whether a new component
  is a variant of `EventRow`, `Button` or `LedgerTable`.
- Keep mockups in `docs/standalone/mockups/` as single-file HTML; production
  code never imports from `docs/`.

## Final pass

1. Squint: is there exactly one primary action and one focal statement?
2. Keyboard-only: tab through the page; can you see where you are, and reach
   every action?
3. Reduced motion: does anything disappear or stay invisible?
4. 320 px: does prose reflow without sideways scrolling?
5. Contrast: check every muted/mono label against its actual background.
6. Copy: would a student say it out loud?

For deeper motion, layout or audit work, pair this with `elite-accessibility`,
`elite-layouts` or `elite-gsap` only when the task genuinely needs them; the
system above is the default and usually sufficient.
