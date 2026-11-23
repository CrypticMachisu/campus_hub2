# GSAP on Kesho: deliberation and design studies

## Question

Should Kesho use GSAP, and if so, where does motion earn its place?

The app currently has no animation library. CSS handles the wire ticker, the
splash, hover states and the reduced-motion reset. That is the right starting
point: most of the product is reading, scanning and deciding, not spectacle.

## Short answer

Use GSAP, but as a **small motion layer** on a few narrative surfaces — not as
a global page-transition system and not as a substitute for layout or CSS.

The strongest fit is the public/editorial edge of the product: Discover, the
family/network pages, and the "this week" story. The weakest fit is forms and
settings, where motion would add latency without improving comprehension.

## What GSAP buys us

| Capability             | Fit               | Why                                                                                                          |
| ---------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------ |
| Timeline orchestration | High              | One readable sequence for hero, ticker and cards instead of scattered CSS delays.                            |
| ScrollTrigger          | High, with limits | Good for reveal-on-scroll and one pinned family/network story. Bad for scroll-jacking and long pin chains.   |
| SplitText              | Medium            | Strong for a short editorial headline; unnecessary for headings users scan repeatedly.                       |
| Flip                   | High on Network   | Family filters and "chapters only" reorder cards. Flip animates the change without duplicating layout logic. |
| DrawSVG / MotionPath   | Medium            | Useful for the network map and family constellation; decorative, so it must fail quietly.                    |
| Draggable              | Low               | A nice agenda/timetable study, but not a core interaction yet.                                               |

GSAP 3.13 is free, including the former Club plugins. That removes the licence
question; it does not remove the performance and accessibility questions.

## What it costs

- Core + ScrollTrigger is roughly 70 kB minified before gzip, plus plugins.
  That is acceptable on a lazy route, not on every page. The current build uses
  static imports, so GSAP is in the main chunk: 530.94 kB minified / 168.30 kB
  gzip, with Vite's >500 kB warning. SplitText and Flip are the only plugins
  loaded; lazy-loading the motion layer remains a follow-up, not a blocker.
- React needs explicit cleanup. `gsap.context()` or `useGSAP()` must revert
  ScrollTriggers when a page unmounts, or route changes accumulate listeners.
- Pinning changes scroll length. On mobile it can fight browser chrome and
  keyboard navigation. Any pinned section needs a reduced-motion and
  small-screen fallback.
- GSAP does not make a weak design good. The mockups keep the Signal system:
  paper, ink, one vermilion signal, hairline rules, mono metadata.

## Recommendation

### Phase 1: motion grammar (low risk)

1. Add `gsap` to the client dependencies. Import it only from a small
   `src/motion/` module; do not register plugins globally.
2. Add one shared reduced-motion gate:
   `gsap.matchMedia()` with `(prefers-reduced-motion: no-preference)`.
3. Use a 0.5–0.7 s `power2.out` entrance on Discover/Network page headers and
   a 40–60 ms stagger on cards. No scroll pinning.
4. Animate only `opacity`, `transform` and SVG stroke properties.

### Phase 2: one narrative moment

5. Build the Discover opening as a short edition sequence: set the title, then
   the lead story, facts and art, then the wire and rows. No pinning.
6. Use Flip for the existing family filter and chapters-only toggle. Capture
   state, change the DOM, then `Flip.from`. This reuses the filter logic we
   already shipped. Pair it with a clipped results stage whose height closes
   with the cards, so the page behaves like one sheet of paper.
7. Keep the wire ticker on CSS. A GSAP loop is unnecessary while the CSS crawl
   already works, pauses, and stops under reduced motion.

### Phase 3: only if it earns its keep

8. Consider a shared-element transition from a network card to its permalink.
   This needs route-level coordination and is not worth it until the network
   pages are used regularly.
9. Keep forms, settings, moderation queues and dashboards out of scope.

## Guardrails

- Content is never hidden behind an animation that might fail to load. Start
  from visible CSS; GSAP sets the "from" state only after it is ready.
- No scroll-jacking, no custom cursor, no autoplay video.
- Every study must remain usable with keyboard only and with reduced motion.
- Measure before/after: route JS, LCP on Discover/Network, long tasks during
  scroll, and Lighthouse accessibility.
- Prefer one well-tuned section over ten decorative ones.

## Design studies

Open `public/mockups/gsap/index.html` through the Vite dev server, or open the
three files directly. They are standalone studies, not app routes.

| Study                      | Direction                                                               | GSAP techniques                                                                                                       |
| -------------------------- | ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `01-signal-editorial.html` | The current Signal language pushed into a scroll-driven campus edition. | SplitText headline, masked line reveals, pinned horizontal chapter strip, scroll progress, magnetic CTA, ticker loop. |
| `02-network-orbit.html`    | A dark "network at night" reading of families and campuses.             | DrawSVG constellation, MotionPath notice, pinned map, mouse parallax, staggered nodes.                                |
| `03-day-sheet.html`        | A kinetic day sheet for scanning and filtering what is on.              | Flip filtering, Draggable agenda strip, card lift/tilt, timeline entrance.                                            |

Each study has a visible "reduced motion" toggle so the fallback can be reviewed
without changing OS settings.

## Implemented in this branch

The motion layer is live in the React app, not the mockups:

- `gsap` is a client dependency, with SplitText and Flip registered only from
  the motion modules.
- `src/motion/useDiscoverMotion.js` sets the Discover edition: SplitText title
  characters, masked lead headline lines, then dateline, standfirst, byline,
  actions, facts, art, stamp, wire and rows. The split DOM is restored when the
  sequence completes, so copy, selection and accessibility return to normal.
- A fixed three-pixel reading line tracks scroll progress on Discover. It is
  hidden under reduced motion and is the only ongoing motion on the page.
- `src/motion/usePageMotion.js` still handles the Network header entrance and
  marked rows once the page data is ready.
- `src/motion/useFlipLayout.js` captures the Network cards before a family or
  chapters-only filter change, animates only the surviving cards, and closes
  the clipped `.resultsStage` from its old height to the new natural height.
  The inline height is cleared on completion.
- `ClubCard` carries `data-flip-card`; Home rows carry `data-motion="card"`.
- Every helper returns early when `prefers-reduced-motion: reduce` is set. No
  content is hidden behind a pending animation.
- There is no pinning, scroll-jacking, horizontal scroll, drag interaction or
  network map in the app. Those remain mockup-only studies.

The preview screenshots in `public/previews/gsap/` were captured from the live
app at 1440px. The filter screenshots use the `seed:preview` fixture; run
`npm run cleanup:preview` from `server` with `DB_NAME=campushub_standalone` to
remove that fixture after review.

## Decision

Phase 1, the Discover signature and the Flip filter are implemented. The
network constellation map and any pinned story remain deliberately unshipped;
the study shows the idea, not a commitment. Do not add GSAP to forms or
settings. Revisit lazy-loading the motion layer before this reaches a slower
network or a stricter performance budget.
