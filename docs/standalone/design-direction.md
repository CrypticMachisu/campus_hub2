# Standalone edition — design direction

Working notes for the independent build. This is the "dissect first" pass: what
the current app looks like, what it could become, and the three directions worth
prototyping before any component is touched.

Mockup boards: `docs/standalone/mockups/directions.html` (the three options)
and `docs/standalone/mockups/field-ledger.html` (the chosen direction, four
screens). Open either directly in a browser.

---

## 1. Constraints that actually shape the design

- **Local data only.** No partner feed, no waiting on another service. Every
  panel can render its final state immediately; nothing needs a "syncing" state.
- **Three roles, one product.** Visitor, member (sometimes a club officer), and
  site admin. The current app forks into two shells (member workspace vs generic
  discovery); the redesign should make the same content feel continuous.
- **Mobile-first reality.** Students will open this on a phone, on campus wifi,
  often one-handed, often outdoors. Contrast and tap targets outrank decoration.
- **Content types are fixed for now:** clubs, events (with capacity/waitlist),
  announcements, comments, opportunities/interest, admin requests, audit trail.
- **Kenyan campus context.** Names, places and dates are local (Nairobi,
  Kajiado, Karen). The visual language should feel authored here, not like a
  Silicon Valley template with a stock photo dropped in.

## 2. What the current "Corkboard" direction gets right

- It has a point of view: warm paper (`#f3ecd9`), ink (`#24211d`), marker red
  (`#c1432e`), teal (`#2f6e64`), and mono for anything scannable. That is already
  more distinctive than most club apps.
- Self-hosted Space Grotesk / IBM Plex Sans / IBM Plex Mono: fast, offline, and a
  genuinely good pairing for "bulletin board".
- It handles real states: skeletons, error states, empty states, focus rings,
  reduced motion.

## 3. Where it breaks down

| Problem                                    | Evidence                                                                                                                                              |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Two design systems fighting                | `theme.css` says corkboard; `Home.module.css` still ships `#0070f3` blue pills, `#f9f9f9` boxes and `#ccc` borders from an earlier default.           |
| Every surface is special                   | Dashed borders, dotted paper background, pin dots, tilt, shadows, mono labels — all at once. Nothing recedes, so hierarchy depends on color alone.    |
| The metaphor costs credibility             | A pinned flyer reads "noticeboard", not "the place my club actually runs". For an officer managing capacity and waitlists, it looks like a prototype. |
| Type scale is improvised                   | Three families with ad-hoc `0.86rem`, `0.75rem`, `1.25rem` values. No scale, so headings don't form a ladder across pages.                            |
| Motion is absent                           | Only 0.2s hover transitions. Page changes, list reveals and state changes are instantaneous, which reads as unfinished rather than calm.              |
| Capabilities are thin for the surface area | Seven pages, but the home page is a filter bar plus cards. "What is happening this week, and what do I do about it?" is not the primary object.       |

## 4. The three directions

### A. Field Ledger — _recommended_

Documentary, warm, agricultural-modern. Paper is chalk-white, not cream; ink is
near-black; the accent is a deep leaf green with clay and sun as secondary
markers. Big editorial serif for statements, a neutral grotesk for reading, mono
only for times, places and counts.

| Token            | Value                     |
| ---------------- | ------------------------- |
| Background       | `#FAF7F0`                 |
| Ink              | `#16170F`                 |
| Leaf (primary)   | `#204C3A`                 |
| Clay (secondary) | `#C2542F`                 |
| Sun (highlight)  | `#E9B44C`                 |
| Border           | `#DFD8C8`                 |
| Display          | Fraunces (variable serif) |
| Body             | Instrument Sans           |
| Data             | JetBrains Mono            |

Layout: a 12-column editorial grid, asymmetric hero (7/5), hairline rules instead
of card shadows, full-bleed photography of hands/soil/campus, numbered sections.
Motion: 8px rises, 300–400ms, one idea per screen; no parallax.

Why it fits: the anchor club is agricultural, the audience is a campus, and the
app's job is credibility for officers plus belonging for members. Warm paper and
a serif carry both. It also photographs well with a phone camera, so the club can
supply its own imagery.

Risk: warm palettes drift into "farmers' market" kitsch. Guardrail: keep the
serif for statements only, use green at most twice per screen, and let white
space do the work.

### B. Night Market — high-energy modern

Near-black canvas, acid lime, coral. Space Grotesk headings, Inter body, heavy
weight contrast, marquee ticker, tilted event cards.

| Token          | Value         |
| -------------- | ------------- |
| Background     | `#0B0C0A`     |
| Surface        | `#151711`     |
| Lime (primary) | `#D9FF57`     |
| Coral          | `#FF6B4A`     |
| Paper text     | `#F4F1E8`     |
| Display        | Space Grotesk |
| Body           | Inter         |

Motion: continuous marquee, magnetic buttons, scroll-linked reveals.

Trade-off: memorable and social, but dark themes on cheap Android screens plus
outdoor use hurt readability, and kinetic type ages fast. Also reads "nightlife",
which fights the 7:30am planting-day reality.

### C. Campus Press — institutional editorial

White, black, one electric blue. Archivo only. Zero radius, dense schedule
tables, blue used exclusively for links and the active state.

| Token      | Value                     |
| ---------- | ------------------------- |
| Background | `#FFFFFF`                 |
| Ink        | `#111111`                 |
| Blue       | `#1F3BFF`                 |
| Rule       | `#E4E4E4`                 |
| Type       | Archivo (400/500/600/700) |

Motion: 120ms underline and color changes only.

Trade-off: instantly credible and excellent for timetables, waitlists and admin
data; cold for a club community, and no obvious home for photography.

### Recommendation

**A, with C's data discipline for the officer views.** Field Ledger carries the
emotional side (belonging, place, season) and Campus Press's table rhythm gives
the dashboard, waitlist and audit views the density they need without inventing
a second visual language. B is the one to keep as a _campaign_ mode — a fair
poster, a ticket page — not the product shell.

## 5. Capability rethink (to settle in the interview)

The appearance work will expose these product questions; decide them before
hi-fi mockups so the layouts are honest:

1. **Home = this week.** One dated list ("next 7 days") plus one featured club,
   instead of a filter grid as the front door.
2. **Opportunities as real commitments.** Interest is a commitment with a spot
   count and a host, not a "maybe" list. That's the differentiation no generic
   club app has.
3. **Club page as a living noticeboard.** Next event, term plan, announcements,
   photos, officers — in that order.
4. **Officer workspace as a ledger.** Capacity, waitlist, attendance, requests,
   audit — one dense table language, no cards.
5. **Cut role confusion.** Members should never wonder which app they're in;
   the member shell and public pages should share chrome.

## 6. Skills: which one, and why

| Skill                                 | What it gives                                                                               | What it misses                                                        |
| ------------------------------------- | ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `elite-brand-design`                  | Personality → archetype → palette/type/tone → documented system. Exactly the missing layer. | No component code; needs `elite-design-core` for tokens.              |
| `elite-design-core`                   | Tokens, type scale, spacing scale, hierarchy, animation decision tree.                      | Doesn't choose a personality for you.                                 |
| `design-taste-frontend`               | Hard metric rules (spacing, type scale), bans generic AI defaults, component architecture.  | Opinionated toward one polished-SaaS look; weaker on warmth/place.    |
| `high-end-visual-design`              | Bans cheap defaults, specifies shadows/type/spacing that read "expensive".                  | Aesthetic is agency-luxury; risks feeling imported for a campus club. |
| `elite-inspiration`                   | Awwwards/FWA references by archetype.                                                       | Reference-only.                                                       |
| `elite-gsap` / `elite-css-animations` | Motion implementation.                                                                      | We don't need a motion library for the quiet direction.               |

**Recommendation:** run `elite-brand-design` + `elite-design-core` now to lock the
system (tokens, type scale, voice), use `elite-inspiration` while choosing
references, and defer the motion skills until the static design is right.

The user-visible difference: `elite-brand-design` decides _what this product
believes and feels like_; `design-taste-frontend` decides _how the code is
structured so it doesn't look generic_. They overlap only in typography and
spacing rules. After the direction is chosen, the best qualities of both can be
merged into one project-local skill (`campushub-design`) containing: the chosen
palette and type scale from brand-design, the metric rules and AI-slop bans from
design-taste-frontend, and the project's component conventions.

## 7. Interview questions

1. Direction: Field Ledger, Night Market, Campus Press, or Field Ledger + Campus
   Press tables?
2. Product: clubs and events done exceptionally, or also commitments/opportunities,
   or a social layer?
3. Motion appetite: quiet, confident, or expressive?
4. Name: keep CampusHub, or rename as part of this work?

---

## 8. Decisions locked — 16 November 2026

| Question     | Decision                                                                                  |
| ------------ | ----------------------------------------------------------------------------------------- |
| Direction    | **Field Ledger**, with **Campus Press**'s dense table language for officer and data views |
| Capabilities | All four tracks, phased (below)                                                           |
| Motion       | **Confident**: sparse reveals, one hero transition per page, state motion only            |
| Naming       | **Rename as part of the work**                                                            |

### Name candidates

| Name       | Meaning              | Why it works                                                                                                   | Risk                                                                          |
| ---------- | -------------------- | -------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| **Kesho**  | Swahili, "tomorrow"  | Short, sayable, forward-looking without being a cliché; works for events and commitments; reads well lowercase | Common word — check trademark and `.ke`/`.app` availability before committing |
| **Pamoja** | Swahili, "together"  | Leads with community, fits clubs and belonging                                                                 | Heavily used by NGOs and community organisations                              |
| **Mwanzo** | Swahili, "beginning" | A fresh-start story, good for a student audience                                                               | Longer, less immediate as a wordmark                                          |

**Recommendation: Kesho**, used as the working name in the mockups. Tagline:
_Show up tomorrow._ The rename should not touch code, the database or the
package name until the name clears a trademark and domain check.

### Build order for all four capability tracks

| Phase               | Scope                                                                                                          | Data work                                                                                               |
| ------------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| **1. Foundation**   | Brand, tokens, shell/nav, this-week home, club page, event page, auth screens                                  | None — current schema is enough                                                                         |
| **2. Commitments**  | Opportunities become commitments with spots, hosts and attendance; officer view gains capacity/waitlist tables | Rename `agro_opportunities`/`agro_interest` conceptually; migrate to `commitments`/`commitment_signups` |
| **3. Social**       | Club feed, threaded comments, photo posts, moderation flags                                                    | Posts, media and moderation tables                                                                      |
| **4. Multi-campus** | Campus entity, switcher, per-campus discovery, cross-campus commitments                                        | `campuses` table, `campus_id` on clubs, events and memberships                                          |

Phases 3 and 4 need their own design passes; they are named here so the
foundation doesn't paint us into a single-campus, single-feed corner.

### Skills for the build

- `elite-brand-design` — naming, personality, voice (now)
- `elite-design-core` — tokens and type/spacing scale (now)
- `elite-layouts` — page structure once components start
- `elite-accessibility` — required alongside any motion work
- `design-taste-frontend` — coding-time rule enforcer (metric rules, AI-slop bans)

After the mockups were approved, the tokens and enforcement rules were merged
into one project-local skill, `kesho-design`, with `skill-creator`: the palette,
type scale and voice from brand design; the spacing/metric rules, component
conventions and AI-slop bans from design-taste-frontend; and a written
accessibility contract (contrast, focus, targets, semantics, reduced motion,
reflow). It lives at `.agents/skills/kesho-design/SKILL.md` and should be loaded
for any UI work on this branch.

---

## 9. Alternatives explored — 16 November 2026

Kesho remains the chosen direction. Two further boards were built so the
choice is a comparison rather than a default, each with the same four screens,
the same seed data and an explicit accessibility mechanism. Neither is
implemented and neither replaces Kesho.

| Board                            | Organising idea                                | Type                           | Colour                                        | The bet                                                        |
| -------------------------------- | ---------------------------------------------- | ------------------------------ | --------------------------------------------- | -------------------------------------------------------------- |
| **Kesho** — `field-ledger.html`  | The week as an edited page, data as a ledger   | Fraunces / Instrument / Mono   | Paper `#FAF7F0`, leaf `#204C3A`, clay         | Warmth plus credibility; calm enough to live in every day      |
| **D. Signal** — `broadcast.html` | The campus as a daily edition with a live wire | Anton / Archivo / Plex Mono    | Newsprint `#F4F2EC`, ink, vermilion `#C63312` | Public-information energy; a lead story and numbered bulletins |
| **E. Orbit** — `orbit.html`      | The campus as a place; commitments as tickets  | Sora / Public Sans / Plex Mono | Night `#0B1020`, mint `#7CE0C3`, amber, rose  | Spatial memory and belonging; the officer view as a console    |

### D. Signal

Poster typography at the scale of a campus notice, a masthead with volume and
edition, a wire strip that pauses on hover, focus or a labelled button, and an
officer "desk" that inverts its table headers and stays quiet. It is the most
social of the three and the most likely to be photographed or screenshared.

Accessibility built into the board: 17.2:1 body text, a real pause control with
`aria-pressed`, wire content duplicated in the static timetable so nothing is
only-in-motion, 3px focus rings, written status ("waitlist open", "seats left"),
table captions and `th scope`, and a reduced-motion path that turns the crawl
into a wrapped list. Risk: the newsprint metaphor can read as pastiche, and
poster headlines crowd a small screen.

### E. Orbit

A dark, spatial commons where clubs are nodes around "you", commitments are
tickets with a tear-off stub, and the officer surface is a console with mini
bars and keyboard shortcuts. It is the most experimental and the most novel for
students.

Accessibility built into the board: a real Map/List switch (`aria-pressed` plus a
semantic table alternative, both visible without JS), a working Daylight theme
with every pair re-checked for AA, nodes as buttons with full accessible names,
skip link, 2px focus rings, 42–44px targets, decorative QR with a text code, and
`prefers-reduced-motion` removing every reveal. Risk: dark-first fails outdoors
if the toggle is missed, and spatial layouts invite keyboard hostility if the
list path is ever dropped.

### What to borrow if Kesho stays

- **Signal:** the wire strip for campus-wide notices on the home page, and
  numbered bulletins wherever a member scans four or five things quickly.
- **Orbit:** the ticket treatment for commitment detail and confirmation, and the
  map/list pairing as the accessible pattern for the multi-campus phase.
- **Both:** the pause-control, theme-toggle and list-alternative patterns are
  reusable accessibility primitives, independent of visual direction.

### Open decision

Pick the direction to implement in Phase 1. Staying with Kesho means the
`kesho-design` skill applies as written; choosing Signal or Orbit means rewriting
the tokens and component sections of that skill first, and re-checking every
contrast pair in the chosen palette.
