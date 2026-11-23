/*
  Shared UX-lab controls. Loaded after GSAP, Flip and (where needed)
  SplitText from the same 3.15.1 release the app uses.
*/
(() => {
  const lab = {};
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  lab.$ = $;
  lab.$$ = $$;
  lab.wait = wait;
  lab.hasGsap = Boolean(window.gsap);
  lab.state = {
    reduced: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  };

  if (window.gsap) {
    if (window.Flip) window.gsap.registerPlugin(window.Flip);
    if (window.SplitText) window.gsap.registerPlugin(window.SplitText);

    const mm = window.gsap.matchMedia();
    mm.add("(prefers-reduced-motion: reduce)", () => {
      lab.state.reduced = true;
    });
    mm.add("(prefers-reduced-motion: no-preference)", () => {
      lab.state.reduced = false;
    });
  }

  lab.canMove = () => lab.hasGsap && !lab.state.reduced;

  lab.setStatus = (text) => {
    const node = $("#sim-status");
    if (node) node.textContent = text;
  };

  lab.setActive = (name) => {
    $$("[data-sim]").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.sim === name);
    });
  };

  lab.bindSim = (handler) => {
    $$("[data-sim]").forEach((button) => {
      button.addEventListener("click", (event) => {
        lab.setActive(button.dataset.sim);
        handler(button.dataset.sim, button, event);
      });
    });
  };

  let toastTimer;
  lab.toast = (message, tone = "ok") => {
    const node = $("#toast");
    if (!node) return;
    clearTimeout(toastTimer);
    node.textContent = message;
    node.classList.toggle("is-error", tone === "error");
    node.classList.add("is-visible");
    toastTimer = setTimeout(() => node.classList.remove("is-visible"), 3200);
  };

  lab.show = (node) => {
    if (node) node.classList.remove("is-hidden");
  };

  lab.hide = (node) => {
    if (node) node.classList.add("is-hidden");
  };

  lab.pulse = (node, scale = 0.95) => {
    if (!lab.canMove() || !node) return;
    window.gsap.fromTo(
      node,
      { scale },
      { scale: 1, duration: 0.28, ease: "power2.out", clearProps: "transform" }
    );
  };

  lab.fadeIn = (node, { y = 8, duration = 0.22, delay = 0 } = {}) => {
    if (!node) return;
    if (!lab.canMove()) {
      if (lab.hasGsap) {
        window.gsap.fromTo(node, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.16, delay });
      } else {
        node.style.opacity = "1";
      }
      return;
    }
    window.gsap.fromTo(
      node,
      { autoAlpha: 0, y },
      { autoAlpha: 1, y: 0, duration, delay, ease: "power2.out", clearProps: "transform" }
    );
  };

  lab.fadeOut = (node, { y = -4, duration = 0.16 } = {}) =>
    new Promise((resolve) => {
      if (!node) return resolve();
      if (!lab.canMove()) {
        lab.hide(node);
        return resolve();
      }
      window.gsap.to(node, {
        autoAlpha: 0,
        y,
        duration,
        ease: "power2.in",
        onComplete: () => {
          lab.hide(node);
          window.gsap.set(node, { clearProps: "opacity,visibility,transform" });
          resolve();
        },
      });
    });

  lab.spinButton = (button, label = "Working") => {
    if (!button) return () => {};
    const original = button.innerHTML;
    const width = button.getBoundingClientRect().width;
    button.style.minWidth = `${Math.ceil(width)}px`;
    button.classList.add("is-loading");
    button.setAttribute("aria-busy", "true");
    button.innerHTML = `<span class="btn-spinner" aria-hidden="true"></span><span>${label}</span>`;
    return () => {
      button.classList.remove("is-loading");
      button.removeAttribute("aria-busy");
      button.style.minWidth = "";
      button.innerHTML = original;
    };
  };

  lab.lqipSettle = (frame, { duration = 0.7 } = {}) => {
    if (!frame) return;
    const lqip = $(".lqip", frame);
    const sharp = $(".sharp", frame);
    if (!sharp) return;
    if (!lab.canMove()) {
      if (lqip) lqip.style.opacity = "0";
      sharp.style.opacity = "1";
      sharp.style.transform = "none";
      return;
    }
    window.gsap.set(sharp, { opacity: 0, scale: 1.03 });
    window.gsap
      .timeline({ defaults: { ease: "power2.out" } })
      .to(sharp, { opacity: 1, scale: 1, duration })
      .to(lqip, { opacity: 0, duration: duration * 0.7 }, 0);
  };

  /**
   * Direction A/B filter: capture surviving cards, change `hidden`, then
   * Flip them and close the clipped stage from the old to the new height.
   * This mirrors the production `useFlipLayout` helper.
   */
  lab.flipFilter = (stage, cards, apply, { duration = 0.36, stagger = 0.025 } = {}) => {
    if (!lab.hasGsap || !window.Flip) {
      apply();
      return;
    }
    const startHeight = stage ? stage.getBoundingClientRect().height : null;
    const state = window.Flip.getState(cards, { props: "opacity" });
    apply();

    const surviving = cards.filter((card) => !card.classList.contains("is-hidden"));
    if (stage && startHeight != null) {
      const endHeight = stage.getBoundingClientRect().height;
      window.gsap.killTweensOf(stage);
      window.gsap.set(stage, { height: startHeight });
      window.gsap.to(stage, {
        height: endHeight,
        duration: lab.canMove() ? duration : 0.01,
        ease: "power2.inOut",
        onComplete: () => window.gsap.set(stage, { clearProps: "height" }),
      });
    }

    if (!surviving.length) return;
    window.Flip.from(state, {
      targets: surviving,
      duration: lab.canMove() ? duration : 0.01,
      ease: "power2.out",
      stagger: lab.canMove() ? stagger : 0,
      absolute: false,
      onEnter: (elements) => {
        if (!lab.canMove()) return;
        window.gsap.fromTo(
          elements,
          { opacity: 0, y: 6 },
          { opacity: 1, y: 0, duration: 0.22, ease: "power2.out" }
        );
      },
    });
  };

  window.UXLab = lab;
})();
