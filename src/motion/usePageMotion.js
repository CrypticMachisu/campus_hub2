import { useLayoutEffect } from "react";
import gsap from "gsap";

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

export function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

/**
 * A deliberately small entrance sequence: header children, then any card-like
 * items marked with data-motion="card". It runs once when the page's data is
 * ready and never hides content while reduced motion is requested.
 */
export function usePageMotion(rootRef, { ready = true } = {}) {
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!ready || !root || prefersReducedMotion()) return;

    const context = gsap.context(() => {
      const header = root.querySelector('[data-motion="header"]');
      const headerItems = header ? [...header.children] : [];
      if (headerItems.length > 0) {
        gsap.from(headerItems, {
          opacity: 0,
          y: 12,
          duration: 0.55,
          stagger: 0.06,
          ease: "power2.out",
          clearProps: "opacity,transform",
        });
      }

      const cards = root.querySelectorAll('[data-motion="card"]');
      if (cards.length > 0) {
        gsap.from(cards, {
          opacity: 0,
          y: 16,
          duration: 0.5,
          stagger: 0.045,
          delay: 0.08,
          ease: "power2.out",
          clearProps: "opacity,transform",
        });
      }
    }, root);

    return () => context.revert();
  }, [ready, rootRef]);
}
