# P0 solutions

Deep-dive solutions for the six P0 items in [AUDIT.md](AUDIT.md). These are the items that
decide whether the live demo lands: the browser chrome, the data on screen, the assets, the
two unfinished-looking pages, the broken RSVP path, and what happens when the API is not
there. Each section gives the concrete change, code or SQL, and how to prove it.

Design input comes from the existing corkboard system (warm paper, dashed edges, mono for
scannable data) and from the frontend-design principles of committing to one deliberate
aesthetic instead of bolting on generic defaults. Nothing here introduces a second visual
language.

Scope is unchanged: no producer-data feature, no consumer-contract changes, no new runtime
dependencies.

## Decisions locked in the interview

- **Browser origins** — `CORS_ORIGINS` in `server/.env`; the Netlify origin is a value,
  not source. Implemented and verified in `e2cc0f7`.
- **Images** — download the Unsplash assets locally and replace the nine
  iStock/StockCake/Vecteezy previews with local poster SVGs; self-host the three font
  families as well.
- **Demo seed** — may delete the two route-test artifacts (`custom-1793959839359` and
  `comment-1793959839666`) and set `event-01` capacity to 4, in addition to inserting and
  refreshing `demo-*` content.

---

## 1. Favicon, touch icon, browser chrome

**Problem.** `index.html` links `/favicon.svg`, which does not exist. Every page load logs a
404 and the tab shows the browser's default document icon.

**Solution.**

1. Add `public/favicon.svg` — a pinned note, readable at 16px:

   ```svg
   <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="CampusHub">
     <rect width="64" height="64" rx="12" fill="#f3ecd9"/>
     <rect x="14" y="16" width="36" height="32" rx="2" fill="#fbf6e9"
           stroke="#c1432e" stroke-width="3" stroke-dasharray="5 4"/>
     <circle cx="32" cy="16" r="5" fill="#c1432e"/>
     <path d="M24 28h16M24 34h16M24 40h10" stroke="#24211d" stroke-width="2.5"
           stroke-linecap="round"/>
   </svg>
   ```

   The dashed border and pin read as the corkboard motif even at 16×16, and the mark
   survives forced-colors mode because it is shapes, not a font glyph.

2. Add `public/apple-touch-icon.png` (180×180, same artwork on `#f3ecd9`, no transparency)
   and the matching `<link rel="apple-touch-icon" …>` in `index.html`. Optional but removes
   the grey square on iOS bookmarks.
3. Do **not** add a web manifest yet: the app is not installable as a PWA and a manifest
   without icons at every size creates more Lighthouse noise than it removes.

**Acceptance.** No 404 on `favicon.svg`; icon legible in a 16px tab and in the bookmarks
bar; `/apple-touch-icon.png` returns 200 if added.

**Verify.** DevTools Network tab on a hard reload; visually check the tab at 100% and 200%
zoom.

---

## 2. Demo content, including removing the test artifacts

**Problem.** The database holds 7 clubs, 14 events, 8 users, **0 announcements, 0 signups,
0 pending admin requests and 1 comment** — and that one comment plus one event are leftovers
from the automated route tests:

- event `custom-1793959839359` — "Route test: waitlist 1793959839315" (capacity 1, club-01)
- comment `comment-1793959839666` — "Route test comment 1793959839660" (club-01)

So the discover feed and the club agenda currently show test noise, while the workspace
feed, discussion, roster counts, admin queue and "X of Y spots taken" are all empty.

**Solution.** A new `server/scripts/seed-demo.mjs`, run with `npm run seed:demo` (add the
script to `server/package.json`). It is idempotent, additive apart from the two known test
artifacts, and wrapped in a transaction. It does **not** wipe clubs, users, events or the
schema.

### What it seeds

Target the two clubs the demo script actually uses: `club-01` (Debate & Rhetoric, where
Sofia is a member and Leo is tier 2) and `club-07` (Agri, for the partner story).

| Table               | Rows                                                             | Why                                                                                        |
| ------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `announcements`     | 3 (2 × club-01, 1 × club-07)                                     | Fills the workspace feed with realistic posts                                              |
| `comments`          | 7 total: a pinned club thread with replies, two event comments   | The discussion is the richest interaction in the app                                       |
| `comment_reactions` | 4                                                                | Shows the reaction chips already populated                                                 |
| `event_signups`     | 4 on `event-01` (capacity 4) + 1 on `event-02` + 2 on `event-13` | Sofia joins `event-01` live → lands on the **waitlist**; `event-02` gives My Events a card |
| `admin_requests`    | 1 pending (Yuki for club-01)                                     | Gives the tier 1 dashboard something to approve on stage                                   |

Exact content (tune the wording, keep the shape):

```sql
-- club-01 announcements
('demo-ann-01', 'club-01', 'Room change: this week we are in the Seminar Hall, second floor.', NOW() - INTERVAL 2 DAY)
('demo-ann-02', 'club-01', 'Mentor sign-ups are open — reply in the thread if you can coach a novice pair.', NOW() - INTERVAL 1 DAY)
('demo-ann-03', 'club-07', 'Open Day on the 13th: we will walk through the AgroConnect listings and visit two farms.', NOW() - INTERVAL 6 HOUR)

-- club-01 thread
('demo-cm-01', 'club', 'club-01', 'user-07', 'Yuki Tanaka', 'Bring your opening statement — novices get paired with a mentor this week.', NULL, 1, NOW() - INTERVAL 3 DAY)
('demo-cm-02', 'club', 'club-01', 'user-05', 'Sofia Ramirez', 'Can I bring a friend who has never debated before?', 'demo-cm-01', 0, NOW() - INTERVAL 2 DAY)
('demo-cm-03', 'club', 'club-01', 'user-02', 'Leo Fischer', 'Yes — guests are welcome. We run a two-minute practice round first.', 'demo-cm-01', 0, NOW() - INTERVAL 2 DAY)
('demo-cm-04', 'club', 'club-01', 'user-06', 'Jamal Green', 'Is it still the seminar hall this week?', NULL, 0, NOW() - INTERVAL 1 DAY)
('demo-cm-05', 'club', 'club-01', 'user-02', 'Leo Fischer', 'Same room, second floor. Look for the red door.', 'demo-cm-04', 0, NOW() - INTERVAL 20 HOUR)
-- event thread on event-01
('demo-cm-06', 'event', 'event-01', 'user-08', 'Nadia Haddad', 'First time — is there anything to prepare?', NULL, 0, NOW() - INTERVAL 5 DAY)
('demo-cm-07', 'event', 'event-01', 'user-02', 'Leo Fischer', 'Just bring a notebook. We hand out the motion on the night.', 'demo-cm-06', 0, NOW() - INTERVAL 4 DAY)
```

Reactions (`comment_reactions` PK is `comment_id,user_id,emoji`):

```sql
('demo-cm-01', 'user-05', '👍'), ('demo-cm-01', 'user-06', '❤️'),
('demo-cm-01', 'user-08', '🎉'), ('demo-cm-02', 'user-07', '👍')
```

Signups. `event_signups` has `UNIQUE (event_id, user_id)`, so use
`ON DUPLICATE KEY UPDATE signup_id = signup_id` for idempotency:

```sql
UPDATE events SET capacity = 4 WHERE event_id = 'event-01';

-- event-01 is full with four people, so the demo login (Sofia) waitlists live
('demo-su-01', 'event-01', 'user-02')
('demo-su-02', 'event-01', 'user-06')
('demo-su-03', 'event-01', 'user-07')
('demo-su-04', 'event-01', 'user-08')
-- My Events already has one card
('demo-su-05', 'event-02', 'user-05')
-- Agri club counts
('demo-su-06', 'event-13', 'user-07')
('demo-su-07', 'event-13', 'user-08')
```

Each signup copies `name`/`email` into the snapshot columns from `users` in the same
statement, so the roster never shows stale names:

```sql
INSERT INTO event_signups (signup_id, event_id, user_id, name_snapshot, email_snapshot, created_at)
SELECT 'demo-su-01', 'event-01', 'user-02', name, email, NOW() - INTERVAL 3 DAY
FROM users WHERE user_id = 'user-02'
ON DUPLICATE KEY UPDATE signup_id = signup_id;
```

Pending request:

```sql
INSERT INTO admin_requests (request_id, user_id, club_id, status, created_at)
VALUES ('demo-req-01', 'user-07', 'club-01', 'pending', NOW() - INTERVAL 1 DAY)
ON DUPLICATE KEY UPDATE status = 'pending';
```

Cleanup of the two test artifacts, before inserting:

```sql
DELETE FROM comments WHERE comment_id = 'comment-1793959839666';
DELETE FROM events   WHERE event_id  = 'custom-1793959839359';
```

### Script shape

```js
// server/scripts/seed-demo.mjs
import "dotenv/config";
import { pool, assertDbConnection } from "../db.js";

const statements = [/* cleanup, capacity, announcements, comments, reactions, signups, request */];

async function run() {
  await assertDbConnection();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    for (const [sql, params] of statements) await conn.query(sql, params);
    await conn.commit();
    console.log(`Seeded demo content in ${statements.length} statements.`);
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
    await pool.end();
  }
}

run().catch((err) => {
  console.error("Demo seed failed:", err.message);
  process.exit(1);
});
```

### Ordering with the date problem

Run the date refresh first (P1 item #20), then the seed, so the four `event-01` seats belong
to an event that is still two days away. If `event-01` has already passed, the waitlist demo
has no next event to attach to.

**Acceptance.**

```sql
SELECT COUNT(*) FROM announcements;                   -- 3
SELECT COUNT(*) FROM comments;                        -- 7 (+0 test rows)
SELECT COUNT(*) FROM event_signups WHERE event_id = 'event-01'; -- 4
SELECT COUNT(*) FROM admin_requests WHERE status = 'pending';   -- 1
SELECT COUNT(*) FROM events WHERE event_id LIKE 'custom-%';     -- 0
```

Log in as Sofia → workspace feed has three items, discussion is populated, the next event
shows "4 of 4 spots taken", and clicking RSVP says she is on the waitlist. Log in as Amara →
one pending request, and the navbar badge shows `1`.

**Verify.** Run the script twice — counts must be identical (idempotency). Back up first:
`mysqldump -u root campushub > campushub-backup.sql`.

---

## 3. Local images and self-hosted fonts

**Problem.** 15 of the 17 club/event images are hotlinked, and the seed mixes four hosts:

| Host                    | Used by                             | Note                                                              |
| ----------------------- | ----------------------------------- | ----------------------------------------------------------------- |
| `images.unsplash.com`   | club logos 01–06, events 01, 03, 05 | Unsplash license permits use, but hotlinking still breaks offline |
| `media.istockphoto.com` | events 04, 06, 08, 09, 10           | Paid stock **previews** — not licensed for a graded submission    |
| `images.stockcake.com`  | events 02, 07, 11                   | Same concern                                                      |
| `static.vecteezy.com`   | event 12                            | Same concern                                                      |

Fonts load from Google Fonts, so a blocked CDN changes the whole look.

**Solution — two independent fixes.**

### 3a. Replace the stock-photo hotlinks with local artwork

Do not commit iStock/StockCake/Vecteezy previews. Two acceptable paths:

1. **Recommended:** keep the six Unsplash club logos and the three Unsplash event photos
   (download them locally), and replace the nine stock images with local poster SVGs in the
   corkboard palette. They are tiny, offline-proof, license-clean, and they make the demo
   look art-directed rather than stock-photo generic.
2. Substitute different Unsplash photos for the same events. Faster, but heavier and still
   needs local copies.

Asset layout and naming:

```
public/images/clubs/club-01.jpg    200×200, cropped, ~15 KB each
public/images/events/event-01.jpg  800×600, WebP + JPEG fallback
public/images/events/event-02.svg  local poster for the stock-photo events
```

Download once and commit; do not rely on a build step:

```bash
curl -L "https://images.unsplash.com/photo-…&w=400&q=75" -o public/images/clubs/club-01.jpg
```

Then update both the seed file (`server/campushub_database.sql`) **and** the live rows so the
demo and future imports agree:

```sql
UPDATE clubs  SET logo_url  = '/images/clubs/club-01.jpg'  WHERE club_id = 'club-01';
UPDATE events SET image_url = '/images/events/event-02.svg' WHERE event_id = 'event-02';
```

Keep one remote URL on purpose? No — leaving a single remote image in the demo reintroduces
the failure mode.

### 3b. Self-host the three fonts

Download the exact families and weights already referenced:

- Space Grotesk 500, 600, 700
- IBM Plex Sans 400, 500, 600
- IBM Plex Mono 400, 500

Prefer the `woff2` files from the Google Fonts download or google-webfonts-helper. Put them
in `public/fonts/` with the OFL licence text, then add to `src/styles/theme.css`:

```css
@font-face {
  font-family: "Space Grotesk";
  src: url("/fonts/space-grotesk-600.woff2") format("woff2");
  font-weight: 600;
  font-display: swap;
}
/* …one block per weight; declare 400 as the body default… */
```

Remove the two `preconnect` links and the Google Fonts stylesheet from `index.html`, and
preload only the two files used above the fold:

```html
<link rel="preload" href="/fonts/space-grotesk-600.woff2" as="font" type="font/woff2" crossorigin />
<link rel="preload" href="/fonts/ibm-plex-sans-400.woff2" as="font" type="font/woff2" crossorigin />
```

`font-display: swap` plus the existing fallback stack means text is readable immediately even
if a font file fails.

**Acceptance.** With DevTools set to Offline and cache disabled, a hard reload shows every
image, the local fonts, and no broken-image icons. The Network panel lists no requests to
Google, Unsplash, iStock, StockCake or Vecteezy. Total added weight under ~1.5 MB.

**Verify.** Offline reload; count external hosts in the Network panel; `npm run build` and
check the build output size.

---

## 4. My Events and Event Detail on the corkboard system

**Problem.** Both pages use inline styles and default buttons while the rest of the app uses
the corkboard tokens. The drop in quality is immediate and obvious.

**Design direction.** Keep the existing metaphor instead of inventing a second one: My Events
is a **programme of pinned tickets**, Event Detail is a **poster page**. Same paper, same
dashed edge, same mono metadata, same rotation quirk (≤0.6°) as `ClubCard`.

### 4a. My Events (`MyEvents.jsx` + new `MyEvents.module.css`)

- Page: `max-width: 760px`, centred, `padding: var(--space-xl) var(--space-lg)`.
- Header: eyebrow in mono uppercase ("Your calendar"), `<h1>My events</h1>`, and a count line
  ("2 upcoming") so the page never feels empty even with one card.
- Each signup is a **ticket row**:
  - Left stub: month abbreviation + day in mono, separated by a dashed vertical rule —
    a visual nod to a torn ticket.
  - Body: title (heading font), date/time/location in mono meta (reuse `formatEventDate`),
    club name as a small uppercase label.
  - Status stamp: "Going" in secondary teal, or "Waitlist · position N" in accent yellow.
  - Actions: "Details" link + "Cancel RSVP" as a quiet danger-ghost button.
- States: loading keeps `CardStackSkeleton` but in ticket proportions; empty state gets a
  short line plus a "Browse events" link; error state reuses the shared `ErrorState`.
- Responsive: below 640px the stub shrinks to 56px and actions move to a full-width footer
  row; tap targets ≥ 44px.

Sketch:

```css
.ticket {
  display: grid;
  grid-template-columns: 84px 1fr auto;
  gap: var(--space-md);
  align-items: center;
  background: var(--color-card-bg);
  border: 1px dashed var(--color-border);
  border-radius: var(--radius);
  box-shadow: var(--shadow-card);
  padding: var(--space-md);
  transform: rotate(-0.4deg);
}
.ticket:nth-child(even) {
  transform: rotate(0.4deg);
}
.ticket:hover {
  transform: rotate(0deg) translateY(-2px);
  box-shadow: var(--shadow-card-hover);
}

.stub {
  display: grid;
  place-items: center;
  gap: 2px;
  border-right: 1px dashed var(--color-border);
  font-family: var(--font-mono);
  text-transform: uppercase;
}
```

### 4b. Event Detail (`EventDetail.jsx` + new `EventDetail.module.css`)

- Poster header: the image sits on a paper mat with a 2px offset shadow and a pin dot,
  `aspect-ratio: 16 / 9`, `object-fit: cover`, `max-height: 360px`.
- Eyebrow: category + club name in mono uppercase, like `ClubCard`'s badge.
- `<h1>` in heading font; short description in body text with a `max-width: 65ch`.
- Metadata as a **mono spec strip**: Date, Time, Location, Spots — four cells separated by
  dashed rules, wrapping to two columns under 640px.
- RSVP panel: on ≥900px, a right-hand sticky card that stays visible while the description
  scrolls; below that, the panel moves directly under the title. It holds the primary RSVP
  button, capacity text, waitlist state, and "Add to calendar".
- Comments keep their existing section below, separated by the same dashed rule used on the
  club page — not a raw `<hr>`.
- Past events: a muted "This event has passed" banner instead of only a disabled button.
- Missing event: an empty-state card with a link back to discovery.

**Accessibility.** One `<h1>` per page, `<time dateTime>` for dates, `role="status"` for RSVP
messages, focus ring inherited from `theme.css`, no colour-only status (the waitlist stamp
also has text).

**Acceptance.** `grep -n 'style={{' src/pages/MyEvents.jsx src/pages/EventDetail.jsx` returns
nothing; both pages use only theme tokens; at 375px, 768px and 1280px nothing overflows and
the RSVP action stays visible without zooming.

**Verify.** Manual at the three widths; compare side by side with `ClubCard` and the
workspace so the paper colour, radius and mono sizing match exactly.

---

## 5. Event Detail correctness

**Problem.** Three real bugs, all in `src/pages/EventDetail.jsx`:

1. `handleSignup` awaits `saveSignup` with no `try/catch`; on failure the button stays
   disabled on "Signing Up..." forever.
2. `const isPast = new Date(event.date) < new Date()` parses the date-only string as UTC
   midnight, which is 03:00 in Nairobi — so from 03:00 on the event's own day the page says
   it already happened, while the workspace correctly treats it as next up.
3. Capacity and waitlist state are not shown, so the page contradicts the workspace.

**Solution.**

```jsx
import { isPastEvent, formatEventDate } from "../utils/dateTime";
import { getSignups, saveSignup, deleteSignup } from "../utils/storage";
import { useClubs } from "../context/ClubsContext";
import { downloadEventIcs } from "../utils/calendar";

const { clubs } = useClubs();
const club = clubs.find((c) => c.id === event.clubId);
const [signup, setSignup] = useState(null); // replaces the alreadySigned boolean
const [loading, setLoading] = useState(false);
const [message, setMessage] = useState("");
const [error, setError] = useState("");

useEffect(() => {
  if (!user || !event) return;
  let cancelled = false;
  getSignups()
    .then((mine) => !cancelled && setSignup(mine.find((s) => s.eventId === event.id) ?? null))
    .catch(() => !cancelled && setSignup(null));
  return () => {
    cancelled = true;
  };
}, [user, event]);

const past = isPastEvent(event);
const taken = event.signupCount ?? 0;
const full = event.capacity != null && taken >= event.capacity;

async function handleSignup() {
  setLoading(true);
  setError("");
  try {
    const saved = await saveSignup({ eventId: event.id });
    setSignup(saved);
    setMessage(saved.waitlisted ? "You're on the waitlist." : "You're going.");
  } catch (err) {
    setError(err.message);
  } finally {
    setLoading(false);
  }
}

async function handleCancel() {
  setLoading(true);
  setError("");
  try {
    await deleteSignup(signup.id);
    setSignup(null);
    setMessage("Your RSVP was cancelled.");
  } catch (err) {
    setError(err.message);
  } finally {
    setLoading(false);
  }
}
```

Rendering rules:

| State                     | Button label                       | Extra                              |
| ------------------------- | ---------------------------------- | ---------------------------------- |
| not logged in             | "Log in to RSVP" (link)            | —                                  |
| past                      | "This event has passed" (disabled) | comments still work                |
| signed up, not waitlisted | "Can't make it" (secondary)        | "You're going" status              |
| signed up, waitlisted     | "Leave waitlist"                   | "You're on the waitlist" in accent |
| full, not signed up       | "Join waitlist"                    | "4 of 4 spots taken · full"        |
| space left                | "I'm going"                        | "2 of 6 spots taken"               |

Also add "Add to calendar" (`downloadEventIcs(event, club?.name)`), and show an inline error
paragraph with `role="alert"` above the button, next to the existing message.

**Acceptance.** Stop the API, click RSVP → error message, button re-enables, no stuck state.
An event dated today with a later time shows "I'm going", not "already happened". A full
event shows "Join waitlist" and the waitlist state after signing up.

**Verify.** Manual with the API stopped; create a today event through the dashboard and open
its detail page; check a full event (`event-01` after the demo seed).

---

## 6. Failure states instead of empty ones

**Problem.** `ClubsContext` captures `error` but no page reads it, so a stopped API renders
an empty feed. `EventDetail`'s loader has no `catch`/`finally`, so it shimmers forever. The
app cannot distinguish "no data" from "no server".

**Solution.**

1. **One shared component**, `src/components/ErrorState.jsx` + module:

   ```jsx
   export default function ErrorState({ title = "Can't load this right now", message, onRetry }) {
     return (
       <div className={styles.wrap} role="alert">
         <p className={styles.title}>{title}</p>
         {message && <p className={styles.body}>{message}</p>}
         {onRetry && (
           <button type="button" className={styles.retry} onClick={onRetry}>
             Try again
           </button>
         )}
       </div>
     );
   }
   ```

   Styled as a dashed paper card with a danger-toned left rule, not a red alert box.

2. **A timeout in `apiFetch`** so no request can hang a skeleton indefinitely:

   ```js
   const controller = new AbortController();
   const timer = setTimeout(() => controller.abort(), 10_000);
   try {
     const response = await fetch(url, { ..., signal: controller.signal });
     ...
   } catch (err) {
     if (err.name === "AbortError") throw new Error("The server didn't respond in time.");
     throw new Error("Can't reach the server. Check that the API is running.");
   } finally {
     clearTimeout(timer);
   }
   ```

   Keep the existing JSON parsing and error-message behaviour; only the network failure path
   changes.

3. **Wire the contexts and pages:**
   - `Home`: `const { clubs, loading, error, refresh } = useClubs();` — if `error && clubs.length === 0`, render `ErrorState` in place of the grid, with `onRetry={refresh}`; keep the search controls usable.
   - `ClubProfile`, `ClubWorkspace`, `Dashboard`: same gate before their "not found" states, so a network failure is never reported as "this club does not exist".
   - `EventDetail`: add `loadError`; `try/catch/finally` around `getAllEvents`, then `ErrorState` with a retry that re-runs the loader. Distinguish "event not found" (after a successful load) from "couldn't load".
   - `ClubsContext.refresh`: clear `error` on success and keep the previous `clubs` list on failure, so a transient error does not blank a page that already had data.

**Acceptance.** Stop the API and load `/` → dashed error card with "Try again", not an empty
grid. Start the API, click Try again → clubs appear. Open an event URL with the API down →
error card, no infinite skeleton. With the API up but a bad event id → "Event not found", not
an error card.

**Verify.** Stop/start the API; DevTools offline; check the console has no unhandled promise
rejections on those paths.

---

## Order and verification

| Order | Item                                  | Size | Why this order                                         |
| ----- | ------------------------------------- | ---- | ------------------------------------------------------ |
| 1     | Favicon + apple touch icon (#1)       | S    | Independent, visible immediately                       |
| 2     | Failure states (#6)                   | S    | Makes every later test honest: a broken API is obvious |
| 3     | Event Detail correctness (#5)         | S    | The RSVP path is the demo's centrepiece                |
| 4     | Demo content + test cleanup (#2)      | S/M  | Needs #5 to show the waitlist correctly                |
| 5     | Local assets + fonts (#3)             | M/L  | Largest change, independent of the rest                |
| 6     | My Events + Event Detail restyle (#4) | M/L  | Do after #5 so it is styled against final images       |

Checks after each item: `npm run lint`, `npm run build`, and the manual pass named in that
section. Server behaviour is unchanged except for the new seed script, so the existing 18
tests stay valid; run them if `server/` was touched:

```bash
cd server
node --test --test-concurrency=1 tests/api-security.test.mjs tests/migrate.test.mjs tests/signups-comments.test.mjs
```

## Risks

- **Touching the demo database.** Back up with `mysqldump` first. The seed script only
  deletes two known test artifacts and its own `demo-*` rows.
- **Image licensing.** Do not commit iStock/StockCake/Vecteezy previews; that is the reason
  to replace them.
- **Restyle scope creep.** Keep the new CSS modules page-scoped and reuse tokens; do not
  refactor shared components while doing it.
- **Date drift.** The demo seed assumes `event-01` is in the future; run the date refresh
  before seeding.
