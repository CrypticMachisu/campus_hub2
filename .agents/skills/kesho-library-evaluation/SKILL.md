---
name: kesho-library-evaluation
description: Evaluated third-party visual libraries for Kesho / CampusHub — Canvas UI, Pretext, Pokemon Cards CSS and ShaderGradient. Use when considering adding animation, canvas, text-layout, holographic-card or shader effects to the app, when someone proposes one of these libraries, or when reviewing a dependency that adds visual runtime weight. The current decision is not to adopt any of them; this file records why, the allowed experiments, and the acceptance gate for revisiting.
---

# Kesho library evaluation

Decision date: **2026-11-22**. Status: **not adopted**.

These are reference notes, not installation instructions. Do not add any of
these libraries to `package.json`, copy their source into `src/`, or wire them
into a page without a new decision recorded here and in the PR.

The governing design system is `.agents/skills/kesho-design/SKILL.md`. Signal is
a campus daily edition: newsprint surfaces, editorial type, one primary action,
no decorative effects that compete with the content.

## Decision summary

| Library                                                              | Licence              | What it does                                             | Verdict                                                                      |
| -------------------------------------------------------------------- | -------------------- | -------------------------------------------------------- | ---------------------------------------------------------------------------- |
| [Canvas UI](https://github.com/DavidHDev/canvas-ui)                  | MIT + Commons Clause | WebGL/WebGPU effects over live HTML via `html-in-canvas` | **Do not adopt** for this app                                                |
| [Pretext](https://github.com/chenglou/pretext)                       | MIT                  | DOM-free multiline text measurement and layout           | **Do not adopt yet**; revisit only for a measured text-layout bottleneck     |
| [Pokemon Cards CSS](https://github.com/simeydotme/pokemon-cards-css) | GPL-3.0              | Holographic card transforms, gradients and blend modes   | **Do not use**                                                               |
| [ShaderGradient](https://github.com/ruucm/shadergradient)            | MIT                  | Animated 3D gradients via React Three Fiber              | **Do not adopt** for the main app; narrowly scoped marketing experiment only |

## Canvas UI

**Why it is interesting:** real DOM stays interactive while shaders distort or
refract it; 35+ effects; React/Vue/Svelte/vanilla source; WebGL and WebGPU
builds; source is copied through a shadcn-compatible registry.

**Why it does not fit Kesho:**

- Most of the library depends on the experimental `html-in-canvas` API, which
  is Chrome-only and may require a flag or a domain-bound origin trial. Kesho
  must work in ordinary Safari, Firefox and Chrome.
- Effects are continuous, GPU-heavy and visually dominant. The Signal system
  explicitly bans decorative gradients, glows and motion that competes with the
  edition.
- The library is distributed as source, not a versioned package. That makes
  upgrades and security review manual.
- The licence is **MIT + Commons Clause**, not plain MIT. Commercial app use is
  allowed, but reselling or redistributing the components themselves is not.
  Any legal review should happen before adoption.

**Allowed experiment:** a throwaway branch prototype of one effect on a
non-critical surface, never the feed, forms or officer desk. It must:

1. Feature-detect support and fall back to plain HTML.
2. Respect `prefers-reduced-motion: reduce` by rendering the static fallback.
3. Keep all text selectable, focusable and in the accessibility tree.
4. Add no more than one effect per page.
5. Be lazy-loaded and measured for bundle and GPU cost.

If those conditions cannot be met, stop.

## Pretext

**Why it is interesting:** ~15 KB, zero runtime dependencies, MIT, Unicode-aware
text measurement without DOM reads. Useful when many text blocks must be
measured before render, such as a virtualized feed or a canvas/SVG composition.

**Why it is not needed now:**

- Kesho's text is ordinary CSS layout. There is no measured `getBoundingClientRect`
  or reflow bottleneck in the current feed, club page, agenda or desk.
- Adding a second layout engine creates a fidelity risk for the custom display
  and mono faces, especially with bidi, CJK and emoji.
- The app already ships a 500 kB+ JS chunk. A 15 KB library is small, but it
  buys complexity without a demonstrated problem.

**Revisit only when:** a profiler shows text measurement or reflow is a real
cost on a named screen, and the fix cannot be achieved with CSS containment,
`content-visibility`, virtualization or fewer DOM measurements. If adopted,
keep DOM text as the source of truth, test RTL/CJK/emoji, and do not use it for
ordinary paragraphs.

## Pokemon Cards CSS

**Why it is interesting:** unusually polished CSS transforms, gradients,
blend modes and pointer tracking for a tactile card effect.

**Why it is rejected:**

- **GPL-3.0** is incompatible with simply copying the styles into this
  proprietary app without a deliberate licensing decision.
- The holographic trading-card aesthetic directly conflicts with Signal's
  newsprint palette, square corners, hairline rules and restrained motion.
- The effect depends on pointer position, layered shine/glare elements and
  continuous compositing. It is the wrong interaction model for a campus
  listings and commitments product.

Do not copy the CSS, port the Svelte components or use the card assets. Visual
ideas may inspire a bespoke treatment, but the implementation must be original
and must pass the design skill.

## ShaderGradient

**Why it is interesting:** high-quality animated 3D gradients with a visual
editor and React/Framer/Figma integrations.

**Why it does not fit the main app:**

- It brings `@react-three/fiber`, `three`, `three-stdlib` and
  `camera-controls`; this is a large runtime addition to a bundle that already
  triggers the 500 kB warning.
- Continuous WebGL animation is the opposite of the Signal motion budget
  (one reveal, sparse micro-motion, no ambient background animation).
- A moving gradient would fight the paper background in both light and dark
  mode, and would need a separate static fallback for reduced motion and
  low-power devices.

**Allowed experiment:** an isolated, lazy-loaded login or campaign landing
background behind a feature flag, never the member workspace. Requirements:

1. Static poster or CSS gradient first; load the shader only after interaction
   or idle, and only on capable devices.
2. Honor `prefers-reduced-motion`; no animation by default.
3. Keep the form and text on an opaque or near-opaque surface for contrast.
4. Measure the added bundle and verify no layout shift or input lag.
5. Remove it if it does not materially improve comprehension or conversion.

## Acceptance gate for any visual dependency

Before adopting any of these, record all of the following in the PR:

- The user problem it solves, with a before/after measurement.
- Bundle delta (minified and gzip) and whether it is lazy-loaded.
- Browser support and the fallback for unsupported browsers.
- Reduced-motion and keyboard behavior.
- Contrast check against both light and dark tokens.
- Licence review, including assets and fonts.
- A failure/removal plan if the effect underperforms.

If the answer is "it looks cool", the answer is no. Kesho's advantage is
editorial clarity, not visual effects.
