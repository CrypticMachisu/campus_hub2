# Phase 4 — the campus boundary

Implemented 18 November 2026.

Phase 4 makes the campus explicit without opening cross-university discovery
yet. One account belongs to one campus, one club belongs to one campus, and a
reader sees the clubs, events and commitments on their own campus. Strathmore
University is the first campus.

The decisions behind this slice:

- Campus identity is primarily derived from the email domain at registration.
- A person belongs to one campus. Multi-campus membership is a later
  cross-university feature.
- A club belongs to one campus. A club serving several campuses is also later.
- Cross-campus discovery is not open. Anonymous readers land on Strathmore;
  signed-in readers are pinned to their own campus; tier 1 can inspect any
  campus.
- A campus administrator sits between club managers and tier 1. They manage
  every club on their campus, but not platform operations.
- An unknown email domain is rejected at signup instead of creating an account
  with no campus. A later admin-assignment flow can add a domain or move a
  person.

## Model

Migration `025_campuses.sql` adds:

- `campuses` — one row per institution, with a stable id, name and slug.
- `campus_email_domains` — one row per domain, so a campus can own
  `strathmore.edu` and a demo alias without duplicating the campus.
- `users.campus_id` — required, foreign key to `campuses`.
- `clubs.campus_id` — required, foreign key to `campuses`.

The seeded campus is `campus-01`, **Strathmore University** (`strathmore`). Its
domains are `strathmore.edu` and `campus.edu`; the second is a demo alias so the
existing sample accounts and test credentials keep working.

Content inherits its campus from the owning club. Events, commitments, posts,
comments, reports and memberships do not carry a second `campus_id` that could
disagree with the club's.

Existing users and clubs are backfilled to `campus-01`. A database with rows
from more than one institution must assign those rows explicitly before running
the migration; the migration file says so.

`server/campushub_database.sql` mirrors the same schema for a fresh install.

## Roles and permissions

| Role           | Scope                                                                                 |
| -------------- | ------------------------------------------------------------------------------------- |
| `tier1`        | Platform-wide. Sees every campus, creates clubs on any campus, assigns campus admins. |
| `campus_admin` | Every club on their own campus. Sees campus reports, admin requests and users.        |
| `tier2`        | Only clubs listed in `club_admins`.                                                   |
| `member`       | No management rights.                                                                 |

The server keeps `canManageClub()` synchronous by hydrating a campus admin's
`adminForClubs` with every club on their campus whenever the user is loaded from
the database. A new club therefore appears to the campus admin on the next
request, without reissuing the JWT.

Tier 1 can assign or remove the role with:

- `POST /api/v2/users/:id/campus-admin`
- `DELETE /api/v2/users/:id/campus-admin`

The Dashboard exposes the same controls in **Admin Management** when a tier 1
admin is signed in. Removing the role returns the person to `tier2` if they
still manage a club, otherwise `member`.

## Discovery

- `GET /api/v2/campuses` is the public campus directory.
- `GET /clubs`, `GET /events` and `GET /v2/commitments` use the reader's campus.
  A signed-in reader may not request another campus; tier 1 may name one or
  omit the filter to see every campus.
- Signed-out readers get the default campus, currently Strathmore. There is no
  public campus switcher; that belongs with the cross-university phase. Tier 1
  has a discovery-only campus switcher on the edition (`All campuses` or one
  campus), which filters clubs and events without changing the reader's own
  campus.
- Joining a club, requesting club admin access, signing up for an event or
  commitment, and direct commitment/post reads reject another campus.
- The Navbar edition line shows the signed-in reader's campus name instead of a
  hard-coded "Main campus".
- Registration now tells the reader to use their campus email, and the server
  rejects an unknown domain with a clear error.

The client sends its bearer token on club and event reads so the server can
scope them. `ClubsProvider` reloads when the session changes, which matters when
a sign-in or promotion changes the visible campus set.

## Campus settings

Tier 1 has a **Campus settings** screen at `/settings/campuses`, linked from the
Navbar. It lists each campus, its account and club counts, and its registration
domains.

- Names and URL slugs are editable. The stable `campus_id` never changes.
- Domains can be added or removed. A campus must keep at least one domain.
- Domains are unique across campuses. Removing one stops future signups from
  that domain; existing accounts keep their campus.
- The API is tier-1 only: `GET /v2/campuses/manage`, `POST /v2/campuses`,
  `PATCH /v2/campuses/:id`, `POST /v2/campuses/:id/domains` and
  `DELETE /v2/campuses/:id/domains/:domain`.
- Creating a campus, changing its identity, and adding/removing a domain are
  written to `audit_log`.

## Campus affiliations

Signed-in members can request an additional campus at `/campus-access`. The
request records a relationship kind and a short note, and stays pending until
the campus admin for that campus or tier 1 approves or denies it. Members can
cancel their own pending request. A campus admin cannot decide another
campus's request or their own request.

This is the first Phase 5 slice. It does **not** yet change discovery, content
visibility or club membership; those remain part of the cross-university
design in [`phase-5-cross-university.md`](./phase-5-cross-university.md).

## Deliberately deferred

- A public or multi-campus switcher and cross-campus discovery.
- A club that serves two or more campuses.
- A user who belongs to more than one campus.
- A full campus console: the campus admin uses the existing club desk with
  campus-scoped lists. There is no separate campus audit or analytics screen.
- Cross-campus direct links are treated as not found. Sharing a Strathmore
  permalink with another campus is a cross-university feature, not a leak to
  preserve by accident.
- The federation-and-chapters model for multi-campus clubs and users. The
  design is in [`phase-5-cross-university.md`](./phase-5-cross-university.md).

## Verification

- `server/tests/campuses.test.mjs` inserts a temporary second campus and proves
  that anonymous and member reads exclude it, tier 1 can filter to it, domain
  registration joins Strathmore, unknown domains are rejected, and a campus
  admin can manage a Strathmore club but not the temporary campus's club.
- `server/tests/campus-settings.test.mjs` proves the tier-1-only settings API,
  slug/domain validation, the last-domain guard, and access refusal for a
  member.
- `server/tests/campus-affiliations.test.mjs` proves home backfill, member
  request/cancel, denial and re-request, campus-admin scope, tier-1 visibility,
  self-approval refusal, approval, and audit actions.
- The Phase 2 and Phase 3 route suites still pass after the campus joins were
  added to their list queries.
- `npm run lint` and `npm run build` pass.
