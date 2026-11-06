# Presentation-readiness audit

An audit of CampusHub against the question "what would a lecturer notice, and what
would break the demo?" It covers the app as it exists today: the discovery feed, club
profiles, the member workspace, the admin dashboard, auth, comments, the partner
(AgroConnect) panels, and the supporting repository.

Scope rules for everything below:

- **No producer-data features.** The AgroConnect Opportunities idea is someone else's
  work and is deliberately excluded.
- **No requests for more producer fields**, and **no changes to the endpoints that feed
  consumer data**. Everything recommended is frontend, demo data, or an internal admin
  surface.
- Not a rewrite. Each item is sized S (under an hour), M (half a day), L (a day or more).

---

## Verdict

The product thinking is stronger than most student projects: two distinct shells for
visitors and members, a workspace built around the next event rather than a brochure
page, optimistic RSVP with a real waitlist, threaded discussion with reactions and
moderation, and an admin dashboard that can create events with capacity and promote
admins. The corkboard design language is consistent and distinctive.

What lets it down is **the last 10%**: three screens still look like unstyled
prototypes, the demo database is nearly empty in the places the design is best, several
failure paths leave the UI stuck or silent, and the app depends on the venue's internet
for fonts and every image. Those are exactly the things a live demo exposes.

---

## P0 — fix before presenting

### 1. The favicon 404s

`index.html` points at `/favicon.svg`, but `public/` contains only `_redirects` and
`images/`. The tab shows the browser's generic document icon, and every load logs a 404.

- **Fix:** add `public/favicon.svg` (a simple "C" pin/marker in the corkboard palette)
  and an `apple-touch-icon` if you want the bookmark to look deliberate. **S**

### 2. The demo database shows the best screens empty

Measured in the local database: **1 comment, 0 announcements, 0 signups, 0 pending admin
requests** across 7 clubs and 14 events.

Consequences at demo time:

- The member workspace's "Club feed" says "No activity yet."
- Nobody is "going" to the next event, so capacity and RSVP state look inert.
- The admin dashboard's request queue and the navbar badge are empty.
- Club discussion is a single orphan comment.

- **Fix:** seed a small, believable story for the two demo clubs — 2–3 announcements, a
  discussion thread with a reply and reactions, a handful of signups (one event at
  capacity so the waitlist shows), and one pending admin request. This is demo _data_,
  not a feature, and it makes features that already work visible. **S**

### 3. Every image and font is loaded from someone else's server

The seed data hotlinks **18 images** across `images.unsplash.com`, `media.istockphoto.com`,
`images.stockcake.com` and `static.vecteezy.com`, the dashboard fallback is
`https://placehold.co/600x300`, and all three typefaces come from Google Fonts.

On campus Wi-Fi, a blocked CDN, or an offline demo, this means grey boxes, a different
font, and visible layout shift. Some of those stock hosts also serve watermarked previews,
which looks careless in a graded presentation.

- **Fix:** copy the images the demo actually shows into `public/images/`, point the seed
  rows at those paths, and self-host the three fonts (or accept the metric fallback and
  set `font-display: swap`). At minimum, add an `onError` fallback to the local SVGs so a
  failed image never renders as a broken icon. **M**

### 4. My Events and Event Detail look like a different, unfinished app

Both pages are built with inline styles (`style={{ … }}` six times in `EventDetail`, three
in `MyEvents`, plus `NotFound`) while the rest of the app uses the corkboard system. My
Events renders plain bordered boxes with default buttons; Event Detail renders a raw
`<hr>` layout. A lecturer clicking "My Events" sees the polish drop immediately.

- **Fix:** rebuild both on the existing card tokens (`--color-card-bg`, `--shadow-card`,
  `--font-heading`, mono meta line) and reuse `EventCard` for the list. No new components
  are needed; the classes exist. **M**

### 5. Event Detail has three real bugs

- **RSVP can hang forever.** `handleSignup` awaits `saveSignup` with no `try/catch`. If the
  request fails (429, expired token, API down), the button stays disabled on
  "Signing Up..." with no message, because `setLoading(false)` never runs.
- **Events happening today are called past.** `const isPast = new Date(event.date) < new
Date()` parses a date-only string as UTC midnight, which is 03:00 in Nairobi. From 03:00
  onward on the event's own day, the page says "Event has already happened" — while the
  workspace correctly treats it as next up. Use the existing `isPastEvent` helper from
  `utils/dateTime.js`.
- **There is nowhere to see capacity or waitlist state**, so the detail page contradicts
  the workspace card that says "Join waitlist".

- **Fix:** wrap the signup in try/catch with an inline error, use `isPastEvent`, and show
  "X of Y spots taken" / waitlist text. **S**

### 6. When the API is down, the app looks empty instead of broken

`ClubsContext` captures `error` but no page ever reads it, so a stopped API renders an
empty discover feed. `EventDetail` has no `catch`/`finally` on `getAllEvents`, so a failed
request leaves the skeleton shimmering indefinitely. `Home` leaves the rejection
unhandled. During a demo, a crashed backend currently reads as "this app has no content".

- **Fix:** render `clubsError` as a retry banner, add a catch to the event loaders, and
  make skeletons time out into an error state. **S**

---

## P1 — cheap wins with visible payoff

### 7. Native `confirm()` dialogs in four places

Delete event, demote a club admin, delete a comment, and leave a club all use
`window.confirm`. It is functional and accessible enough, but it drops a Chrome dialog in
the middle of a designed interface and cannot be styled or screenshotted well.

- **Fix:** one small `ConfirmDialog` component (focus trap, Escape, `role="dialog"`) reused
  in those four call sites. **M**

### 8. A mid-demo token expiry has no graceful path

`getCurrentUser` clears a stale token on page load, but any 401 during the session throws
the server's message into whichever component made the call. The cached user stays
logged-in in the UI, so the app looks signed in while every action fails.

- **Fix:** in `apiFetch`, on 401 clear the token and route to `/login` with a
  "session expired" note. **S**

### 9. Past events still appear under "Browse Events"

`Home` filters events by category and search only, then sorts by date. Old events stay in
the list under a heading that promises upcoming ones. (Clubs and the workspace already
separate upcoming from history.)

- **Fix:** filter on `getEventTimestamp(event) >= Date.now()` for the events tab, or label
  a clearly separated "Past" group. **S**

### 10. My Events gives no feedback and cannot roll back

Cancelling is optimistic with no `catch`, so a failed delete removes the card while the
signup still exists on the server. There is no confirmation, no toast, and no waitlist
label.

- **Fix:** try/catch with restore-on-failure, a short toast, and a waitlist badge. **S**

### 11. Filter controls are invisible to screen readers

The category and view toggles on Home convey state only through colour, with no
`aria-pressed`, no result count, and no live announcement when the list changes. The
search input relies on a placeholder instead of a label. This is the kind of thing an
accessibility-aware marker checks first.

- **Fix:** `aria-pressed` on the toggles, a visually-hidden label for search, and a
  "12 clubs match" live region. **S**

### 12. Route changes do not reset focus or the document title

The whole app keeps one title ("CampusHub — Clubs & Events"), and keyboard focus stays on
the link that was clicked after navigation, so the next Tab continues from the old page.
The generic Navbar also has no skip link (the member shell has one).

- **Fix:** a tiny `useDocumentTitle` per page and a focus-to-`<main>` effect on location
  change; add the skip link to Navbar. **S**

### 13. No social preview

There is no `description`, `og:*`, `twitter:*` or `theme-color`, and no favicon to fall
back on. If the deployed URL is shared in WhatsApp or Teams before the presentation, it
renders as a bare URL.

- **Fix:** description, `og:title`, `og:description`, `og:image` (a static 1200×630 made
  from the corkboard palette), `theme-color`. **S**

### 14. Images have no dimensions and never lazy-load

Every `<img>` lacks `width`/`height` or an aspect-ratio, and none set `loading="lazy"`.
The Event Detail hero is full-width with unbounded height, so the page jumps as it loads
and the button moves under the presenter's cursor.

- **Fix:** aspect-ratio wrappers in CSS, `loading="lazy"` below the fold, eager + fixed
  dimensions for the hero. **S**

### 15. The audit trail is invisible

The audit log is one of the strongest "real application" things in the repo — who pinned,
deleted, promoted, denied, and when — and it is only reachable as JSON at
`GET /api/admin/audit`. Nobody will see it unless you show Postman.

- **Fix:** a read-only "Activity" tab on the tier1 dashboard that renders the same
  endpoint (it already returns `action`, `actor`, `targetType`, `createdAt`, `detail`).
  Internal endpoint only; the consumer contract is untouched. **M**

### 16. Two partner components are dead code

`PartnerProduce.jsx` and `PartnerFarmers.jsx` are not imported anywhere; `AgriClubSpotlight`
does the same fetching inline. During a code walkthrough that reads as leftovers.

- **Fix:** delete them, or have the spotlight use one of them. **S**

### 17. Dashboard announcement and delete paths are silent on failure

`handleDeleteEvent` has no `try/catch` around `deleteCustomEvent`, and posting an
announcement has no success or error feedback (the event form does have a toast). If the
API refuses, the UI looks like nothing happened.

- **Fix:** reuse the existing `saveMessage` toast and add a catch. **S**

### 18. The password reset flow cannot be completed from the browser

`ForgotPassword` tells the user a link was generated and to check the server console.
That honesty is good, but do not demo it cold.

- **Option A:** show it deliberately — trigger the reset, read the token from the API
  terminal, paste it into `/reset-password`. It demonstrates the whole flow and makes the
  missing email provider an explained integration gap rather than a broken feature.
- **Option B:** leave it out of the script.
- Either way, know which one you are doing before you present. **S**

### 19. Rate limiting can bite during a rehearsal

The API allows 100 requests per key per 60 seconds. Rapid page-hopping, several browser
tabs, or reloading during rehearsal can produce 429s that look like bugs.

- **Fix:** know the number, restart the API to reset the in-memory window, and keep a
  second API key in `API_KEYS` as a backup. Do not raise the limit for the demo. **S**

### 20. Seeded dates age

Events are seeded relative to `CURDATE()` at import time. If the database was loaded days
ago, the workspace's "Next up" card is empty and the agenda is all history.

- **Fix:** re-run the seed (or shift event dates forward) the morning of the presentation,
  and confirm the workspace shows a next event before you walk in. **S**

---

## What is already good — do not regress it

- **Two shells, one product.** Visitors get Navbar + discovery; members get the sidebar /
  bottom-bar workspace. The switch at join time is a genuinely nice moment to demo.
- **Optimistic RSVP with rollback and a mirrored waitlist** (`ClubWorkspace.toggleRsvp`),
  including the "you're on the waitlist" live-region announcement.
- **Skeletons that match the real shapes**, announce themselves with `role="status"`, and
  freeze under `prefers-reduced-motion`.
- **Accessibility basics already in place:** global `:focus-visible`, `aria-pressed` on
  reactions, labelled live regions for status notes, skip link in the member shell.
- **Workspace resilience:** `Promise.allSettled` per panel, so one failing feed does not
  blank the page.
- **Partner panels degrade honestly:** per-feed error states, and a "showing saved data
  from …" banner instead of faking live data.
- **Governance:** migrations with a duplicate-number guard, an audit trail, seed parity,
  and tests for the runner and the route rules.
- **CI:** lint, build and 18 server tests against a real MySQL container on every push.
- **A consumer-only OpenAPI contract**, which is the correct call for this project.
- **Small details:** ICS calendar export, quick-fill demo logins, debounced search,
  `_redirects` for SPA hosting, and honest empty states.

---

## Suggested 6-minute demo script (only features that exist)

1. **Logged out — discovery.** Search, filter by category, switch to Browse Events. Point
   at the corkboard card language. Open a club profile; show meeting cadence and tags.
2. **Join.** Sign up as a new member or use quick-fill, then join a club. The UI swaps to
   the member workspace — call that out, it is the product's core idea.
3. **Workspace.** Next event with capacity, RSVP (show a waitlist if the event is full),
   add to calendar, the agenda, then the club feed.
4. **Discussion.** Post a comment, reply to it, react, and pin it as the club admin. This
   is the richest interaction in the app; give it time.
5. **Admin.** Switch to Amara (tier1). Create an event with a capacity and a bring-note,
   post an announcement, approve the pending admin request, show the roster. Mention that
   the same actions write to the audit trail.
6. **Engineering.** 18 tests, CI green on the push, migrations with a real runner, audit
   rows, and the consumer-scoped OpenAPI contract. This is what separates the project
   from a CRUD demo.

Avoid unless rehearsed: password reset (console-only), rapid refresh loops (429), and
AgroConnect panels if the partner API is unreachable that day.

---

## Ordered work list

| Order | Item                                                                                   | Size | Presentation payoff                        |
| ----- | -------------------------------------------------------------------------------------- | ---- | ------------------------------------------ |
| 1     | Favicon + meta/social tags (#1, #13)                                                   | S    | Kills the "unfinished tab" tell            |
| 2     | Seed demo content: announcements, thread, signups, capacity, pending request (#2, #20) | S    | Makes existing screens look alive          |
| 3     | Local images + self-hosted fonts (#3)                                                  | M    | Removes the biggest live-demo failure mode |
| 4     | My Events + Event Detail on the design system (#4)                                     | M    | Removes the visible quality drop           |
| 5     | Event Detail bugs: stuck RSVP, today-is-past, missing capacity (#5)                    | S    | Prevents a demo-day dead button            |
| 6     | API-down and 401 states (#6, #8)                                                       | S    | Turns crashes into recoverable states      |
| 7     | Confirm dialog (#7)                                                                    | M    | Polish on destructive actions              |
| 8     | Home: past-event filter, `aria-pressed`, labels (#9, #11)                              | S    | Correctness + accessibility                |
| 9     | Focus/title/skip link on navigation (#12)                                              | S    | Accessibility depth you can mention        |
| 10    | Admin Activity tab over the audit endpoint (#15)                                       | M    | A governance story the audience can see    |
| 11    | Image sizing/lazy loading, My Events feedback, dashboard errors (#14, #10, #17)        | S    | Prevents layout jumps and silent failures  |
| 12    | Delete dead partner components (#16)                                                   | S    | Clean walkthrough                          |

Items 1, 2, 5, 6, 8, 9, 11 and 12 are frontend or seed-data only and touch no endpoint.
Items 4, 7 and 10 are frontend-only additions; item 10 reads an internal endpoint that
already exists.

The implementation plan for the P1 items is in [P1_PLAN.md](P1_PLAN.md).
