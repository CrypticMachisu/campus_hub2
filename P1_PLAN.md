# P1 implementation plan

Companion to [AUDIT.md](AUDIT.md). This covers the P1 items (#7–#20) — how each one would
be built, which files change, how to prove it works, and in what order.

Still out of scope, as agreed:

- No producer-data feature and no requests for more producer fields.
- No changes to the endpoints that feed consumer data. The audit page reads an internal
  admin endpoint that already exists.
- No new runtime dependencies. React 18, React Router 6, plain CSS modules. (Adding
  React Testing Library is a separate decision — see "Open decisions".)

---

## Sequencing

Build the shared pieces first, then the page-level fixes, then the read-only admin
surface. Each item is one commit, independently revertible.

| #   | Item                                                      | Depends on                | Size |
| --- | --------------------------------------------------------- | ------------------------- | ---- |
| 1   | Session-expiry handling (#8)                              | —                         | S    |
| 2   | Route titles, focus, skip link (#12)                      | —                         | S    |
| 3   | Confirm dialog primitive (#7)                             | —                         | M    |
| 4   | Home: past-event filter + accessible filters (#9, #11)    | —                         | S    |
| 5   | Image dimensions, lazy loading, local fallback (#14)      | —                         | S    |
| 6   | Dashboard silent-failure fixes (#17)                      | Confirm dialog (#7)       | S    |
| 7   | My Events feedback and rollback (#10)                     | —                         | S    |
| 8   | Social/meta tags and favicon (#13)                        | Hosting URL decision      | S    |
| 9   | Admin Activity page (#15)                                 | Route regs (#12, for nav) | M    |
| 10  | Delete dead partner components (#16)                      | —                         | S    |
| 11  | Demo operations: dates, reset, rate-limit notes (#18–#20) | —                         | S    |

The P0 items in AUDIT.md are prerequisites for part of this: Event Detail's stuck RSVP and
"today counts as past" (#5) should land before the capacity display or any rehearsal, and
the seed refresh (#2) before the Activity page has anything to show.

---

## Shared primitives

### A. Session expiry (#8)

**Problem.** A 401 mid-session leaves the cached user in place, so the UI looks logged in
while every action fails with the server's raw message.

**Plan.**

1. In `src/utils/api.js`, distinguish "login rejected" from "session expired":

   ```js
   const hadToken = Boolean(getToken());
   ...
   if (response.status === 401 && auth && hadToken) {
     clearToken();
     window.dispatchEvent(new Event("campushub:session-expired"));
     throw new Error("Your session expired. Please log in again.");
   }
   ```

   Guarding on `auth` keeps a wrong-password login (`auth: false`, 401) on the normal
   inline-error path instead of triggering a redirect loop.

2. `AuthContext` listens for the event and does `setUser(null)`.
3. A small `SessionExpiryWatcher` component **inside** `BrowserRouter` (AuthProvider sits
   outside the router today) listens for the same event and navigates:

   ```js
   navigate(`/login?expired=1&from=${encodeURIComponent(location.pathname)}`, { replace: true });
   ```

4. `Login` reads `expired` from `useSearchParams` and shows "Your session expired — log in
   again" above the form. Optionally navigate back to `from` after a successful login.

**Acceptance.** Clear the token in devtools, click an action that calls the API → login
page with the expiry note, no stale user in the navbar. Wrong password → inline error
only. Booting with an invalid stored token stays silent (handled by `getCurrentUser`).

**Verify.** Manual against the running API; `npm run lint`.

---

### B. Route titles, focus, and skip link (#12)

**Problem.** One title for the whole app, focus stays on the clicked link after
navigation, and the guest layout has no skip link.

**Plan.**

1. New `src/components/RouteEffects.jsx`, rendered inside `BrowserRouter`:

   ```js
   const TITLES = [
     [/^\/$/, "Discover clubs"],
     [/^\/discover$/, "Discover clubs"],
     [/^\/clubs\/[^/]+$/, "Club profile"],
     [/^\/events\/[^/]+$/, "Event"],
     [/^\/my-events$/, "My events"],
     [/^\/workspace\/[^/]+$/, "Club workspace"],
     [/^\/dashboard(\/|$)/, "Club dashboard"],
     [/^\/admin\/activity$/, "Activity"],
     [/^\/login$/, "Log in"],
     [/^\/forgot-password$/, "Reset your password"],
     [/^\/reset-password$/, "Choose a new password"],
   ];
   ```

   On `pathname` change: set `document.title` (`CampusHub — ${label}`) and focus
   `#main-content` with `{ preventScroll: true }`.

2. Add `<main id="main-content" tabIndex="-1">`:
   - `src/App.jsx` guest layout: wrap `<Routes>` (currently Navbar/Routes/Footer with no
     landmark).
   - `src/components/MemberShell.jsx`: rename its `<main id="workspace-main">` to
     `id="main-content"` and update the skip link's `href`.
3. Add the skip link to `src/components/Navbar.jsx` and copy the `.skipLink` styling from
   `MemberShell.module.css` into `Navbar.module.css`.
4. Optional second pass: entity pages (`ClubProfile`, `EventDetail`) call
   `usePageTitle(club?.name)` so the title names the club or event rather than a generic
   label.

**Acceptance.** First Tab reveals "Skip to content" in both layouts; activating it lands
on the main region. Navigating between pages changes the tab title. After navigation,
Tab starts inside the new page rather than continuing from the old navbar link.

**Verify.** Keyboard-only pass; `npm run build`; check `document.title` in devtools.

---

### C. Confirm dialog (#7)

**Problem.** Four destructive actions use `window.confirm`: delete event
(`Dashboard.jsx:217`), revoke club admin (`Dashboard.jsx:643`), delete comment
(`CommentSection.jsx:150`), leave club (`ClubWorkspace.jsx:206`).

**Plan.**

1. New `src/components/ConfirmDialog.jsx` + `ConfirmDialog.module.css`, built on the
   native `<dialog>` element:
   - `showModal()` gives focus containment, Escape handling and a `::backdrop` for free.
   - Props: `open`, `title`, `description`, `confirmLabel` (default "Delete"), `cancelLabel`,
     `tone` ("danger" | "default"), `onConfirm`, `onCancel`.
   - `aria-labelledby` / `aria-describedby` wired to the title and description; the danger
     action is focused on open; closing restores focus to the trigger (native `dialog`
     does this when opened from a button).
   - Backdrop click and Cancel both call `onCancel`; Escape via the dialog's `cancel` event.
2. New `src/components/ConfirmProvider.jsx` with `useConfirm()` returning an async
   function, so call sites stay close to today's shape:

   ```js
   const confirm = useConfirm();
   if (!(await confirm({ title: "Delete this event?", tone: "danger" }))) return;
   ```

   Provider mounts one `<ConfirmDialog>` and resolves a pending promise. Wrap
   `<AppRoutes />` inside `ErrorBoundary` in `src/App.jsx`.

3. Replace the four `window.confirm` calls. Each becomes an `await confirm(...)`, so
   `CommentSection.remove`, `ClubWorkspace.handleLeave`, `Dashboard.handleDeleteEvent` and
   `AdminManagementSection.handleRevoke` all become `async` where they are not already.

**Acceptance.** `grep -rn "window.confirm" src` returns nothing. Escape, backdrop and
Cancel all abort the action; only the confirm button performs it. Focus lands on the
danger button, then returns to the trigger. Screen readers announce title and description.

**Verify.** Manual on all four actions; keyboard-only and 200% zoom; `npm run lint`.

---

## Page fixes

### D. Home: past events and accessible filters (#9, #11)

**Files:** `src/pages/Home.jsx`, `src/pages/Home.module.css`.

1. Filter events with the existing helper rather than date strings:

   ```js
   import { getEventTimestamp } from "../utils/dateTime";
   const visibleEvents = events
     .filter((event) => getEventTimestamp(event) >= Date.now())
     .filter(matchesSearchAndCategory);
   ```

   Rename `upcomingEvents` accordingly so the name stops lying.

2. Accessibility:
   - Wrap the category buttons in `<div role="group" aria-label="Filter by category">` and
     add `aria-pressed={category === cat}` (plus "All categories").
   - Same for the clubs/events toggle: `role="group" aria-label="Browse"` with
     `aria-pressed`.
   - Give the search input an `id` and a visually-hidden `<label htmlFor>`; keep the
     placeholder as a hint, not the label.
   - Add one polite live region that announces the current result count after the 300ms
     debounce, e.g. "7 clubs match" / "3 events match".
3. Empty states stop quoting an empty search: show "No clubs in this category yet" when
   the query is blank, and "No clubs match …" only when there is a query.

**Acceptance.** An event dated yesterday does not appear under Browse Events; today's
later event does. Toggle buttons expose pressed state; a screen reader announces the
result count; the search field has an accessible name.

**Verify.** Insert a past event with SQL, confirm it is hidden; VoiceOver/Narrator pass on
the filter row.

---

### E. Images: dimensions, lazy loading, fallback (#14)

**Files:** `ClubCard.module.css`, `EventCard.module.css`, `EventDetail.jsx`,
`ClubProfile.module.css`, `ClubWorkspace.module.css`, plus a tiny helper in
`src/utils/` if the fallback logic is shared.

1. Reserve space so nothing jumps:
   - Club logo: fixed 64×64 (`aspect-ratio: 1`, `object-fit: cover`).
   - Event card thumb: 96×72 (`aspect-ratio: 4 / 3`).
   - Event Detail hero: wrapper with `aspect-ratio: 16 / 9`, `max-height: 360px`,
     `object-fit: cover`, `border-radius: var(--radius-lg)`.
2. Attributes: `loading="lazy" decoding="async"` on card and profile images; the detail
   hero stays eager with `fetchpriority="high"` because it is above the fold.
3. Fallback: `onError` swaps to a local asset (`/images/campus-life.svg` for clubs,
   `/images/club-fair.svg` for events) and removes the handler so it cannot loop. This
   also covers the hotlinked seed URLs from AUDIT.md #3.
4. Keep decorative images at `alt=""` (cards, where the name is adjacent) and the hero at
   `alt={event.title}`.

**Acceptance.** DevTools offline mode with images blocked → local SVG fallback, no broken
icon, no layout shift. Lighthouse CLS for Home under 0.1.

**Verify.** Network throttling + offline; `npm run build`.

---

### F. Dashboard silent failures (#17)

**Files:** `src/pages/Dashboard.jsx`, `src/pages/Dashboard.module.css` (toast only).

1. `handleDeleteEvent`: `try/catch` around `deleteCustomEvent`; on success clear selection
   and show "Event deleted."; on failure show `err.message` and keep the event selected. Add
   a `deletingId` state so the button disables while the request is in flight (prevents a
   double delete producing a spurious 404).
2. `handlePostAnnouncement`: `try/catch`, toast "Announcement posted." on success and the
   message on failure; clear the textarea only after success; disable the submit button
   while sending.
3. `AdminManagementSection`: wrap approve / deny / promote / revoke in `try/catch` and put
   the error in the existing `message` toast instead of leaving an unhandled rejection.
4. Make the toast an actual live region: `role="status" aria-live="polite"`, and clear it
   when `clubId` changes so a stale message does not follow you to another club. Add a
   dismiss timer only if it does not fight the existing `saveMessage` usage.

**Acceptance.** Stop the API, click Delete → error toast and the event stays in the list;
restart the API and retry → success toast. Posting an announcement with the API down keeps
the typed text.

**Verify.** Manual with the API stopped and restarted; `npm run lint`.

---

### G. My Events feedback (#10)

**Files:** `src/pages/MyEvents.jsx` (+ new `MyEvents.module.css` if it is restyled as part
of AUDIT.md #4).

1. `handleCancel`: keep the optimistic removal, but keep the removed item in a local
   variable, `try` the delete, and on failure reinsert it and show the error. Show
   "Cancelled your RSVP for …" on success.
2. Show waitlist state from the signup (`waitlisted`, `position`) as a small badge; the
   data is already returned by `/signups/mine`.
3. Add an empty-state action ("Browse events" link to `/discover`) rather than only a bare
   sentence.
4. When the page is restyled (#4), reuse `EventCard` for rows and keep the cancel button in
   a footer row; do not introduce a new card variant.

**Acceptance.** Failed cancel restores the card and explains why; successful cancel gives
confirmation; waitlisted signups are labelled; empty state offers a next step.

**Verify.** Manual with the API stopped mid-cancel; check a waitlisted signup renders the
badge.

---

### H. Social/meta tags and favicon (#13)

**Files:** `index.html`, `public/favicon.svg` (new), `public/og-image.png` (new), root
`.env.example`, optionally `vite.config.js`.

1. Favicon: a small SVG using the corkboard palette (`#f3ecd9` background, `#c1432e`
   marker). Also add `<link rel="apple-touch-icon" href="/apple-touch-icon.png">` only if
   that asset is produced.
2. Base meta:
   ```html
   <meta
     name="description"
     content="CampusHub — discover campus clubs, RSVP to events, and follow your club's workspace."
   />
   <meta name="theme-color" content="#f3ecd9" />
   <meta property="og:type" content="website" />
   <meta property="og:site_name" content="CampusHub" />
   <meta property="og:title" content="CampusHub — Clubs & Events" />
   <meta
     property="og:description"
     content="Discover campus clubs, RSVP to events, and follow your club's workspace."
   />
   <meta property="og:image" content="<absolute URL>/og-image.png" />
   <meta property="og:image:width" content="1200" />
   <meta property="og:image:height" content="630" />
   <meta name="twitter:card" content="summary_large_image" />
   ```
   Crawlers need absolute URLs. Since the deployment host is not settled, inject it at
   build time with a Vite plugin reading `VITE_SITE_URL` and replacing a `%SITE_URL%`
   placeholder, and document the variable in `.env.example`. If the variable is unset,
   leave the placeholder out of `og:image` entirely rather than shipping a broken URL —
   the plugin can strip the tag.
3. `og-image.png`: 1200×630, corkboard background, wordmark, one line of copy. Build it
   once from an SVG source; keep the source next to it for future edits.

**Acceptance.** `npm run build` output contains the tags; the favicon loads without a 404;
`og-image.png` is 1200×630 and under ~300 KB. Once deployed, a link preview in
opengraph.xyz shows title, description and image.

**Verify.** Inspect `dist/index.html`; fetch `/favicon.svg`; preview tool after deployment.

---

### I. Admin Activity page (#15)

**What exists.** `GET /api/admin/audit?limit` (`server/routes/admin.js`), tier1 only,
returns:

```json
{
  "entries": [
    {
      "id": 42,
      "actorId": "…",
      "actorName": "Amara Okafor",
      "action": "comment.pin",
      "targetType": "comment",
      "targetId": "…",
      "detail": { "pinned": true },
      "createdAt": "2026-11-06T09:12:00.000Z"
    }
  ]
}
```

Limit defaults to 50, clamps to 1–200.

**Plan.**

1. `src/utils/adminStore.js`: add
   ```js
   export function getAuditLog(limit = 50) {
     return apiFetch(`/admin/audit?limit=${limit}`).then((data) => data.entries);
   }
   ```
2. New `src/pages/AdminActivity.jsx` + CSS module:
   - Guard: if `user?.role !== "tier1"`, render a short "tier 1 only" panel with a link
     home (the server also returns 403, so this is courtesy, not security).
   - Load with skeletons (`SkeletonGroup` + `SkeletonListRow`), empty state, and an error
     state with Retry (reuse the pattern from ClubsContext once AUDIT.md #6 lands).
   - Row: human action label, `actorName`, target (`targetType` + short `targetId`), relative
     time (extract `formatRelativeTime` from `CommentSection` into `utils/dateTime.js` and
     reuse it rather than adding a third copy), and `detail` rendered as small mono chips.
   - Action labels: map every `action:` string passed to `recordAudit` (grep
     `server/` for `recordAudit(`); fall back to the raw string for unknown actions so a
     newly added action never renders blank. `comment.pin`/`comment.delete` are the ones
     already exercised by tests.
   - "Load more" appends another page (`limit = min(current + 50, 200)`) and hides itself
     when a page returns fewer than requested.
3. Route: add `/admin/activity` to both layouts in `src/App.jsx`. In `Navbar`, show an
   "Activity" link only for tier1. For members, the route still exists but renders the
   gate; alternatively redirect members to `/discover`.
4. Optional but cheap: add `server/tests/audit.test.mjs` covering (a) 403 for a non-tier1
   account, (b) newest-first ordering, (c) `limit` clamping at 1 and 200, (d) `detail`
   parsed as an object. It uses the same helpers as the existing suites and adds a few
   seconds to CI.

**Acceptance.** Pin a comment as a club admin, then open Activity as Amara: the entry
appears first with the actor, time and `{ "pinned": true }`. A member cannot see the nav
link, and the API returns 403 if they call it directly. Two "Load more" clicks stop at 200
entries.

**Verify.** Manual as tier1 and as Sofia; optional new server test; `npm run lint` and
`npm run build`.

---

### J. Delete dead partner components (#16)

**Finding.** `PartnerProduce.jsx` and `PartnerFarmers.jsx` are imported nowhere;
`AgriClubSpotlight` does its own fetching inline and uses `PartnerSkeletonCard`, which must
stay. `PartnerFarmers` also borrows `PartnerProduce.module.css`.

**Plan.** Delete both component files and `PartnerProduce.module.css`. Keep
`PartnerSkeletonCard` in `Skeleton.jsx`. If the team prefers to keep a reusable panel,
instead refactor `AgriClubSpotlight` to render `PartnerProduce`/`PartnerFarmers` — but that
is a larger change and the spotlight's layout differs, so deletion is the smaller correct
move.

**Acceptance.** `grep -rn "PartnerProduce\|PartnerFarmers" src` returns nothing;
`npm run lint && npm run build` pass; the Agri club page still renders its stats, growers
and listings.

---

## Demo operations (#18–#20)

### K. Password reset demo (#18)

No code required; decide and rehearse.

- **If demonstrating it:** request the reset for a demo account, copy the token from the API
  terminal, open `/reset-password?token=…`, set a new password, then run
  `cd server && npm run set-passwords` to restore `campushub123` for the seeded accounts.
  Changing a password without restoring it will break the next rehearsal.
- **If not demonstrating it:** leave it out of the script. Do not start the flow and hope.
- Optional copy fix in `ForgotPassword.jsx`: lead with the honest line ("This build has no
  email provider — the link is printed in the server console") instead of "we'll send you a
  link" followed by a correction.

### L. Rate limiting (#19)

Operational, no code. The API allows 100 requests per key per 60 seconds, in memory, per
process. A restart clears the window. For the demo:

- Rehearse the exact click path once; count the requests you trigger (each page load makes
  several).
- Keep a second key in `server/.env`'s `API_KEYS` as a fallback, and know that switching the
  frontend key requires a rebuild because `VITE_API_KEY` is baked in at build time.
- If a live demo starts returning 429, restart the API rather than explaining rate limits
  on stage.

### M. Seeded dates (#20)

Events are seeded relative to `CURDATE()` at import time, so they age out.

- **Option 1 (recommended):** a small SQL script, `server/scripts/refresh-demo-dates.sql`,
  that shifts every event forward so the earliest one is two days out:

  ```sql
  SET @shift := DATEDIFF(CURDATE(), (SELECT MIN(event_date) FROM events)) + 2;
  UPDATE events SET event_date = DATE_ADD(event_date, INTERVAL @shift DAY);
  ```

  Run it the morning of the presentation, after backing up. It shifts dashboard-created
  events too, which is fine for a demo database.

- **Option 2:** reload `server/campushub_database.sql` and rerun `migrate:baseline`,
  `set-passwords`, and the demo-content seed. Destructive — only when a clean slate is
  wanted anyway.

Verify afterwards: the member workspace shows a "Next up" card and at least one signup, and
the admin list has a pending request if the demo script calls for it.

---

## Cross-cutting verification

There is no frontend test runner wired up (root `package.json` has no `test` script, and
jest is only present for the API contract tests under `__tests__/`). Verification for these
items is therefore:

1. `npm run lint` and `npm run build` after each commit.
2. Manual keyboard pass on changed screens: Tab through, activate filters, Escape the
   dialog, confirm focus returns.
3. Manual failure pass with the API stopped and restarted.
4. Images: DevTools offline mode.
5. Server suites after the Activity route/test work:
   ```bash
   cd server
   node --test --test-concurrency=1 tests/api-security.test.mjs tests/migrate.test.mjs tests/signups-comments.test.mjs
   ```
6. Push to `main` and let CI confirm lint, build and server tests. CI does not test
   frontend behaviour — that is the manual list above.

Suggested commit messages are one line each, for example
`Handle an expired session instead of failing every action`.

---

## Open decisions

1. **Deployment origin.** The only Netlify reference in the codebase is the CORS allowlist
   in `server/server.js:82` (`https://effortless-shortbread-2ec7ef.netlify.app`). If that
   site is the live frontend, keep it; if it is dead, removing it narrows CORS to localhost.
   Either way, decide before writing `og:url`/`og:image`, and set `VITE_SITE_URL` to the
   real host. `public/_redirects` is also hosting-specific (SPA fallback); harmless to keep,
   but it does nothing outside a host that reads it.
2. **Dialog implementation.** Native `<dialog>` (less code, built-in focus containment and
   Escape) versus a custom `div` + focus trap. Recommendation: native.
3. **Activity placement.** Global `/admin/activity` (recommended, matches the global audit
   log) versus a section inside each club dashboard (would imply filtering the log by club,
   which the endpoint does not support).
4. **Audit route tests.** Adding `server/tests/audit.test.mjs` is optional; it is the only
   P1 item that touches the server, and the CI suite already proves the rest of the API.
5. **React Testing Library.** Not planned during presentation crunch. If the frontend
   tests are wanted afterwards, add `@testing-library/react` + `jsdom`, a `test` script,
   and a CI step — that is its own task.
