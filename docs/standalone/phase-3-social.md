# Phase 3 — the club feed, a design pass

**Status:** proposal, not implemented. Written 17 November 2026, after the
commitment loop shipped.

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

Proposed migrations, in order. Numbers are indicative; the migration runner
will assign the next free ones.

### 018 — posts

| Column       | Type                                                        |
| ------------ | ----------------------------------------------------------- |
| `post_id`    | `VARCHAR(60)` primary key (`post-<timestamp>`)              |
| `club_id`    | `VARCHAR(30)` foreign key to `clubs`, cascade               |
| `author_id`  | `VARCHAR(30)` foreign key to `users`, set null on deletion  |
| `body`       | `TEXT` not null, 1–2000 characters after trim               |
| `status`     | `ENUM('published','hidden','removed')`, default `published` |
| `created_at` | `DATETIME` default now                                      |
| `updated_at` | `DATETIME` auto-update                                      |
| `pinned_at`  | `DATETIME NULL` — reserved, not exposed in 3a               |

Index `(club_id, created_at)` for the club page; index `(status, created_at)`
for a future review queue.

### 019 — post media (3b)

| Column        | Type                                               |
| ------------- | -------------------------------------------------- |
| `media_id`    | `VARCHAR(60)` primary key                          |
| `post_id`     | foreign key to `posts`, cascade                    |
| `storage_key` | `VARCHAR(255)` not null                            |
| `alt_text`    | `VARCHAR(300)` not null — empty only if decorative |
| `width`       | `INT`                                              |
| `height`      | `INT`                                              |
| `mime`        | `VARCHAR(80)`                                      |
| `position`    | `TINYINT` default 0                                |

### 020 — reports

| Column        | Type                                                  |
| ------------- | ----------------------------------------------------- |
| `report_id`   | `INT AUTO_INCREMENT` primary key                      |
| `target_type` | `ENUM('post','comment')`                              |
| `target_id`   | `VARCHAR(60)`                                         |
| `reporter_id` | foreign key to `users`, cascade                       |
| `reason`      | `ENUM('spam','harassment','off_topic','other')`       |
| `note`        | `VARCHAR(500) NULL`                                   |
| `status`      | `ENUM('open','actioned','dismissed')`, default `open` |
| `created_at`  | `DATETIME` default now                                |
| `resolved_by` | `VARCHAR(30) NULL`, foreign key to `users`            |
| `resolved_at` | `DATETIME NULL`                                       |

Unique key `(reporter_id, target_type, target_id)` so one person cannot pile
reports onto the same post. Index `(status, created_at)` and
`(target_type, target_id)`.

### 021 — comments on posts

Widen `comments.target_type` to `('event','club','commitment','post')` and
extend `clubForTarget` / `targetTable` in `server/routes/comments.js`. Post
comments are the existing thread, not a second comment system. Deleting a post
cascades its comments by explicit delete in the route (comments have no FK, as
with commitments).

### Explicitly not modelled yet

Reactions, follows, bookmarks, hashtags, mentions, direct messages, member
posts. Each adds a surface or a notification stream; none is needed to prove
the noticeboard works.

## Surface

### Club page — “From the club”

Placed after **Commitments**, before the club comment thread. A ruled column of
posts:

- Date stamp and author line (`Amara Okafor · Chair`), body, up to three photos
  in 3b.
- `N comments` as a link to the permalink; no like count.
- Managers see `Edit` and `Hide` inline, in the same quiet mono style as the
  commitment roster controls.
- A manager-only `Post an update` button expands a composer with a labelled
  textarea, character count and `Publish`. No modal, matching the commitment
  composer.
- Empty state: “No updates from this club yet.” — not a call to action, since
  members cannot post.

Pagination: first 10 posts, `Earlier updates` loads the next 10. No infinite
scroll. The page ends.

### `/posts/:id` — permalink

The post, its club, author and date, the shared comment thread, and a `Report`
link. Public. This is the URL an officer can share in a WhatsApp group; the
club page is the reading surface, the permalink is the reference.

### The desk — “Posts”

A section after **Announcements**:

- Table of the club’s posts (date, excerpt, author, comments, status) with
  `Edit`, `Hide` / `Restore`, `Remove` and a link to the permalink.
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

Text posts and reports need **no new service**. Photo posts need object
storage and an upload path. Until a deployment host is chosen, 3a should ship
without photos rather than inventing a local-disk store that cannot survive a
deploy. Candidate providers once hosting is known: Cloudflare R2
(S3-compatible, no egress fee), Supabase Storage, or the host’s own bucket.
The upload flow should be a short-lived presigned PUT from the API to the
bucket, with the API validating MIME and size afterwards; never accept a
client-supplied storage URL.

## Delivery order

1. **3a — text noticeboard.** Posts table, comments-on-posts, club page column,
   permalink, desk list, reports and the moderation queue. No new service.
2. **3b — photos.** Storage choice, presigned upload, alt-text gate, image
   rendering and the same moderation paths.
3. **3c — only with evidence.** Reactions, pinning, search. Each needs a
   measured reason, not a roadmap checkbox.

## Decisions still open

- Storage provider and upload limits (blocks 3b only).
- Whether posts ever appear in the home edition (recommendation: no).
- Whether announcements merge into posts (recommendation: later, once posts
  have a permalink habit).
- Retention for removed posts and reports (recommendation: keep the row,
  remove media, keep the audit entry).

## Out of scope

Direct messages, follows, a global or algorithmic feed, video, stories,
member-authored posts, and cross-campus feeds. Phase 4 owns campus scoping; the
feed should inherit it rather than invent a parallel visibility rule.
