# Standalone refinements

A running list of polish, defects and product ideas that are deliberately not
part of the current phase. We will pick these up after the phase work.

## Open

No open items. New ideas go here, not into an already-closed phase.

## Closed

| ID    | Area            | Resolution                                                                                                                                                                 |
| ----- | --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R-001 | Discovery / UI  | The wire is a three-column grid and the animated track is clipped inside its own viewport, so it cannot cover the label.                                                   |
| R-002 | Club profile    | Chapter profiles show “Part of [family]” and link to the family page.                                                                                                      |
| R-003 | Family pages    | Chapter cards and detail show the next network-visible event, without exposing campus-only activity.                                                                       |
| R-004 | Network scope   | The network header carries a persistent “Viewing My network” badge and lists the included campuses.                                                                        |
| R-005 | Affiliations    | Campus admins see a pending-affiliation badge on Campus access in the masthead.                                                                                            |
| R-006 | Family settings | The family card shows the latest chapter move: source, target, chapter and actor.                                                                                          |
| R-007 | Demo data       | `npm run seed:preview` creates a repeatable two-campus fixture; `cleanup:preview` removes it.                                                                              |
| R-008 | Family marks    | Family editors can choose an image, center-crop it to a 256 px square, preview it and upload it. The URL field remains the fallback when object storage is not configured. |
| R-009 | Family editors  | Appointing a family editor writes an in-app notice linked to Family settings. Email stays optional.                                                                        |
| R-010 | Family settings | The family card shows who last changed family identity and when, from the audit trail.                                                                                     |
| R-011 | Wire ticker     | Reduced motion stops the crawl, renders one static wrapped list and hides the pause control.                                                                               |
| R-012 | Network page    | Pending affiliations are shown in the header with a direct campus-access link, even when active campuses exist.                                                            |
| R-013 | Network page    | The network page filters by family and can show chapters only.                                                                                                             |
| R-014 | Network profile | A remote club profile links straight to Campus access with that campus preselected.                                                                                        |
| R-015 | Event composer  | The officer event list and event detail show a Network badge for network-published events.                                                                                 |
| R-016 | Network events  | Network events open in a scoped detail view with attendance intent; comments and the host roster stay campus-scoped with a boundary note.                                  |
| R-017 | Audience writes | Commitments use the same campus/network audience rule, with one host roster and campus-scoped discussion.                                                                  |
| R-018 | Network notices | Network posts have a read-only permalink naming the host campus; comments remain campus-only.                                                                              |
| R-019 | Discover / UI   | Discover opens as an edition: title, lead story, facts, art, wire and rows are set in sequence, with a reading-progress hairline and no pinning.                           |
| R-020 | Network / UI    | Family and chapters-only filters close a clipped results stage while surviving cards Flip into place, so the boundary note follows instead of jumping.                     |

## Rules

- Add new ideas here instead of expanding the active phase.
- Use P1 for a broken core task, P2 for a visible polish or comprehension gap,
  P3 for an optional product idea.
- Remove an item only when it is implemented and verified.
