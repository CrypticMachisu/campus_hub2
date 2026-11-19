# Phase 5 two-campus pilot

Recorded 19 November 2026 against the standalone database with
`CROSS_UNIVERSITY_ENABLED=true`.

## Fixture

A temporary second campus and family were created for the pilot, then removed:

- **Riverside University** as the affiliated campus;
- **Debate Across Campuses** with the existing Strathmore debate club and a new
  Riverside chapter;
- an active exchange affiliation for the demo member;
- one network event, one network notice and one network commitment.

No production campus, family or member data was changed permanently.

## Flows observed

1. **My network** listed both campuses in the persistent scope label and showed
   the network notice, commitment and event with the correct host campus.
2. The network event rendered on its actual date. The pilot caught and fixed a
   v2 date bug where the MySQL `DATE` was converted through UTC and shifted one
   day back.
3. The member opened the commitment notice, joined, saw themselves counted on
   the host roster, and withdrew again.
4. The remote club profile showed the read-only network boundary, the family
   backlink and no local feed. A missing logo now renders a monogram instead of
   a broken image.
5. The family page showed both chapter identities while stating that campus
   activity stays local. The copy now names network-published items explicitly.
6. The wire was measured while crawling at 1280px and 390px. The label and the
   clipping viewport do not intersect, and mobile has no horizontal overflow.

## Accessibility

- Keyboard: eight consecutive Tab stops moved through the shell and main
  navigation with a visible solid focus outline.
- Accessibility tree: Chrome reported **zero unnamed buttons, links, textboxes
  or comboboxes** on My network, the commitment notice, the family page, the
  officer dashboard and family settings.
- Every form control on the dashboard, commitment composer and family settings
  had a programmatic label.
- Mobile viewport: `scrollWidth` equalled `innerWidth` at 390px.

## Performance

Warm requests against the enabled API, three samples per path, local MySQL:

| Path                             | Median |   Max |
| -------------------------------- | -----: | ----: |
| `/clubs?scope=network`           |  60 ms | 72 ms |
| `/events?scope=network`          |  62 ms | 74 ms |
| `/posts/network?scope=network`   |  10 ms | 11 ms |
| `/commitments?scope=network`     |  74 ms | 75 ms |
| `/commitments/:id?scope=network` |   9 ms | 10 ms |

Repeat runs should account for the API's per-key rate limit; the first attempt
hit a `429` after the burst.

## Defects fixed during the pilot

- v2 events returned the previous calendar day.
- The wire label could be covered by the animated track.
- A club without a logo rendered a broken image on its profile.
- The family boundary note implied events never cross campuses.

The remaining refinement list contains optional polish only; none blocks the
Phase 5 gate.
