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

| Question     | Decision                                                                                              |
| ------------ | ----------------------------------------------------------------------------------------------------- |
| Direction    | **Signal** — the campus daily edition (chosen 16 Nov 2026); Field Ledger and Orbit kept as references |
| Capabilities | All four tracks, phased (below)                                                                       |
| Motion       | **Confident**: sparse reveals, one hero transition per page, state motion only                        |
| Naming       | **Rename as part of the work**                                                                        |

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
| **4. Multi-campus** | Campus entity, campus-scoped discovery, campus admin; cross-campus discovery later                             | `campuses`, email domains, `campus_id` on users and clubs                                               |

Phase 3 and Phase 4 now have implementation notes. Phase 4 deliberately stops
at the campus boundary: one campus per person and per club, no cross-campus
switcher yet. See [`phase-4-campus.md`](./phase-4-campus.md).

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

## 9. Directions explored — Signal chosen

**Signal was chosen on 16 November 2026.** The Field Ledger board (Kesho) and
Orbit were built as genuine alternatives — same four screens, same seed data,
an explicit accessibility mechanism each — and are kept on disk as references.
Neither is implemented.

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

### What carries over

- **Signal (chosen):** the wire strip, numbered bulletins, masthead, notice stub
  and inverted desk tables become the product shell.
- **Field Ledger (kept):** its reading order for club and commitment pages
  (next event → term → dispatches → people) and its capacity/table density
  remain good content structure; only its palette and type are retired.
- **Orbit (kept):** the ticket treatment for commitment detail and the map/list
  pairing as the accessible pattern for the multi-campus phase.
- **All three:** the pause control, static duplicate and list alternative are
  reusable accessibility primitives, independent of visual direction.

### Decision — Signal chosen (16 November 2026)

What changed, and what did not:

- The `kesho-design` skill was rewritten around Signal's newsprint tokens,
  Anton/Archivo/IBM Plex Mono type, masthead and wire rules, and desk tables.
  Its accessibility contract now includes the wire rules: explicit pause with
  `aria-pressed`, a static duplicate, and no information that exists only in
  motion.
- The product name remains **Kesho**. The trademark/domain check is still
  outstanding; nothing is renamed in code, packages or the database yet.
- The build order is unchanged: Phase 1 foundation, Phase 2 commitments, Phase 3
  social, Phase 4 multi-campus. Motion stays "confident", with the wire as the
  only continuous animation.

`broadcast.html` is the visual source of truth for Phase 1. `field-ledger.html`
and `orbit.html` stay in the repository as references, not as implementation
guides.

## Phase 2 — commitments (16 November 2026)

Opportunities were Agri-only, and they asked members to _register interest_ —
a soft signal the club then had to chase. Phase 2 replaces that with a
commitment: a dated activity with a host, a place and an optional capacity.

### Model

- `commitments` — one club, one kind (`farm_visit`, `tree_planting`, `harvest`,
  `volunteering`, `meeting`, `workshop`, `activity`), a start time in East Africa
  Time, an optional capacity and a host. `source` distinguishes seed rows from
  ones a club officer published.
- `commitment_signups` — one row per member per commitment (unique key), with
  name/email snapshots so the roster stays readable if a profile changes.
- Migration `013_commitments.sql` copies `agro_opportunities` and
  `agro_interest` into the new tables. The agro tables and `/api/v2/agro` routes
  remain during migration; no UI calls them.
- Waitlist position is computed on read from `(created_at, signup_id)`, so a
  withdrawal promotes the next person immediately and the member, the roster
  and the club page always agree. Existing event RSVPs use the same rule.
- Migration `014_comments_commitment_target.sql` widens the comments target
  enum so a commitment has its own discussion thread, like clubs and events.
- Migration `015_notifications.sql` adds targeted in-app notices, so a moved or
  cancelled commitment reaches the people who signed up instead of relying on
  the officer to chase them.
- Migration `016_commitment_reminders.sql` stamps `reminder_sent_at` on a
  signup after its reminder email is accepted, so a restart or a second sweep
  cannot send the same reminder twice.
- Migration `017_commitment_attendance.sql` adds `attendance` to each signup
  (`unknown`, `attended`, `no_show`). It lives on the signup row, so promoting
  someone from the waitlist never creates a second list to reconcile.

### Surface

- Every club page and the member workspace now carry **Commitments** — not just
  the Agri club. Members join or join the waitlist inline; officers get a
  publish form, a remove control and a roster panel with going/waitlisted
  counts and emails.
- `/commitments/:id` is the notice page: where and when, host, capacity meter,
  waitlist state, a withdraw control, a `Comments` thread and a one-way
  `Add to calendar` (.ics) download. It is public; signing up and commenting
  require a session and return to login otherwise.
- The officer **Desk** now carries the full commitment loop: a publish/edit
  form for every notice field, an inline seat editor, an inline cancel that
  names how many signups it will remove, and an expandable roster with
  positions, emails, waitlist state, at-the-door attendance and a remove
  control for withdrawals taken by phone. Lowering a capacity moves the newest
  signups to the waitlist; nobody is deleted. The roster summary reports how
  many are checked in and how many were marked no-show.
- A reminder worker emails people who are **going** to a commitment inside a
  24-hour window (configurable), through Resend's HTTPS API. It is off unless
  `RESEND_API_KEY` and `REMINDER_FROM` are set, with `EMAIL_REMINDERS=off` as a
  hard kill switch; only accepted sends are stamped, so failures retry on the
  next sweep. Waitlisted people are not reminded until a seat opens.
- "My commitments" merges event RSVPs and commitment signups into one stack,
  stamped `Going`, `Committed` or `Waitlist`, and withdraws through the right
  endpoint. The home rail mixes both, soonest first. A `Notices` section above
  the tickets carries targeted changes: a moved notice says what the old and
  new times were, a cancellation says the club removed it, and either can be
  marked read or cleared in one action.
- Signal treatment is unchanged: ruled rows, date stamps, a notice stub and
  mono metadata. The waitlist is never conveyed by colour alone — the button
  label, position and roster state all say it in words.

### Deferred

- Reminder delivery needs a verified Resend sender. No key or sender is
  committed; until `RESEND_API_KEY` and `REMINDER_FROM` are set the worker logs
  that it is off and sends nothing.
- Calendar export is a one-way .ics download. Subscribing or two-way calendar
  sync stays out of scope.
- Commitment comments use the same thread component as clubs and events; there
  is no separate moderation queue for them yet.
- Attendance is marked by an officer on the roster. There is no member
  self-check-in, QR code or attendance export yet.

## Phase 3 — club noticeboard (3a, 3b and 3c, 17 November 2026)

Text posts, photos and one editorial pin per club are implemented; reactions and
campus-wide search are not. Photo controls appear only when R2/S3 credentials
are set, so the text noticeboard never depends on storage being available. The
full design and setup notes live in
[`phase-3-social.md`](./phase-3-social.md).

### Model

- Migration `018_posts.sql` adds club posts (`published`, `hidden`, `removed`),
  a named author snapshot and a body capped at 2000 characters.
- Migration `019_reports.sql` adds member reports on posts and comments, one
  per reporter per target, scoped to a club. `resolution` records whether the
  item was hidden, removed or the report dismissed.
- Migration `020_comments_post_target.sql` widens the existing thread to
  `post`, so posts do not get a second discussion system.
- Migration `021_post_media.sql` adds up to three photos per post. A photo row
  starts pending when the API signs a direct upload; it becomes `ready` only
  after the post exists and the bucket confirms the object's size and type.
- Migration `022_pin_posts.sql` adds `pinned_at`. A club can have one standing
  notice; pinning another clears the previous pin in the same transaction.

### Surface

- A club page now carries **From the club** after Commitments: a dated column
  of officer dispatches, with `Earlier updates` rather than infinite scroll.
  Managers publish and edit inline, can pin one standing notice above the
  dated column, and can hide a post without leaving the page.
- `/posts/:id` is the permalink: the dispatch, its club, the shared comment
  thread and a report control. A hidden or removed post is readable only by a
  manager and says so.
- A manager's composer now takes up to three photos. Each needs a text
  description unless it is explicitly decorative, the picker is keyboard
  reachable, and uploads go straight to object storage rather than through the
  API. Photos appear as a band under the dispatch on the club page and at the
  permalink.
- Editing a post can remove one photo without deleting the dispatch. Removing
  a photo deletes the stored object; the row is not kept.
- The officer **Desk** has a **Posts** section: publish, edit, pin/unpin, hide,
  restore, remove, and a report queue showing the reason, note and number of
  reporters.
  The queue never shows who reported. `Hide` is reversible; `Remove` closes the
  public thread but keeps the row for the audit trail.
- Reports on comments appear in the same queue; removing one deletes the
  comment and closes every open report on it. The shared thread offers Report
  on club, event, commitment and post comments to signed-in readers who are
  neither the author nor a club manager.

### Deferred

- Reactions and campus-wide search (the rest of 3c).
- The home edition does not show posts. The club page and permalink remain the
  only reading surfaces.

## Phase 4 — campus boundary (18 November 2026)

One account belongs to one campus, one club belongs to one campus, and a reader
sees the clubs, events and commitments on their own campus. Strathmore
University is the seeded campus. Registration resolves the campus from the
email domain; an unknown domain is rejected rather than creating an account
with no campus.

The permission ladder is now `tier1` → `campus_admin` → `tier2` (club manager)
→ `member`. A campus admin manages every club on their campus, sees that
campus's reports and admin requests, and cannot reach another campus. Tier 1
remains platform-wide and assigns the campus role from the Dashboard.

Cross-campus discovery, a public campus switcher, multi-campus clubs and
multi-campus users are deferred to the cross-university phase. The full model
and verification notes live in [`phase-4-campus.md`](./phase-4-campus.md).
