# Standalone refinements

A running list of polish, defects and product ideas that are deliberately not
part of the current phase. We will pick these up after the phase work.

## Open

| ID    | Area            | Item                                                                                                                                                   | Priority |
| ----- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- |
| R-003 | Family pages    | Show a family mark/logo and a next-event teaser per chapter once network-visible events exist. Keep the chapter’s campus moderation explicit.          | P2       |
| R-005 | Affiliations    | Show a pending-affiliation count in the masthead for campus admins, in the same way pending admin requests are surfaced.                               | P3       |
| R-006 | Family settings | Show the most recent chapter move (source, target, actor, time) on the family card using the existing audit trail.                                     | P3       |
| R-007 | Demo data       | Add a preview-only seed with a temporary second campus and a two-chapter family so the family and network states can be reviewed without manual setup. | P3       |
| R-008 | Family marks    | Replace the mark URL field with an upload/crop flow and a live preview; keep the URL field as a fallback for operators.                                | P2       |
| R-009 | Family editors  | Send an in-app or email invitation when tier 1 appoints a family editor, instead of relying on the editor discovering the settings link.               | P2       |
| R-010 | Family settings | Show who last changed family identity and when, using the existing `club_family.update` audit detail.                                                  | P3       |
| R-013 | Network page    | Add a family filter and a “chapters only” toggle once families are common enough to browse separately from ordinary clubs.                             | P3       |
| R-014 | Network profile | Add a “Request access to this campus” shortcut from a remote club profile.                                                                             | P3       |
| R-016 | Network events  | Add a network event detail view with attendance intent, but keep the host roster and discussion campus-scoped until participation is designed.         | P3       |
| R-018 | Network notices | Give network posts a read-only permalink with the host campus named; comments remain campus-only until the participation model is settled.             | P3       |

## Closed

| ID    | Area            | Resolution                                                                                                      |
| ----- | --------------- | --------------------------------------------------------------------------------------------------------------- |
| R-001 | Discovery / UI  | The wire is a three-column grid; the label has a reserved column and can no longer sit over the moving text.    |
| R-002 | Club profile    | Chapter profiles show “Part of [family]” and link to the family page.                                           |
| R-004 | Network scope   | The network header carries a persistent “Viewing My network” badge and lists the included campuses.             |
| R-011 | Wire ticker     | Reduced motion stops the crawl, renders one static wrapped list and hides the pause control.                    |
| R-012 | Network page    | Pending affiliations are shown in the header with a direct campus-access link, even when active campuses exist. |
| R-015 | Event composer  | The officer event list and event detail show a Network badge for network-published events.                      |
| R-017 | Audience writes | Commitments use the same campus/network audience rule, with one host roster and campus-scoped discussion.       |

## Rules

- Add new ideas here instead of expanding the active phase.
- Use P1 for a broken core task, P2 for a visible polish or comprehension gap,
  P3 for an optional product idea.
- Remove an item only when it is implemented and verified.
