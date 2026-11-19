# Phase 5 — the cross-university network

Design plus a dark schema foundation. Migration `026` includes campus
affiliations and migration `027` installs club families, chapter links and
family admins. The member-facing affiliation surface — home-campus backfill,
requests, cancellation and campus-admin/tier-1 approval — is implemented, but
both its API and the `/campus-access` entry point are behind
`CROSS_UNIVERSITY_ENABLED=false` / `VITE_CROSS_UNIVERSITY_ENABLED=false`.

Tier 1 family management is implemented behind the flag: create/edit a family
and its mark, attach or detach existing clubs, move a chapter between families,
and appoint delegated identity editors at `/settings/families`. Public
read-only family pages live at `/families` and `/families/:familyId`, with a
chapter view for each cross-link. A read-only **My network** club directory now
uses approved affiliations. Migration `028` adds audience columns with a
`campus` default; events, posts and commitments can explicitly publish to the
network, while membership stays campus-local. Tier 1's discovery-only campus
switcher is a Phase 4 control and is not gated by this flag. Polish and defects
are tracked separately in `docs/standalone/refinements.md`. The Phase 6 decision
and phase-exit viability gate live in `docs/standalone/phase-gates.md`.

Phase 4 gave every account and club one campus. Phase 5 lets a person belong
to more than one campus and lets one club exist as a family of campus chapters.
It should not turn the product into a global social network.

The recommended shape is **federation plus chapters**:

- One canonical club family owns the shared identity: name, mark, description
  and the list of chapters.
- Each campus has its own chapter row, with its own officers, members, posts,
  events and commitments.
- A person has one **home campus** plus zero or more verified **affiliations**.
- Discovery defaults to local. "My network" is an explicit scope made from the
  home campus and affiliations. There is no anonymous all-campus feed.

That preserves the Phase 4 boundary and the existing moderation model. It also
avoids the two bad alternatives: a single club row with many campus ids (every
query becomes ambiguous), and completely unrelated clubs that happen to share
a name (no way to follow the same organisation across campuses).

## 1. What a multi-campus club means

A family is not a super-club and does not own chapter content.

| Layer       | Owns                                                              | Who manages it             |
| ----------- | ----------------------------------------------------------------- | -------------------------- |
| **Family**  | Shared name, slug, logo, description, chapter list, family page   | Tier 1 and family admins   |
| **Chapter** | Campus, local name, officers, members, posts, events, commitments | That chapter's club admins |
| **Campus**  | Discovery boundary, campus admin, reports, affiliation approvals  | That campus's campus admin |

A chapter remains a normal `clubs` row. Existing club ids, links, memberships,
events, commitments and posts keep working.

Rules:

- A chapter belongs to exactly one family, or to none.
- A family has at most one chapter per campus in Phase 5. More than one chapter
  at the same campus is a later exception, not a default.
- A club can only be linked to a family by tier 1 (or by a family admin if we
  add delegated linking later). A chapter cannot unilaterally join a family.
- The family page aggregates chapters and network-visible content. It does not
  merge rosters, reports or comment threads.
- A family can exist with one chapter; that is how an existing club becomes
  multi-campus later without changing its id.

## 2. What a multi-campus user means

Keep `users.campus_id` as the **home campus**. It remains required and still
decides:

- the default campus on sign-in,
- the campus name in the masthead,
- the account's primary campus-admin boundary,
- where the email domain assigned them at registration.

Add `user_campus_affiliations` for additional campuses:

```text
user_campus_affiliations
  affiliation_id  INT AUTO_INCREMENT PRIMARY KEY
  user_id         -> users.user_id
  campus_id       -> campuses.campus_id
  kind            home | exchange | dual | staff | alumni | other
  status          pending | active | denied | revoked
  note            VARCHAR(500) NULL
  requested_at    DATETIME
  decided_at      DATETIME NULL
  decided_by      -> users.user_id NULL
  UNIQUE (user_id, campus_id)
```

Backfill one `home / active` row for every existing user. `users.campus_id`
stays authoritative for home; the affiliation table is for the additional
campuses.

Who can add an affiliation:

- **Tier 1** can grant or revoke any affiliation.
- **A campus admin** can invite or approve an affiliation to their own campus.
  They cannot revoke someone's home campus or grant an affiliation to another
  campus.
- **A member** can request an affiliation with proof (student/staff number or
  campus email), but the request stays `pending` until a campus admin approves.
  Self-service instant joins are not part of the first cut.

This avoids a free-for-all where anyone can claim any university and read its
network content.

### Schema and gated affiliation foundation

Migration `026_campus_affiliations.sql` adds the affiliation table and backfills
every existing user's home row. New registrations insert their home affiliation
at the same time as the account. Migration `027_club_families.sql` adds
`club_families`, nullable `clubs.family_id`, the unique chapter-per-campus link
and `club_family_admins`; it seeds no family and attaches no existing club.

The affiliation screen and API, plus tier-1 family management, are implemented
but disabled by default. Set `CROSS_UNIVERSITY_ENABLED=true` in `server/.env`
and `VITE_CROSS_UNIVERSITY_ENABLED=true` in the client, then rebuild/restart.
Both routes are unmounted while the server flag is off; the client flag hides
the Campus access and Families links/routes.

Family management enforces:

- unique family slugs and one chapter per campus per family,
- a club can belong to only one family; a move requires the expected source
  family and a target campus with no chapter,
- linking or moving a chapter never creates, deletes or edits the club itself,
- tier 1 alone controls the chapter list and appoints family editors by email;
  an editor can change shared identity but cannot add, move or detach chapters,
- `club_family.create`, `.update`, `.chapter.add`, `.chapter.remove`,
  `.chapter.move`, `.admin.add` and `.admin.remove` audits; a move records both
  family names and the campus.

When enabled, the affiliation screen is `/campus-access`:

- Members see their home campus, active affiliations, pending requests and
  denied/revoked requests, and can request another campus with a relationship
  kind and a short note.
- A pending request can be cancelled by its owner. A denied or revoked request
  can be retried; the row is reused so the audit trail stays coherent.
- Campus admins see pending requests for their campus only. Tier 1 sees every
  campus. Neither can decide their own request.
- Decisions are audited as `campus.affiliation.request`, `.cancel`, `.approve`
  and `.deny`.
- Affiliations unlock the read-only **My network** club directory plus network-
  published events, posts and commitments. Membership remains campus-local.
  A network commitment has one host roster and is open to members whose
  network includes the host campus.

### Family identity and editors

Family settings own a name, slug, description and optional square mark URL. The
public family page shows the mark with a two-letter monogram fallback. Chapter
cards use the chapter's own description and meeting details.

Tier 1 can appoint a **lead** or **editor** by account email. An editor sees only
their own families in family settings, can update identity fields, and receives
403 for chapter link, move, detach and other tier-1 operations. Tier 1 always
manages every family and cannot be appointed as an editor.

## 3. Network and audience

A user's **network** is their active home campus plus active affiliations.
A chapter can be discovered and used in these scopes:

- `local` — the reader's current/home campus. This remains the default.
- `network` — every campus in the reader's network. Requires a verified
  affiliation; anonymous readers never get this scope.
- `all` — tier 1 only, for platform administration. Not a member-facing global
  feed.

Add an `audience` field to the content that can travel:

```text
posts.audience       campus | network | public    default campus
events.audience      campus | network | public    default campus
commitments.audience campus | network | public    default campus
```

Semantics:

- **`campus`** — visible while browsing the owning chapter's campus. This is
  today's behaviour, including anonymous readers who land on that campus.
- **`network`** — visible to signed-in users whose network includes any campus
  where the owning family has a chapter. It also appears on the family page.
  Anonymous readers cannot see it in the network scope; they can still see
  campus-audience content on that campus.
- **`public`** — intentionally available in the public directory and to
  signed-in readers on any campus. This is opt-in per item and should be
  rare. Public does not mean the item appears in a global algorithmic feed.

A chapter that is not in a family treats `network` as `campus`; there is nowhere
for it to travel. The API should reject `network`/`public` if the author is not
allowed to publish at that scope.

Default everything to `campus`. A network post should be a deliberate act, not
the result of a composer default or a client bug.

### Cross-campus commitments

Start with one host chapter and one roster:

- The commitment belongs to the host chapter.
- `audience = network` makes it visible across the host family's network.
- Eligible users can sign up; the roster is shared and ordered as today.
- The host chapter's officers manage capacity, attendance and cancellation.

Do **not** start with per-campus quotas, separate rosters, or a commitment
jointly hosted by several chapters. Those need a different table and a much
harder cancellation/attendance story. If demand appears later, add
`commitment_chapters` and per-chapter allocations rather than overloading the
existing signup table.

## 4. SchemaFederation migrations `026`–`028` (affiliations, families and audience):

```text
club_families
  family_id       VARCHAR(30) PRIMARY KEY
  name            VARCHAR(150) NOT NULL
  slug            VARCHAR(80) NOT NULL UNIQUE
  description     TEXT
  logo_url        VARCHAR(500)
  home_campus_id  VARCHAR(30) NOT NULL -> campuses
  status          ENUM('active','archived') DEFAULT 'active'
  created_by      VARCHAR(30) -> users
  created_at

clubs.family_id   VARCHAR(30) NULL -> club_families
  UNIQUE (family_id, campus_id)   -- one chapter per campus per family

club_family_admins
  family_id       -> club_families
  user_id         -> users
  role            ENUM('lead','editor')
  UNIQUE (family_id, user_id)

user_campus_affiliations
  ... as above ...

posts.audience, events.audience, commitments.audience
  ENUM('campus','network','public') NOT NULL DEFAULT 'campus'
```

Existing clubs start with `family_id = NULL`. No chapter is silently grouped
by name. That would create false families such as two unrelated "Debate Clubs".

Indexes:

- `clubs (family_id, campus_id)` unique.
- `clubs (campus_id)` already exists from Phase 4.
- `user_campus_affiliations (campus_id, status)` for campus-admin lists.
- `(audience, created_at)` on posts/events/commitments if the network feed
  queries need it; measure before adding all three.

`campuses` and `campus_email_domains` do not change. Registration still assigns
the home campus from the domain. Additional affiliations are an explicit,
approved relationship, not another email-domain guess.

## 5. Roles

| Role           | Phase 5 addition                                                                                                                             |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `tier1`        | Creates families, links/unlinks chapters, appoints family admins, grants any affiliation, sees all campuses. **Implemented.**                |
| `family_admin` | Edits family identity and family page. Does **not** inherit chapter content powers. **Implemented** as a link table, with lead/editor roles. |
| `campus_admin` | Manages chapters on their campus, approves affiliations to their campus, sees that campus's reports. Cannot link chapters across campuses.   |
| `tier2`        | Manages one chapter's content, members and audience choices allowed by that chapter.                                                         |
| `member`       | Joins eligible chapters, RSVPs to network content, requests affiliations.                                                                    |

A person can hold more than one role by having the relevant link: for example,
a campus admin at Strathmore can also be a chapter admin for one club. Do not
invent a single global role hierarchy that overwrites those separate
relationships.

Family admin is a new link table rather than a new value in `users.role`.
Content permissions stay chapter-scoped, so a family admin cannot edit a
chapter's posts merely because they edit the family logo.

## 6. API sketch

Read:

- `GET /api/v2/club-families?scope=local|network`
- `GET /api/v2/club-families/:id` — family, chapters, network-visible
  commitments/posts the reader may see.
- `GET /api/v2/clubs?scope=local|network` — **implemented** for network club
  identity; `GET /api/v2/clubs/:id?scope=network` returns the read-only profile.
- `GET /api/v2/events?scope=local|network` — **implemented:** network scope
  returns only `audience = network` events on the member's network.
- `GET /api/v2/posts/network?scope=network` — **implemented:** network-published
  posts across the member's network.
- `GET /api/v2/commitments?scope=network` — **implemented:** network-published
  commitments across the member's network.
- `POST /api/v2/commitments/:id/signup` — **implemented:** allows an approved
  network member to join the host campus roster.
- `GET /api/v2/commitments?scope=local|network` — not yet; commitments stay
  local until `audience` exists.
- `GET /api/v2/campus-affiliations/me` — home plus every own request.

Admin:

- `POST /api/v2/club-families` — tier 1.
- `PATCH /api/v2/club-families/:id` — family admin or tier 1.
- `POST /api/v2/club-families/:id/chapters` `{ clubId }` — tier 1.
- `DELETE /api/v2/club-families/:id/chapters/:clubId` — tier 1.
- `POST /api/v2/campus-affiliations/me` `{ campusId, kind, note }` — creates a
  pending request.
- `DELETE /api/v2/campus-affiliations/me/:id` — cancel an own pending request.
- `GET /api/v2/campus-affiliations?status=pending&campusId=…` — campus admin or
  tier 1.
- `POST /api/v2/campus-affiliations/:id/approve|deny` — that campus's admin or
  tier 1. Self-approval is rejected.
- `GET /api/v2/club-families/manage` — tier 1: every family and its chapters.
- `POST /api/v2/club-families` and `PATCH /api/v2/club-families/:id` — tier 1:
  create or edit shared identity.
- `POST /api/v2/club-families/:id/admins` and
  `DELETE /api/v2/club-families/:id/admins/:userId` — tier 1: delegate or remove
  identity editing. `PATCH /api/v2/club-families/:id` accepts tier 1 or an
  appointed editor.
- `POST /api/v2/club-families/:id/chapters` and
  `DELETE /api/v2/club-families/:id/chapters/:clubId` — tier 1: attach or detach
  an existing club.
- `POST /api/v2/club-families/:id/chapters/:clubId/move` — tier 1: move a
  chapter from the required `fromFamilyId` into this family.
- `GET /api/v2/club-families` and `GET /api/v2/club-families/:id` — public,
  read-only active families and their chapter identity.

Writes:

- `POST/PATCH` on posts, events and commitments accept `audience`.
- Server validation is authoritative:
  - `campus` is always allowed for a chapter author.
  - `network` requires the club to have a family and the author to manage the
    chapter.
  - `public` can be tier-1-only for the first cut, or a per-family setting.
- Never trust a client-supplied `family_id`; derive it from `club_id`.

## 7. UX

### Discovery

- Home keeps **This campus** as the default.
- A scope control appears only when the reader has an active affiliation:
  **This campus / My network**.
- The masthead campus label becomes a menu:
  - Home campus (fixed)
  - Other campuses the reader is affiliated with
  - "Request another campus" (if enabled)
- Tier 1 gets **All campuses**; campus admins do not.

### Network club directory

Signed-in members with at least one approved additional campus get `/network`.
It lists club identity for the home campus plus active affiliations, grouped by
campus and filterable by category and search. Anonymous readers and members
without an approved affiliation never receive network results; tier 1 is
rejected and uses the campus edition instead.

A club opened from this page fetches identity through `GET /clubs/:id?scope=network`
and renders a read-only profile. Membership and comments are omitted with a
written boundary note. Events, posts and commitments appear only when
deliberately published with `audience = network`; ordinary campus content stays
local.

### Content audiences

Migration `028_content_audience.sql` adds `audience ENUM('campus','network','public')`
to `events`, `posts` and `commitments`, all defaulting to `campus`. All three
have writer and reader paths in this slice.

- Event and post composers offer **This campus only** and **My club network**
  for a club linked to a family. The default is campus.
- `network` is rejected unless the server flag is on and the club has a family.
- `public` is rejected until the public-directory policy exists.
- Network reads return only `audience = network`; local reads return campus and
  network content for that campus; tier 1 keeps the all-campus administrative
  view.
- `/network` lists network events, commitments and notices. A network
  commitment opens its notice where an eligible member can join the single host
  roster; comments and discussion remain on the host campus.

### Club family page

**Implemented identity slice:** family name, description, home campus and a
chapter strip with campus names. Each chapter cross-links to a read-only chapter
view at `/families/:familyId/chapters/:clubId`; that view can open the local
club page only for a reader on that campus or tier 1. This avoids turning a
family page into a cross-campus content leak before network audiences exist.

Still to come: family mark, local officers, next event, network-visible
commitments/posts, and a clear per-chapter moderation statement.

### Chapter page

- "Part of [Family]" with a link to the family page and a chapter switcher.
- Local content remains the default; network content is labelled.
- The composer audience selector:
  - "This campus" (default)
  - "My club network" (only for chapters in a family)
  - "Public" (later, tier-1 only by default)
- The selector explains the consequence in plain words, not only colour or a
  small icon.

### Accessibility

- Campus and audience are always written text, never colour alone.
- The scope control is a labelled radio group or select, not a custom dropdown
  with no keyboard path.
- Family and chapter links have distinct accessible names ("Strathmore chapter
  of Debate & Rhetoric", not two links called "View").
- Network-only content must still be reachable in a static list; no information
  exists only in a carousel or animation.
- Preserve focus and announce scope changes with a polite status message.

## 8. Moderation and safety

- Reports stay attached to the chapter/club. The campus admin for that chapter
  sees them. Family admins do not automatically see chapter reports.
- Network content that is reported in another campus's feed still belongs to
  the host chapter. Add a `family_id` derived report view for tier 1, and later
  for family admins if needed.
- A campus admin cannot read another campus's roster, reports or member emails.
- Do not return reporter identity, as today.
- Audit every family link/unlink, family admin appointment, affiliation
  approval/revocation and audience change.
- A removed chapter should keep its family link for the audit trail but be
  hidden from discovery and the family page; unlinking is a separate action.
- Rate-limit affiliation requests and family creation. A family name/slug is
  unique; do not allow a duplicate mark/name to impersonate an existing family.
- Public audience is the riskiest setting. Keep it tier-1-controlled until
  there is a review/verification path for families.

## 9. Migration and rollout

Ship schema dark, then turn on read, then participation.

1. **Schema** — **done for families and affiliations:** migrations `026`/`027`
   backfill home affiliations and leave every club `family_id = NULL`. Audience
   columns remain future work. No visible change while the flag is off.
2. **Read-only network** — **family identity pages, chapter links, the read-only
   My network club directory and network-visible events/posts/commitments are
   done behind the flag.** Test against a temporary second campus before
   enabling.
3. **Affiliations** — **implemented behind the flag:** campus-admin approval
   flow and the `/campus-access` screen. Still no cross-campus writes or network
   discovery.
4. **Participation** — network RSVP/join and network commitments. Start with
   one host chapter/one roster.
5. **Public directory** — only after family verification and moderation are
   proven. This is a separate opt-in, not a switch on the same day.

Each step needs a rollback story:

- Schema additions are additive (nullable `family_id`, default audience).
- Disabling the feature flag hides entry points but must also make the API
  reject `scope=network` writes; never rely on the client.
- `DELETE`/unlink is soft for audit; hard deletion only for genuinely empty
  test data.

## 10. Acceptance tests

- A user with home campus A and active affiliation B sees B under **My
  network**, but not campus C. **Implemented.**
- A user with no affiliation sees only their home campus and is rejected when
  requesting `scope=network`. **Implemented.**
- A network club profile exposes identity only; membership, events, posts and
  comments are absent. **Implemented.**
- A family with chapters on A and B shows both to a network reader; a chapter
  on C is absent.
- A campus admin at A can manage A chapters but receives 403 for B chapters,
  B reports and B affiliation requests.
- A local post or commitment stays off the network scope; a network post or
  commitment appears for A and B but not C; a public item appears in the public
  directory. **(Post and commitment paths implemented; public remains future
  work.)**
- A network commitment is visible to A and B, accepts a B signup, and keeps one
  ordered roster; the host chapter can cancel and notify both campuses.
- Unlinking a chapter removes it from discovery and the family page, keeps the
  audit row, and does not delete the chapter's posts or events.
- A family admin can edit the family identity but cannot add, move or detach a
  chapter, or edit a chapter post.
- A family admin's management list contains only their own families; removing
  the link restores the 403 on the next request.
- Anonymous readers still get the Phase 4 default campus and never receive
  network-only content.
- All existing Phase 1–4 tests continue to pass with the flag off.

## 11. Non-goals

- A global feed or recommendation algorithm.
- Cross-campus direct messages, follows or stories.
- A club belonging to multiple families.
- Multiple chapters of one family on the same campus.
- Jointly hosted commitments with per-campus quotas and separate rosters.
- Automatic affiliation from a second email domain.
- Public self-serve family creation.
- Merging two existing clubs or transferring content between chapters.

## 12. Open decisions

Recommended answers are in parentheses.

1. **Is cross-campus discovery affiliated-only or public?**
   (Affiliated-only for network content; a separate public directory later.)
2. **Can a member self-add a campus affiliation?**
   (Request plus campus-admin approval; no instant self-join.)
3. **Can a member join a chapter at a campus they are not affiliated with?**
   (No by default; a chapter can opt into `network` or `public` join policy.)
4. **Who creates and links chapters?**
   (Tier 1 creates/links; family admins edit identity; campus admins manage
   their own chapters.)
5. **Is a cross-campus commitment one roster or many?**
   (One host chapter, one roster for the first release.)
6. **Does a family admin get moderation rights?**
   (No. Chapter reports stay with chapter/campus admins; tier 1 can escalate.)
7. **Do alumni/staff affiliations use the same flow?**
   (Same table, different `kind`; verification policy can differ.)
8. **When does public audience ship?**
   (After the family verification path exists; tier-1-only until then.)

The smallest useful Phase 5 is therefore: schema + read-only network discovery

- approved affiliations. Participation and public directory follow only after
  that boundary is proven.
