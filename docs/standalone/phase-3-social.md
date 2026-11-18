# Phase 3 — the club feed, a design pass

**Status:** 3a, 3b and the pinning part of 3c are implemented 17 November 2026,
along with the purge for abandoned photo uploads, editing a published photo's
description, stored WebP thumbnails and per-photo moderation. Reactions and campus-wide search remain deferred until
there is evidence for them. Photo endpoints stay off until R2 credentials are
set; the code path is tested, but no real bucket upload has been run in this
environment.

Phase 2 answered “will you show up?”. Phase 3 answers the quieter question
between commitments: **what is this club doing?** The goal is a club
noticeboard, not a campus-wide social network. A member should be able to open
a club page and understand its voice in one scroll; an officer should be able to
post an update in under two minutes; a report should reach a human who can act
without reading a second inbox.

## Principles

- **A column of dispatches, not a feed.** Reverse chronological, finite, dated.
  No ranking, no infinite scroll, no engagement counters deciding what a club
  says. Signal already reads like an edited page; the feed should too.
- **The club is the publisher.** Posts are written by club officers. Members
  comment and report, but do not publish to the club page. This keeps the
  moderation surface proportional to the number of clubs, not members.
- **No global feed at launch.** The home edition stays curated (“This week”).
  Posts live on the club page and at a permalink. A campus-wide stream is a
  different product with a different moderation load.
- **Public to read, signed in to write.** Club pages and posts follow the
  commitment model: anyone can read, a session is required to comment or
  report, and the login return path is preserved.
- **Nothing disappears silently.** Manager actions hide or remove with a
  recorded reason; the author always sees that their post is no longer public.

## Model

The phase applied migrations `018_posts.sql`, `019_reports.sql`,
`020_comments_post_target.sql`, `021_post_media.sql` and
`022_pin_posts.sql`.

### 018 — posts (applied)

| Column                 | Type                                                        |
| ---------------------- | ----------------------------------------------------------- |
| `post_id`              | `VARCHAR(64)` primary key (`post-<timestamp>`)              |
| `club_id`              | `VARCHAR(30)` foreign key to `clubs`, cascade               |
| `author_id`            | `VARCHAR(30)` foreign key to `users`, set null on deletion  |
| `author_name_snapshot` | `VARCHAR(100)` not null                                     |
| `body`                 | `TEXT` not null, 1–2000 characters after trim               |
| `status`               | `ENUM('published','hidden','removed')`, default `published` |
| `created_at`           | `DATETIME` default now                                      |
| `updated_at`           | `DATETIME` auto-update                                      |

Index `(club_id, status, created_at)` for the club page;
`(status, created_at)` for a future review queue. `pinned_at` arrives in
migration 022 for the one standing notice.

### 019 — reports (applied)

| Column        | Type                                                  |
| ------------- | ----------------------------------------------------- |
| `report_id`   | `INT AUTO_INCREMENT` primary key                      |
| `target_type` | `ENUM('post','comment','media')`                      |
| `target_id`   | `VARCHAR(64)`                                         |
| `club_id`     | denormalized owner, so the queue is one indexed read  |
| `reporter_id` | foreign key to `users`, cascade                       |
| `reason`      | `ENUM('spam','harassment','off_topic','other')`       |
| `note`        | `VARCHAR(500) NULL`                                   |
| `status`      | `ENUM('open','actioned','dismissed')`, default `open` |
| `resolution`  | `ENUM('hidden','removed','dismissed') NULL`           |
| `created_at`  | `DATETIME` default now                                |
| `resolved_by` | `VARCHAR(30) NULL`, foreign key to `users`, set null  |
| `resolved_at` | `DATETIME NULL`                                       |

Unique key `(reporter_id, target_type, target_id)` so one person cannot pile
reports onto the same item. Index `(club_id, status, created_at)` and
`(target_type, target_id, status)`.

### 020 — comments on posts (applied)

Widened `comments.target_type` to `('event','club','commitment','post')` and
extended `clubForTarget` / `targetTable` in `server/routes/comments.js`. Post
comments are the existing thread, not a second comment system.

### 021 — post media (applied)

| Column        | Type                                                 |
| ------------- | ---------------------------------------------------- |
| `media_id`    | `VARCHAR(64)` primary key (`media-<uuid>`)           |
| `post_id`     | `VARCHAR(64) NULL`, foreign key to `posts`, cascade  |
| `club_id`     | `VARCHAR(30)` foreign key to `clubs`, cascade        |
| `uploader_id` | `VARCHAR(30) NULL`, foreign key to `users`, set null |
| `storage_key` | `VARCHAR(255)` not null, unique                      |
| `alt_text`    | `VARCHAR(300)` not null, empty only if decorative    |
| `decorative`  | `TINYINT(1)` default 0                               |
| `width`       | `INT NULL`                                           |
| `height`      | `INT NULL`                                           |
| `mime`        | `VARCHAR(80)` not null                               |
| `position`    | `TINYINT` default 0                                  |
| `status`      | `ENUM('pending','ready')` default `pending`          |
| `created_at`  | `DATETIME` default now                               |

Pending rows are uploads that exist before their post does. `post_id` is set
only when `POST /posts` attaches them, and only after the API has checked the
object's real size and content type with `HeadObject`.

### 022 — pinned standing notice (applied)

`posts.pinned_at DATETIME NULL` marks the club's one pinned dispatch. The API
clears every other pin in the club inside the same transaction, so “one per
club” is an application invariant rather than a database accident. A pinned
post is returned separately from the paged column and is never repeated there.
Removing a post clears its pin; hiding it leaves the pin for a later restore.

### 023 — photo reports (applied)

Widens `reports.target_type` to include `media`, so one photo can be reported
without removing the whole dispatch. The API checks that the photo is `ready`
and its post is published before accepting the report. Removing the photo
through moderation deletes the row and stored object and closes every report on
it; hiding or removing its post closes those photo reports too.

### 024 — photo thumbnails (applied)

`post_media.thumbnail_key` points at a generated 640px WebP. Publishing decodes
the uploaded object with `sharp`, stores the derivative next to the original
and keeps the original for permalinks and as the fallback. Existing rows have
`NULL` and continue to use the original. Removing a photo or its parent deletes
both objects.

### Explicitly not modelled yet

Reactions, follows, bookmarks, hashtags, mentions, direct messages, member
posts. Each adds a surface or a notification stream; none is needed to prove
the noticeboard works. Pinning is deliberately one editorial pin, not a
reaction count.

## Surface

### Club page — “From the club”

Placed after **Commitments**, before the club comment thread. A ruled column of
posts:

- Date stamp and author line (`Amara Okafor · Chair`), body, up to three photos
  in 3b.
- `N comments` as a link to the permalink; no like count.
- Managers see `Edit`, `Pin` / `Unpin` and `Hide` inline, in the same quiet
  mono style as the commitment roster controls.
- A manager-only `Post an update` button expands a composer with a labelled
  textarea, character count and `Publish`. No modal, matching the commitment
  composer.
- Empty state: “No updates from this club yet.” — not a call to action, since
  members cannot post.

Pagination: first 10 posts, `Earlier updates` loads the next 10. No infinite
scroll. The page ends. A pinned post sits above the dated column with a written
`Pinned` marker and is excluded from the paginated list so it never repeats.

### `/posts/:id` — permalink

The post, its club, author and date, the shared comment thread, and a `Report`
link. Public. This is the URL an officer can share in a WhatsApp group; the
club page is the reading surface, the permalink is the reference.

### The desk — “Posts”

A section after **Announcements**:

- Table of the club’s posts (date, excerpt, author, comments, status) with
  `Edit`, `Pin` / `Unpin`, `Hide` / `Restore`, `Remove` and a link to the
  permalink. `Pinned` is written next to the status, never colour alone.
- `Open reports N` at the top when the club has any. Expanding shows the target
  excerpt, reason, note, reporter count (not reporter identity) and
  `Dismiss` / `Hide post` / `Remove post`.
- Tier 1 sees the same queue across clubs in the existing admin area, not in
  every club desk.

Announcements stay as they are for one-line operational news; posts are the
thing worth a permalink and a comment thread. Long term they may merge, but
not in this phase.

### Member workspace

No new feed. The workspace already answers “what did I commit to?”. A
“Latest from your clubs” rail is a separate decision once there is evidence
members want it.

## Moderation

- **Author:** edit and delete their own post. Deletion is soft (`removed`) so
  comments and reports do not dangle; the UI says the post was removed.
- **Club manager:** hide (`hidden`, reversible) or remove (`removed`) any post
  or comment belonging to their club. Every action is audited with the reason.
- **Tier 1:** the same powers on any club; sees the cross-club report queue.
- **Reports:** require a reason; note optional. No automatic hiding at a
  threshold. A single report puts the item in the queue and a human decides.
- **Reporters stay anonymous to club managers.** The queue shows reason, note
  and count. Tier 1 can see reporter identity when investigating report abuse.
- **Rate limits:** posts and reports join the existing per-key limiter; add a
  small per-user cooldown on reports (one per target already, plus a short
  window) so a member cannot flood the queue with different targets.
- **Notification:** a new report notifies the club’s managers once, through the
  existing notifications table. No notification for every post.

## Accessibility contract

- Posts are an ordered list of `<article>` elements, each with a heading (the
  author/date line can be the accessible name) and a `<time datetime>`.
- Comment counts and status never rely on colour; hidden/removed state is
  written text.
- Composer: visible labels, a live character count, errors in a `role="alert"`,
  and focus returned to `Post an update` after publish/cancel.
- Report dialog: native `<dialog>` or a focus-trapped panel, labelled reason
  radios, Escape closes, focus returns to `Report`.
- Manager confirmations name the effect (“Hide this post from the club page?”)
  and return focus to the row control.
- 3b photos: alt text required (or an explicit “decorative” choice), keyboard
  file picker, no drag-only upload, no autoplay, no image-only information.
  Captions are text, not baked into the image.
- Contrast and focus follow the existing Signal tokens; 3px focus rings; 44px
  touch targets where controls sit alone on a phone.

## Infrastructure decision

Text posts and reports need **no new service**. Photos use **Cloudflare R2**
through its S3-compatible API: no egress fee, a private bucket works, and the
same adapter accepts any compatible store through `S3_*` variables.

The browser asks the API for a short-lived presigned `PUT`, uploads directly to
the bucket, and never sends image bytes through Express. The API signs an exact
`Content-Type`, then checks the object with `HeadObject` for size and type
before attaching it to a post. A private bucket serves one-hour signed `GET`
URLs; setting a public bucket domain makes delivery URLs stable and cacheable.

## Delivery order

1. **3a — text noticeboard (shipped 17 November 2026).** Posts table,
   comments-on-posts, club page column, permalink, desk list, reports and the
   moderation queue. No new service.
2. **3b — photos (implemented 17 November 2026).** R2/S3 presigned upload,
   alt-text gate, image rendering and the same moderation paths. Requires
   bucket credentials before the controls appear.
3. **3c — editorial pinning (shipped 17 November 2026).** One standing notice
   per club. Reactions and search are still held back: they need a measured
   reason, not a roadmap checkbox, and reactions would contradict the
   no-engagement-counter rule above.

## 3a implementation record

- `server/routes/posts.js` — public paginated feed, manager-only manage list,
  publish, edit (author or manager), and status changes (manager only).
- `server/routes/reports.js` — one report per member per target, a
  manager-only queue with no reporter identity, and dismiss/hide/remove that
  closes every open report on the same item. Removing a comment deletes it;
  hiding is only offered for posts because comments have no hidden state.
- `server/routes/comments.js` — accepts `targetType=post` and keeps a hidden
  post's thread unreadable. The existing thread component is reused.
- `src/components/ClubFeed.jsx` — the public column and inline officer
  composer/editor on the club page.
- `src/pages/PostDetail.jsx` — the permalink and comment thread.
- `src/components/ClubPostsDesk.jsx` — publish, edit, hide/restore/remove and
  the report queue in the club desk.
- `src/components/ReportButton.jsx` — a native dialog with reason and optional
  note, reachable from posts and post comments.

Not built in 3a: reactions. The cross-club tier 1 report aggregate was added
later; photos shipped in 3b.

## 3b implementation record

- `server/storage.js` — one S3 adapter for R2 or another compatible store.
  Presigned PUTs last ten minutes; GET URLs last one hour unless
  `R2_PUBLIC_BASE_URL` is set. The adapter disables itself cleanly when the
  four required settings are absent.
- `POST /posts/media` reserves a pending row and returns the upload URL. The
  route requires a club manager, a JPEG/PNG/WebP MIME type, a size under 5 MB,
  and alt text unless the photo is explicitly decorative.
- `POST /posts` accepts up to three `mediaIds`, checks each pending object with
  `HeadObject`, then attaches them in one transaction with the post.
- `DELETE /posts/media/:id` discards an upload that was never published;
  `DELETE /posts/:id/media/:id` removes one photo from a published post. Both
  delete the stored object.
- `PATCH /posts/:id/media/:id` changes a published photo's description or marks
  it decorative. The author or a club manager may edit it; clearing the
  description without choosing decorative is rejected. The dialog is available
  beside each photo in both the club-page editor and the desk.
- Publishing generates one 640px WebP thumbnail per photo with `sharp`, stores
  it next to the original, and records `thumbnail_key`. Generation is bounded by
  input pixels and a failure falls back to the original instead of blocking the
  post.
- The feed and permalink return `media` with fresh original and thumbnail URLs,
  alt text, dimensions and orientation-free ordering. The club feed, permalink
  and officer desk all render the same photo band.
- The composer offers a labelled file picker, per-photo description, an
  explicit decorative checkbox, a remove control and a 3-photo count. The file
  input is keyboard reachable; there is no drag-only path.
- `server/tests/storage.test.mjs` covers configuration, MIME policy, presigned
  PUTs, public URLs and signed GETs. `server/tests/posts.test.mjs` covers the
  text-only fallback when storage is absent.

Not built in 3b: interactive cropping. Derived thumbnails arrived in the
follow-up below. Abandoned pending uploads are handled by the cleanup worker.
Captions remain text and are not baked into images.

## Follow-up — abandoned uploads (implemented 17 November 2026)

- `server/mediaCleanup.js` deletes pending photo rows and objects once they are
  older than `MEDIA_PURGE_HOURS` (24 by default). The publish route already
  refuses reservations older than one hour, so a day-old row cannot belong to
  an in-progress post.
- At most 200 rows are handled per pass. The object is removed first, then the
  row; a failed bucket delete leaves the row for the next pass instead of
  losing track of the object.
- The worker runs every six hours after server start, logs only when it changes
  something, and is disabled when photo storage is off. `MEDIA_CLEANUP=off` is
  an explicit kill switch even when storage is configured.
- An R2 lifecycle rule on the upload prefix remains the backstop for objects
  that outlive the database row.

```
MEDIA_PURGE_HOURS=24
MEDIA_CLEANUP=on
```

## 3c implementation record

- Migration `022_pin_posts.sql` adds `pinned_at` and an index for the club's
  standing notice.
- `PATCH /posts/:id/pin` is manager-only and takes `{ pinned: true|false }`.
  Pinning locks the club row, clears every other pin in that club and sets the
  target in one transaction. Only published posts can be pinned.
- `GET /posts` returns `{ posts, pinned, nextCursor }`; `pinned` is a separate
  published post and is excluded from the dated list. Manage and permalink
  responses carry `pinned` / `pinnedAt` too.
- The club page renders the pin first with a written `Pinned` badge and an
  `Unpin` control for managers. The desk can pin or unpin any published post,
  shows a `Pinned` marker next to status, and keeps the pin through a hide but
  clears it on removal.
- `server/tests/posts.test.mjs` covers the manager-only pin, the separate feed
  slot, absence from the dated list, the manage/permalink flags and unpinning.

Still deferred in 3c: reactions and campus-wide search. Reactions would add
engagement counters the product explicitly avoids; search needs a query
surface and a measured gap before it earns one.

## Follow-up — author removal (implemented 18 November 2026)

- `PATCH /posts/:id/status` now accepts `removed` from the post's author as well
  as from a club manager. An author cannot hide or restore a post; those remain
  manager actions. Removal still clears the pin and closes every open report.
- The club page shows `Edit` and `Remove post` to an author who is no longer a
  club manager, with a confirmation that names the closed thread. A manager
  keeps the existing `Edit`, `Pin` and `Hide` controls and removes from the desk.
- The API test reassigns a post to a non-manager author to cover editing,
  unrelated-member refusal, the author's refusal to hide, and the author's
  successful soft removal.

## Follow-up — tier 1 cross-club reports (implemented 18 November 2026)

- The existing `GET /reports` without a `clubId` already returned every open
  report to tier 1; the dashboard now surfaces it in a dedicated moderation
  section instead of hiding it behind the selected club.
- The queue shows the club, target type, reason, reporter count, target excerpt
  and note. Tier 1 can dismiss, hide a post or remove a post/comment/photo from
  the same list, and one action still closes every open report on that target.
- Club managers still get only their club's queue; a tier 2 request without a
  `clubId` remains a 400.

## Follow-up — photo reports (implemented 18 November 2026)

- Migration `023_report_media_target.sql` widens `reports.target_type` to
  `('post','comment','media')`. A report can name one ready photo on a published
  post; the club is resolved from the photo's post.
- The photo band on the club page and permalink carries `Report photo` for
  signed-in readers who are not the author or a manager. The report dialog says
  “photo” rather than “media”.
- The club desk and the tier 1 aggregate show photo reports with a written
  `photo` kind. A photo report can be dismissed or removed, not hidden; removal
  deletes the stored object and the row, and one action closes every report on
  that photo.
- Hiding or removing a post also closes every open report on its photos, and
  removing a photo directly from the edit panel closes its reports.
- `server/tests/media.test.mjs` covers the member report, queue shape, removal
  and object cleanup.

## Follow-up — photo thumbnails (implemented 18 November 2026)

- Migration `024_post_media_thumbnail.sql` adds `post_media.thumbnail_key`.
- `POST /posts` downloads each verified object once, generates a 640px WebP
  with `sharp` (EXIF orientation applied, metadata dropped, 40M pixel limit),
  uploads it with a long-lived cache header and stores the key. A failed
  thumbnail is logged and the original is used instead; it never blocks the
  post.
- If the database transaction fails after generation, the generated objects are
  deleted. Removing a photo, removing a post's photo through moderation or
  deleting the original from storage also removes the thumbnail.
- The client uses `thumbnailUrl` in published photo grids and editor previews,
  falling back to `url` for older rows or failed generation.
- The test bucket now proves the WebP is fetchable, keyed and deleted with the
  photo.

## Follow-up — reports on every comment thread (implemented 18 November 2026)

- The shared `CommentSection` now offers Report on club, event, commitment and
  post comments. Signed-in readers see it unless they wrote the comment or can
  moderate the club; the trigger still opens the same native report dialog.
- The report API and both moderation queues already resolved each comment to
  its club and removed the comment generically, so this follow-up needed no
  server route change. A row that names a club, event or commitment comment now
  reaches the club desk and the tier 1 aggregate with its thread text.
- `signups-comments.test.mjs` creates one comment on each target type, reports
  it, finds it in the queue and removes it through the queue. The test also
  proves the thread no longer contains any of the three comments.

### Bucket setup

Set these in `server/.env` (R2 names; use `S3_*` for another provider):

```
R2_ACCOUNT_ID=…
R2_ACCESS_KEY_ID=…
R2_SECRET_ACCESS_KEY=…
R2_BUCKET_NAME=…
# Optional: a public bucket domain for stable image URLs.
R2_PUBLIC_BASE_URL=https://photos.example.com
# Abandoned uploads: purge after 24 hours; MEDIA_CLEANUP=off disables it.
MEDIA_PURGE_HOURS=24
MEDIA_CLEANUP=on
```

Compatible stores that require path-style addressing can set
`S3_FORCE_PATH_STYLE=true`. The R2 token needs Object Read & Write on this
bucket. For direct browser
uploads, the bucket CORS policy must allow the app's origin with `PUT` and the
`content-type` header, for example:

```json
[
  {
    "AllowedOrigins": ["http://localhost:5173"],
    "AllowedMethods": ["GET", "HEAD", "PUT"],
    "AllowedHeaders": ["content-type"],
    "ExposeHeaders": ["etag"],
    "MaxAgeSeconds": 3600
  }
]
```

Add the deployed frontend origin to `AllowedOrigins`. The API does not proxy
image bodies; a CORS failure means the browser never reaches the bucket.

## Decisions still open

- Whether posts ever appear in the home edition (recommendation: no).
- Whether announcements merge into posts (recommendation: later, once posts
  have a permalink habit).
- Retention for removed posts and reports (recommendation: keep the row,
  remove media, keep the audit entry).

## Out of scope

Direct messages, follows, a global or algorithmic feed, video, stories,
member-authored posts, and cross-campus feeds. Phase 4 now scopes the clubs,
events and commitments by campus; the post feed inherits that club boundary
rather than inventing a parallel visibility rule.
