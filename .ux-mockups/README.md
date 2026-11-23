# Kesho UX lab — loading and motion directions

This folder is an isolated review surface. It does **not** import into the app, change routes, or
alter production components. Open `index.html` first.

## How to open

Either double-click `index.html`, or run the normal Vite server from the project root:

```text
http://127.0.0.1:5173/.ux-mockups/index.html
```

The mockups use the real Signal tokens, the self-hosted Anton/Archivo/Plex Mono files and campus
images. GSAP 3.15.1, Flip and SplitText are vendored in `vendor/` from the installed `gsap` package,
so the lab has no third-party CDN dependency. If those files are missing, the loading states and
buttons still work, but the movement is skipped.

To refresh the vendored copy after a GSAP upgrade:

```text
cp node_modules/gsap/dist/gsap.min.js node_modules/gsap/dist/Flip.min.js \
  node_modules/gsap/dist/SplitText.min.js .ux-mockups/vendor/
```

## Structural essentials lab

`essentials.html` is a separate, production-free review page for the cross-cutting behaviour that
should become the global CSS baseline, router hooks and shared wrappers:

- `scrollbar-gutter`, balanced/pretty wrapping, readable measures and metric-matched font fallbacks.
- URL state for tabs, search, filters, sort and the open detail drawer, including reload and Back.
- Independent widget boundaries with local retry, focus-trapped drawer/modal layers and dirty-form
  guards (`Cancel`, the exit link, browser Back and `beforeunload`).
- Pointer-aware row actions, `100dvh`, safe-area padding, focus return and a formal z-index ladder.
- Non-blocking offline/reconnecting pill, session-expiry re-authentication that preserves drafts,
  dark-mode `oklch` lightness elevation, branded selection, truncation reveal and a `?` legend.

Open `essentials.html` directly or at
`http://127.0.0.1:5173/.ux-mockups/essentials.html`. The floating test bar drives every simulation.

## Directions

| Direction                   | Screen         | Loading strategy                                                                                                                                       | Motion strategy                                                                               |
| --------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| **A — The Instant Desk**    | Discover       | 160ms loader hold, exact-shape skeletons, Skeleton → content crossfade, warm-cache SWR                                                                 | 200–220ms crossfades, 35ms row stagger, optimistic Flip filter, no SplitText                  |
| **B — The Morning Edition** | Discover       | Typographic skeleton, 1.8s staged load, LQIP blurred image settle                                                                                      | SplitText title, masked lead lines, art clip reveal, Flip + clipped paper stage               |
| **C — Quiet Operations**    | Club workspace | Header and metrics immediate; next event, feed and roster hydrate independently at 600/1080/1520ms, with plate frames held and shape-matched skeletons | Optimistic pin with Flip, boundary-level empty/error, determinate roster export               |
| **D — The Edited Desk**     | Discover       | Masthead immediate; lead, club index and desk rail set independently at 600/1080/1520ms, with plate heights reserved so arrivals do not move the page  | SplitText lead + LQIP + paper filter, club-only empty/error boundary, determinate edition PDF |

## Required simulation controls

Every direction has the floating bar:

- **Cold load (1.8s)** — shows the shaped skeleton and the content hand-off.
- **Warm cache (<100ms)** — renders cached content immediately, then silently revalidates.
- **Optimistic / Flip** — changes state at once and animates the layout. **Alt-click** rehearses a
  rejected write from the clean edition, then restores it with an error toast.
- **Empty / Error** — cycles empty → error → recovered. Direction C applies this only to the club
  feed boundary, and Direction D applies it only to the club plate; the rest of the page survives.

## What the audit found

- `src/components/Skeleton.jsx` already has shape-matched club, event, profile, detail and dashboard
  skeletons; the shimmer is frozen under reduced motion.
- `src/components/ErrorState.jsx` is a paper note with `role="alert"` and an optional retry.
- `src/context/AuthContext.jsx` and `ClubsContext.jsx` gate the app while auth clubs resolve.
- `src/pages/ClubWorkspace.jsx` already tolerates per-panel failures with `Promise.allSettled` and
  optimistically toggles RSVP. There is no shared boundary component yet.
- `src/utils/api.js` bounds requests at 10s and turns network failures into readable errors.
- The existing production motion helpers are in `src/motion/`; they use `gsap.context`, Flip and
  SplitText, and gate reduced motion with `prefers-reduced-motion`.

## Implementation notes

- Skeleton visuals are always `aria-hidden="true"`; loading containers set `aria-busy="true"` and
  carry a visually hidden status label.
- GSAP is set up through `gsap.matchMedia()` for reduced motion. Direction B skips SplitText and
  masks under reduced motion; Direction A/C fall back to short fades or instant state changes.
- No scroll pinning, scroll-jacking or drag interactions are used.
- The long roster export is deliberately determinate: percentage, step label and
  `role="progressbar"` with `aria-valuenow`.
- Direction C's optimistic pin uses `Flip.from()` on the second feed item so the reorder is visible, and restores the exact previous order on failure.
- C hides content and shows the shaped skeletons immediately, then freezes the three section heights
  on wide screens. Each plate arrives inside the same frame, so the next event, feed, roster and
  membership rail do not move during the cold sequence.
- Direction D reads as the B × C blend: B's masthead, type skeleton, SplitText lead, masked lines,
  LQIP and paper filter stage, with C's independent plates and boundary-level recovery. Its public
  `Save the edition` action demonstrates the same determinate long-task pattern as C's roster
  export, without adding a generic dashboard.
- D reserves the measured height of all three plates before a cold load on wide screens. The
  skeletons fill those frames, so each plate can arrive without moving the masthead or shortening
  the page. The save task announces only its phase changes, not every percentage tick.

## Production follow-up (after a direction is chosen)

The reusable primitives would be:

- `<Skeleton />` / `<SkeletonGroup />` — already exists; extend with a delayed-mount wrapper.
- `<StateBoundary />` — owns loading / empty / error / content for one panel, with a crossfade.
- `useDelayedLoading(active, 160)` — prevents sub-150ms loader flashes.
- `useCachedView()` / SWR store — renders a snapshot immediately and refreshes quietly.
- `useOptimisticAction` + `useFlipLayout({ stageRef })` — writes first, rolls back with a toast.
- `useLongTask()` — determinate progress with percentage and step labels.

No production files are changed in this review step.
