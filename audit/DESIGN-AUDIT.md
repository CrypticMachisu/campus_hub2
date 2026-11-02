# CampusHub — Design Audit Report

**Mode**: Full audit sampled across key surfaces (elite-audit rule set)
**Date**: 2026-11-01
**Scope**: Home/feed, Login, Event detail, Club profile, My Events, Dashboard (tier1 admin) at desktop (1440px) and mobile (375px); personae: logged-out, member ("Sofia Ramirez"), tier1 admin ("Amara Okafor").
**Method**: rule-based checklist from the elite-audit skill + DOM/computed-style measurements in a live browser against the running stack (Vite + API + MySQL). No source changes were made.

---

## CRITICAL (2 failures → Ship: NO until fixed)

### C1 — Mobile page-level horizontal overflow for the admin navbar (every page while tier1 is signed in)

- **Rule**: Fixed elements / layout must not overflow the viewport; no horizontal scroll at 375px.
- **Evidence** (measured, viewport 375): `document.scrollWidth = 427px` on `/dashboard/club-01`, `/`, and `/login` while signed in as Amara (navbar contains DISCOVER / MY EVENTS / DASHBOARD + user card + LOG OUT). The header (`_nav`, `_inner`, `_links` sw 314) plus brand (97px) cannot fit; the "Log out" button's right edge lands at x=426. Because the overflowing row is centered in the layout viewport, at `scrollX=0` **both** ends clip: "CampusHub" loses its left half and "Log out" is cut at the right. The admin user card's name is fully collapsed (width **0px**, full text 161px).
- **Impact**: On a phone any admin is one tap away from being unable to see or reach "Log out" without horizontal scrolling; this affects _every_ route while signed in as tier1/tier2, including login itself.
- **Note**: the earlier ellipsis fix (Navbar.module.css `min-width: 0` + `text-overflow`) works mechanically — the member row fits (dw=375, name truncated to 12px) — but the admin row needs a real reflow (e.g. hamburger/wrap below 560px), not more squeezing. See also H7.
- Fix skill: `elite-layouts`, [mobile-dashboard-admin-375.png](mobile-dashboard-admin-375.png)

### C2 — Touch targets far below 44px across the header and filters

- **Rule**: Touch targets ≥ 44×44px with ≥ 8px spacing (accessibility quick checklist).
- **Evidence** (measured at 375 and 1440): header nav links and "Log out" are **25px** tall; category filter chips and Browse Clubs/Events toggles are **~35px** tall; login "Post" comment button 36px. At 375 the nav also squeezes gaps (links sit ~16px apart).
- **Impact**: primary controls (log out, navigation, filtering) are hard to hit reliably on touch; worst offenders are the smallest targets.
- Fix skill: `elite-accessibility` > touch-interaction. Evidence: [mobile-login-375.png](mobile-login-375.png), [mobile-home-admin-375-viewport.png](mobile-home-admin-375-viewport.png)

---

## HIGH (7 failures — should fix before launch)

### H1 — Heading hierarchy skips a level (H1 → H3)

- **Rule**: Sequential heading hierarchy (h1 → h2 → h3, no skips).
- **Evidence** (DOM, Home + `/events/event-05`): `H1 CampusHub Discovery` followed directly by per-card `H3` titles; event detail has `H1` then `H3 Comments`. Club profile is the counter-example that gets it right (H1 → H2 → H3).
- Fix skill: `elite-accessibility`.

### H2 — Toggle/chip state conveyed only by color; no `aria-pressed`

- **Rule**: Color must not be the only means of conveying information; exposed toggles need state semantics.
- **Evidence** (Home.jsx ~line 100): category chips render `<button className={active ? activeFilter : filterBtn}>` with no `aria-pressed`/`aria-current`; same for the "Browse Clubs / Browse Events" view toggle and the Login "USER/ADMIN" path toggle. Screen-reader users cannot tell which filter is active.
- Fix skill: `elite-ux-strategy` > forms-feedback (+ `elite-accessibility`).

### H3 — Home search input has a placeholder, not a visible label

- **Rule**: Every input visible label (placeholder-only = fail).
- **Evidence** (Home.jsx line 91): `<input type="text" placeholder="Search by name, description, or tags...">` with no label/aria-label. The login and dashboard forms are fully labeled by contrast (`htmlFor` present) — pass.
- Fix skill: `elite-accessibility`.

### H4 — Form errors are not announced and don't move focus

- **Rule**: Errors appear below the field with cause + fix; focus moves to first error; `aria-live` for async feedback.
- **Evidence** (Login.jsx line 239): `{loginError && <p className={styles.error}>{loginError}</p>}` — no `role="alert"`, and nothing focuses the field/first error after submit fails. Only the Skeleton loader uses `aria-live` anywhere in `src/`; no toast system exists (rules requiring `aria-live` polite toasts).
- Fix skill: `elite-ux-strategy` > forms-feedback.

### H5 — Comment form overflows its column on mobile club profile

- **Rule**: No clipped/overflowing content inside a responsive grid.
- **Evidence** (measured on `/clubs/club-01` at 375): page `scrollWidth = 379px` (4px horizontal scroll). Culprit chain: the comments surface (`_section_6erjt`: sw 282 vs cw 182) holds `.form` (`display:flex`, gap 8) whose input (`flex:1`, implicit `min-width:auto`, 178px) + Post button (64px) need 250px; the Post button's right edge reaches x=379, past the viewport. `ClubProfile.module.css:63` `grid-template-columns: repeat(auto-fill, minmax(280px, 1fr))` leaves the section ~182px wide at 375, so the inert flex row can't shrink.
- Fix skill: `elite-layouts` (input needs `min-width: 0` / the grid needs to collapse), [club profile overflow included in C1 screenshot set].

### H6 — Images have no dimensions or lazy loading (CLS risk on feeds)

- **Rule**: Images use AVIF/WebP with explicit dimensions; below-fold content lazy loaded.
- **Evidence**: every `<img>` (ClubCard, EventCard, content detail and profile hero) renders with neither `width`/`height` attributes nor `loading="lazy"`; no `srcset`/AVIF anywhere; detail images arrive at 600px natural width for a ~343px slot. On the feeds this shifts layout while club/event images load.
- Fix skill: `elite-performance` > asset-optimization.

### H7 — Member identity unreadably truncated on mobile navbar

- **Rule**: Progressive disclosure instead of collapse-to-invisible.
- **Evidence** (measured at 375, member persona): the repaired `<span class userInfo>` with ellipsis shrinks the full "Sofia Ramirez (Member)" **169px** card into **12px** — wider than "( M" territory, effectively invisible. The 320/400pon sweep shows the same: at 320 the row overflows even after the squeeze; at 400 the name alone truncates. If the row can't fit, hide or move the name below 560px instead of squeezing it to a sliver.
- Fix skill: `elite-layouts`. Evidence: [member-400-truncated.png](navbar-sweep/member-400-truncated.png)

---

## MEDIUM (recommendations, non-blocking)

1. **Muted text on alt surfaces dips below 4.5:1.** `--color-text-muted #6b6457` on `--color-bg-alt #eae0c7` = **4.46:1** (fails for small text; 4.97:1 on the main `--color-bg` passes). Check every surface muted text actually sits on, especially card headers and the navbar. → `elite-accessibility` > wcag-contrast.
2. **Primary red as small-text color on paper.** `--color-primary #c1432e` on `--color-bg` = **4.33:1** — below AA for small text (fine for ≥18.66px or bold). Links in body copy should use `--color-primary-dark #8f2e1d` (6.91:1). The navbar already does this; elsewhere primary raw is still used for small text. → `elite-accessibility`.
3. **Raw hex off the token system in the comments panel.** `ClubProfile.module.css:88-90` uses `#f7f9fa` / `#edf1f2` — a cool gray against the warm corkboard palette, the only raw hex outside `theme.css`. → `elite-design-core` > design-tokens.
4. **Dashboard is a single full-width column at 1440.** Seven stacked 928px panels make one very long scroll; the panels pair naturally (Create/forms vs Admin management/Events), so a two-column split above ~1100px would suit the content. → `elite-layouts`. Evidence: [desktop-dashboard-admin-full.png](desktop-dashboard-admin-full.png)
5. **Native `window.confirm` for destructive actions** (event delete, admin revoke). Functional (rule for confirmation passes) but unstyled and unbranded. → `elite-ux-strategy`.
6. **Signed-in users can open /login** with the form fully interactive, and the email field keeps the previous account's address after logout — both minor UX/privacy smells. → `elite-ux-strategy` > navigation-patterns.
7. **Feed dates are stale data, not a design bug.** All seeded events are Oct 1–28, 2026 with today Nov 1: "Upcoming events" lists past dates and RSVP shows "Event has already happened". Worth refreshing the seed or making the seed relative to "now". → data, not layout.
8. **Render-blocking Google Fonts CSS** in `index.html` (preconnect is present, `display=swap` ✓). Acceptable; self-hosting (or a font subset) would shave the request. Bundle budget passes: **69.1 KB gz JS / 5.1 KB KB gz CSS** (218 KB / 23.8 KB raw).

---

## Rules verified passing (evidence: code + DOM)

- Viewport meta: `width=device-width, initial-scale=1.0`, no `user-scalable=no` (index.html).
- Focus: global `:focus-visible` ring, 2px outline + 2px offset, on a/button/input/textarea/select (theme.css:94).
- Reduced motion: global freeze + Skeleton-specific `@media (prefers-reduced-motion: reduce)` (theme.css:109, Skeleton.module.css:129).
- Visible labels with `htmlFor` on Login/Signup/Name/Reminder forms; designated "Show password" toggle has an aria-label that flips (Login.jsx, PasswordField.jsx:25).
- Decorative images use `alt=""`, meaningful ones have real alt (ClubCard/EventCard vs ClubProfile logo/member).
- Destructive actions require confirmation (Dashboard.jsx:255, 675).
- Stats table uses real `<table>` semantics; dashboard `<select>`s and labels are correctly associated; server data carries semantic `disabled` (e.g. expired-event RSVP).
- No vertical `100vh` sections (mobile-safe), no emoji-as-icons anywhere.
- No horizontal overflow on desktop (1440): `dw=vw` on every page checked; member feeds also fit at 375 (dw=375).
- Design tokens discipline everywhere except finding M3; type/spacing run entirely on the theme scale; one primary CTA per surface observed.

---

## Verdict (per elite-audit format)

| Priority | Result                                                        |
| -------- | ------------------------------------------------------------- |
| CRITICAL | 0 / 2 pass — **BLOCKED**                                      |
| HIGH     | 0 / 7 pass — needs work                                       |
| MEDIUM   | 8 recommendations                                             |
| Ship     | **NO** (blockers: C1 mobile admin overflow, C2 touch targets) |

**Suggested fix order**: C1 + C2 + H7 are one coherent header/layout pass (wrap the auth row, larger hit areas, move design for <560px), then H5 (comment form `min-width: 0`), then the a11y annotation pass (H1–H4), then images (H6), then M-item polish.

---

## Captured evidence (this audit)

- [desktop-dashboard-admin-full.png](desktop-dashboard-admin-full.png) — tier1 dashboard @1440 (layout M4 evidence)
- [mobile-dashboard-admin-375.png](mobile-dashboard-admin-375.png) — admin overflow @375 (C1)
- [mobile-home-admin-375-viewport.png](mobile-home-admin-375-viewport.png) — clipped navbar at scroll 0 (C1)
- [mobile-login-375.png](mobile-login-375.png) — login @375 (C2 target heights; navbar clip)
- [home-desktop-full.png](home-desktop-full.png) — feed @1440 (corkboard system, M8 budgets)
- [home-desktop-bottom.png](home-desktop-bottom.png) — feed lower half @1440
- [member-320-overflow.png](navbar-sweep/member-320-overflow.png), [member-400-truncated.png](navbar-sweep/member-400-truncated.png) — navbar sweep (H7)

_Captures were made with the app window unhidden; full-page captures at some widths reproduce a horizontal-tiling artifact of the capture pane itself (documented where relevant — the DOM numbers above are the authoritative measurements). One identical duplicate (`desktop-dashboard-bottom.png`) is saved alongside but not referenced._

---

_Report generated without modifying any source file._
