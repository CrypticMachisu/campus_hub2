import { useCallback, useLayoutEffect, useRef, useState } from "react";
import gsap from "gsap";
import Flip from "gsap/Flip";

import { prefersReducedMotion } from "./usePageMotion";

let flipRegistered = false;

function ensureFlip() {
  if (flipRegistered) return;
  gsap.registerPlugin(Flip);
  flipRegistered = true;
}

/**
 * Capture the current cards before a filter state change, then animate the
 * cards that survive the change into their new positions. Cards removed by the
 * filter are left to React, so nothing is temporarily re-shown or positioned
 * absolutely outside its section.
 *
 * Call the returned function inside the filter's event handler, immediately
 * before updating state.
 */
export function useFlipLayout(rootRef, { selector = "[data-flip-card]", stageRef = null } = {}) {
  const stateRef = useRef(null);
  const startHeightRef = useRef(null);
  const timelineRef = useRef(null);
  const [revision, setRevision] = useState(0);

  const capture = useCallback(() => {
    if (!rootRef.current || prefersReducedMotion()) return;
    ensureFlip();
    timelineRef.current?.kill();

    const cards = [...rootRef.current.querySelectorAll(selector)];
    if (cards.length === 0) return;
    startHeightRef.current = stageRef?.current?.offsetHeight ?? null;
    stateRef.current = Flip.getState(cards);
    setRevision((value) => value + 1);
  }, [rootRef, selector, stageRef]);

  useLayoutEffect(() => {
    const state = stateRef.current;
    if (!state) return;
    stateRef.current = null;

    if (!rootRef.current || prefersReducedMotion()) return;

    const stage = stageRef?.current;
    const startHeight = startHeightRef.current;
    startHeightRef.current = null;

    if (stage && startHeight != null) {
      const endHeight = stage.offsetHeight;
      gsap.killTweensOf(stage);
      gsap.set(stage, { height: startHeight });
      gsap.to(stage, {
        height: endHeight,
        duration: 0.45,
        ease: "power2.inOut",
        onComplete: () => gsap.set(stage, { clearProps: "height" }),
      });
    }

    const cards = [...rootRef.current.querySelectorAll(selector)];
    if (cards.length === 0) return;

    timelineRef.current = Flip.from(state, {
      targets: cards,
      duration: 0.45,
      ease: "power2.out",
      stagger: 0.025,
      absolute: false,
      onEnter: (elements) =>
        gsap.fromTo(
          elements,
          { opacity: 0, y: 8 },
          { opacity: 1, y: 0, duration: 0.3, ease: "power2.out" }
        ),
    });
  }, [revision, rootRef, selector, stageRef]);

  useLayoutEffect(
    () => () => {
      timelineRef.current?.kill();
      if (stageRef?.current) gsap.killTweensOf(stageRef.current);
    },
    [stageRef]
  );

  return capture;
}
