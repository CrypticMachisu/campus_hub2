import { useLayoutEffect } from "react";
import gsap from "gsap";
import SplitText from "gsap/SplitText";

import { prefersReducedMotion } from "./usePageMotion";

let splitRegistered = false;

function ensureSplitText() {
  if (splitRegistered) return;
  gsap.registerPlugin(SplitText);
  splitRegistered = true;
}

/**
 * The Discover page opens like an edition being set: the title arrives first,
 * then the lead story, its facts and finally the clubs underneath. No pinning,
 * no scroll-jacking. The reading-progress hairline is the only ongoing motion.
 */
export function useDiscoverMotion(rootRef, { ready = true } = {}) {
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!ready || !root || prefersReducedMotion()) return;

    ensureSplitText();

    let titleSplit;
    let leadSplit;
    let removeProgress = null;
    let restored = false;
    const masks = [];

    const restoreSplitDom = () => {
      if (restored) return;
      restored = true;
      for (const { mask, line } of masks) {
        if (mask.parentNode) {
          mask.parentNode.insertBefore(line, mask);
          mask.remove();
        }
      }
      leadSplit?.revert();
      titleSplit?.revert();
    };

    const wrapLine = (line) => {
      const mask = document.createElement("span");
      mask.style.display = "block";
      mask.style.overflow = "hidden";
      line.parentNode.insertBefore(mask, line);
      mask.appendChild(line);
      masks.push({ mask, line });
      return line;
    };

    const context = gsap.context(() => {
      const kicker = root.querySelector('[data-discover="kicker"]');
      const title = root.querySelector('[data-discover="title"]');
      const deck = root.querySelector('[data-discover="deck"]');
      const lead = root.querySelector('[data-discover="lead"]');
      const quiet = root.querySelector('[data-discover="quiet"]');
      const wire = root.querySelector('[data-discover="wire"]');
      const rows = root.querySelectorAll('[data-motion="card"]');

      titleSplit = title
        ? new SplitText(title, { type: "chars,words", charsClass: "discover-char" })
        : null;

      if (lead) {
        const leadTitle = lead.querySelector('[data-discover="lead-title"]');
        if (leadTitle) {
          leadSplit = new SplitText(leadTitle, { type: "lines", linesClass: "discover-line" });
          leadSplit.lines.forEach(wrapLine);
        }
      }

      const timeline = gsap.timeline({
        defaults: { ease: "power3.out" },
        onComplete: restoreSplitDom,
      });

      if (kicker) {
        timeline.from(kicker, { opacity: 0, y: 10, duration: 0.45 });
      }
      if (titleSplit?.chars?.length) {
        timeline.from(
          titleSplit.chars,
          { yPercent: 115, opacity: 0, duration: 0.65, stagger: 0.018 },
          "-=0.22"
        );
      }
      if (deck) {
        timeline.from(deck, { opacity: 0, y: 14, duration: 0.5 }, "-=0.4");
      }

      if (lead) {
        const dateline = lead.querySelector('[data-discover="dateline"]');
        const standfirst = lead.querySelector('[data-discover="standfirst"]');
        const byline = lead.querySelector('[data-discover="byline"]');
        const actions = lead.querySelector('[data-discover="actions"]');
        const facts = lead.querySelector('[data-discover="facts"]');
        const art = lead.querySelector('[data-discover="art"]');
        const stamp = lead.querySelector('[data-discover="stamp"]');

        if (dateline) timeline.from(dateline, { opacity: 0, y: 8, duration: 0.35 }, "-=0.2");
        if (leadSplit?.lines?.length) {
          timeline.from(
            leadSplit.lines,
            { yPercent: 112, opacity: 0, duration: 0.8, stagger: 0.08 },
            "-=0.08"
          );
        }
        if (standfirst) {
          timeline.from(standfirst, { opacity: 0, y: 10, duration: 0.45 }, "-=0.4");
        }
        if (byline) timeline.from(byline, { opacity: 0, y: 8, duration: 0.35 }, "-=0.2");
        if (actions) {
          timeline.from(
            actions.children,
            { opacity: 0, y: 10, duration: 0.4, stagger: 0.06 },
            "-=0.12"
          );
        }
        if (facts) {
          timeline.from(
            facts.children,
            { opacity: 0, y: 12, duration: 0.4, stagger: 0.06 },
            "-=0.2"
          );
        }
        if (art) {
          timeline.from(
            art,
            { opacity: 0, x: 28, clipPath: "inset(0 0 0 100%)", duration: 0.85 },
            "-=0.55"
          );
        }
        if (stamp) {
          timeline.from(
            stamp,
            { scale: 0.4, rotation: -16, opacity: 0, duration: 0.55, ease: "back.out(1.7)" },
            "-=0.45"
          );
        }
      } else if (quiet) {
        timeline.from(quiet, { opacity: 0, y: 18, duration: 0.6 }, "-=0.15");
      }

      if (wire) timeline.from(wire, { opacity: 0, y: 10, duration: 0.4 }, "-=0.2");
      if (rows.length) {
        timeline.from(
          rows,
          { opacity: 0, y: 16, duration: 0.45, stagger: 0.04, clearProps: "opacity,transform" },
          "-=0.15"
        );
      }

      const progress = root.querySelector('[data-discover="progress"]');
      if (progress) {
        const updateProgress = () => {
          const max = document.documentElement.scrollHeight - window.innerHeight;
          gsap.set(progress, { scaleX: max > 0 ? Math.min(1, window.scrollY / max) : 0 });
        };
        updateProgress();
        window.addEventListener("scroll", updateProgress, { passive: true });
        removeProgress = () => window.removeEventListener("scroll", updateProgress);
      }
    }, root);

    return () => {
      removeProgress?.();
      context.revert();
      restoreSplitDom();
    };
  }, [ready, rootRef]);
}
