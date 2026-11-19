# Standalone refinements

A running list of polish, defects and product ideas that are deliberately not
part of the current phase. We will pick these up after the phase work.

## Open

| ID    | Area            | Item                                                                                                                                                                                                                                     | Priority |
| ----- | --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| R-001 | Discovery / UI  | The orange **Wire** label overlaps the moving ticker text on narrower widths. Reserve a fixed label column with clean separation, or make the label sit outside the scrolling track. See the current screenshot supplied on 19 Nov 2026. | P2       |
| R-002 | Club profile    | Add a “Part of [family]” backlink when a club is a chapter, so readers can move between the local club and its family page.                                                                                                              | P2       |
| R-003 | Family pages    | Show a family mark/logo and a next-event teaser per chapter once network-visible events exist. Keep the chapter’s campus moderation explicit.                                                                                            | P2       |
| R-004 | Network scope   | Add a persistent “You are viewing My network” label and list which affiliated campuses are included, so the broader scope is never ambiguous.                                                                                            | P2       |
| R-005 | Affiliations    | Show a pending-affiliation count in the masthead for campus admins, in the same way pending admin requests are surfaced.                                                                                                                 | P3       |
| R-006 | Family settings | Show the most recent chapter move (source, target, actor, time) on the family card using the existing audit trail.                                                                                                                       | P3       |
| R-007 | Demo data       | Add a preview-only seed with a temporary second campus and a two-chapter family so the family and network states can be reviewed without manual setup.                                                                                   | P3       |
| R-008 | Family marks    | Replace the mark URL field with an upload/crop flow and a live preview; keep the URL field as a fallback for operators.                                                                                                                  | P2       |
| R-009 | Family editors  | Send an in-app or email invitation when tier 1 appoints a family editor, instead of relying on the editor discovering the settings link.                                                                                                 | P2       |
| R-010 | Family settings | Show who last changed family identity and when, using the existing `club_family.update` audit detail.                                                                                                                                    | P3       |     | R-011 | Wire ticker     | Add a reduced-motion state that stops the ticker and presents items as a static wrapped list. | P2  |
| R-012 | Network page    | Add a compact pending-affiliation notice even when the member already has active campuses, with a direct link to `/campus-access`.                                                                                                       | P2       |
| R-013 | Network page    | Add a family filter and a “chapters only” toggle once families are common enough to browse separately from ordinary clubs.                                                                                                               | P3       |     | R-014 | Network profile | Add a “Request access to this campus” shortcut from a remote club profile.                    | P3  |
| R-015 | Event composer  | Show a small “Network” badge in the officer event list and on the event detail so the chosen audience is visible after saving.                                                                                                           | P2       |
| R-016 | Network events  | Add a network event detail view with attendance intent, but keep the host roster and discussion campus-scoped until participation is designed.                                                                                           | P3       |
| R-017 | Audience writes | Extend the same audience pattern to posts and commitments, with a confirmation step before a post can leave campus.                                                                                                                      | P2       |

## Rules

- Add new ideas here instead of expanding the active phase.
- Use P1 for a broken core task, P2 for a visible polish or comprehension gap,
  P3 for an optional product idea.
- Remove an item only when it is implemented and verified.
