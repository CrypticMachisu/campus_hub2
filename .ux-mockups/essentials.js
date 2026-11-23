(() => {
  "use strict";

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  const appShell = $("#app-shell");
  const simBar = $(".simbar");
  const live = $("#lab-status");
  const simStatus = $("#sim-status");
  const toastEl = $("#toast");
  const drawerScrim = $("#drawer-scrim");
  const drawer = $("#drawer");
  const drawerTitle = $("#drawer-title");
  const drawerCopy = $("#drawer-copy");
  const drawerTitleInput = $("#drawer-title-input");
  const drawerNotes = $("#drawer-notes");
  const drawerDirtyNote = $("#drawer-dirty");
  const drawerGuard = $("#drawer-guard");
  const modalScrim = $("#modal-scrim");
  const modal = $("#modal");
  const modalTitle = $("#modal-title");
  const modalBody = $("#modal-body");

  let toastTimer;
  let toastHideTimer;

  function escapeHtml(value) {
    return String(value).replace(
      /[&<>"']/g,
      (character) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[character]
    );
  }

  function announce(message) {
    live.textContent = message;
    simStatus.textContent = message;
  }

  function showToast(message, isError = false) {
    clearTimeout(toastTimer);
    clearTimeout(toastHideTimer);
    toastEl.textContent = message;
    toastEl.classList.toggle("is-error", isError);
    toastEl.classList.add("is-visible");
    toastHideTimer = setTimeout(() => toastEl.classList.remove("is-visible"), 3600);
  }

  function isEditable(target) {
    return Boolean(
      target &&
        (target.matches("input, textarea, select") || target.isContentEditable)
    );
  }

  /* ------------------------------------------------------------------ */
  /* URLs: query string on the Vite server, hash on file://             */
  /* ------------------------------------------------------------------ */

  const isFile = window.location.protocol === "file:";
  const defaults = {
    tab: "overview",
    q: "",
    category: "all",
    sort: "newest",
    drawer: "",
  };
  let ui = { ...defaults };
  let hasUrlState = false;

  function readParams() {
    const source = isFile ? window.location.hash.replace(/^#/, "") : window.location.search;
    return new URLSearchParams(source);
  }

  function readState() {
    const params = readParams();
    const tab = params.get("tab");
    const category = params.get("category");
    const sort = params.get("sort");
    return {
      tab: ["overview", "agenda", "members"].includes(tab) ? tab : defaults.tab,
      q: params.get("q") || "",
      category: ["all", "event", "commitment", "post"].includes(category)
        ? category
        : defaults.category,
      sort: ["newest", "oldest", "title"].includes(sort) ? sort : defaults.sort,
      drawer: params.get("drawer") || "",
    };
  }

  function stateParams() {
    const params = new URLSearchParams();
    if (ui.tab !== defaults.tab) params.set("tab", ui.tab);
    if (ui.q.trim()) params.set("q", ui.q.trim());
    if (ui.category !== defaults.category) params.set("category", ui.category);
    if (ui.sort !== defaults.sort) params.set("sort", ui.sort);
    if (ui.drawer) params.set("drawer", ui.drawer);
    return params;
  }

  function writeUrl({ push = false } = {}) {
    const params = stateParams();
    const query = params.toString();
    const label = query ? `?${query}` : "clean · defaults";
    $("#url-readout").textContent = label;
    $("#url-status").textContent = query ? "URL synced" : "Defaults";

    if (isFile) {
      const nextHash = query ? `#${query}` : "";
      if (window.location.hash === nextHash) return;
      if (push) {
        window.location.hash = query;
      } else {
        try {
          history.replaceState(null, "", nextHash || window.location.pathname);
        } catch {
          window.location.hash = query;
        }
      }
      return;
    }

    const nextUrl = `${window.location.pathname}${query ? `?${query}` : ""}`;
    try {
      history[push ? "pushState" : "replaceState"]({}, "", nextUrl);
    } catch {
      // A locked-down file preview can refuse history writes; the UI still works.
    }
  }

  const ITEMS = [
    {
      id: "debate",
      title: "Friday night debate",
      category: "event",
      label: "Event",
      date: "Fri 20",
      notes: "Set the room for 17:00. Confirm the judging panel before Thursday.",
      copy: "Two rounds, an open floor, and the novice bracket finals.",
    },
    {
      id: "farm-visit",
      title: "Saturday farm visit",
      category: "commitment",
      label: "Commitment",
      date: "Sat 21",
      notes: "Meet at the main gate at 08:30. Bring the sign-in sheet and water.",
      copy: "A working visit to the campus demonstration plot.",
    },
    {
      id: "pitch-night",
      title: "Agri pitch night",
      category: "event",
      label: "Event",
      date: "Thu 26",
      notes: "Two judges still needed. Confirm the projector with the business school.",
      copy: "Five student teams pitch smallholder finance ideas to a campus panel.",
    },
    {
      id: "soil-note",
      title: "Soil health reading list",
      category: "post",
      label: "Post",
      date: "2d ago",
      notes: "Add the two new papers to the resource folder.",
      copy: "A short reading list on soil health and smallholder finance.",
    },
    {
      id: "field-notes",
      title: "Field notes from the demo plot",
      category: "post",
      label: "Post",
      date: "4d ago",
      notes: "Photograph the trial beds before the next visit.",
      copy: "What the club learned from the first season of the demo plot.",
    },
  ];

  function renderList() {
    const needle = ui.q.trim().toLowerCase();
    const list = ITEMS.filter((item) => {
      const categoryMatch = ui.category === "all" || item.category === ui.category;
      const searchMatch =
        !needle ||
        `${item.title} ${item.label} ${item.copy}`.toLowerCase().includes(needle);
      return categoryMatch && searchMatch;
    }).sort((a, b) => {
      if (ui.sort === "title") return a.title.localeCompare(b.title);
      if (ui.sort === "oldest") return ITEMS.indexOf(b) - ITEMS.indexOf(a);
      return ITEMS.indexOf(a) - ITEMS.indexOf(b);
    });

    $("#workspace-list").innerHTML = list.length
      ? list
          .map(
            (item) => `
              <li class="workspace-row">
                <span class="row-date">${escapeHtml(item.date)}</span>
                <span class="workspace-row-copy">
                  <strong>${escapeHtml(item.title)}</strong>
                  <span>${escapeHtml(item.label)} · ${escapeHtml(item.copy)}</span>
                </span>
                <button class="row-open" type="button" data-open-detail="${escapeHtml(item.id)}">
                  Open
                </button>
              </li>
            `
          )
          .join("")
      : `<li class="mini-note" style="padding:.8rem 0">No items match “${escapeHtml(
          ui.q
        )}”.</li>`;

    $("#result-count").textContent = `${list.length} of ${ITEMS.length} items shown`;
  }

  function applyState() {
    $$(".tab").forEach((button) => {
      const active = button.dataset.tab === ui.tab;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-selected", String(active));
      button.tabIndex = active ? 0 : -1;
    });
    $$(".tab-panels > [role='tabpanel']").forEach((panel) => {
      panel.hidden = panel.id !== `panel-${ui.tab}`;
    });

    $("#url-search").value = ui.q;
    $("#url-category").value = ui.category;
    $("#url-sort").value = ui.sort;
    renderList();
  }

  function changeState(patch, { push = false, message = "" } = {}) {
    ui = { ...ui, ...patch };
    applyState();
    writeUrl({ push });
    if (message) announce(message);
  }

  /* ------------------------------------------------------------------ */
  /* Focus layers                                                       */
  /* ------------------------------------------------------------------ */

  const layerStack = [];
  let drawerLayer = null;
  let modalLayer = null;
  let drawerDirty = false;
  let pendingNavigation = "";

  function getFocusable(panel) {
    return $$(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      panel
    ).filter((element) => element.getClientRects().length > 0);
  }

  function syncLayerState() {
    const open = layerStack.length > 0;
    document.body.classList.toggle("layer-open", open);
    appShell.inert = open;
    simBar.inert = open;
  }

  function pushLayer({ scrim, panel, trigger, onClose, initialFocus }) {
    const layer = { scrim, panel, trigger, onClose, lastFocus: document.activeElement };
    layerStack.push(layer);
    scrim.hidden = false;
    syncLayerState();
    requestAnimationFrame(() => {
      (initialFocus || getFocusable(panel)[0] || panel).focus();
    });
    return layer;
  }

  function popLayer(layer) {
    const index = layerStack.indexOf(layer);
    if (index >= 0) layerStack.splice(index, 1);
    layer.scrim.hidden = true;
    syncLayerState();

    const next = layerStack[layerStack.length - 1];
    if (next) {
      (getFocusable(next.panel)[0] || next.panel).focus();
    } else if (layer.trigger && typeof layer.trigger.focus === "function") {
      layer.trigger.focus();
    }
  }

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && layerStack.length) {
      event.preventDefault();
      layerStack[layerStack.length - 1].onClose();
      return;
    }

    if (event.key === "Tab" && layerStack.length) {
      const top = layerStack[layerStack.length - 1];
      const focusable = getFocusable(top.panel);
      if (!focusable.length) {
        event.preventDefault();
        top.panel.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      const outside = !top.panel.contains(active);

      if (event.shiftKey && (active === first || outside)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || outside)) {
        event.preventDefault();
        first.focus();
      }
      return;
    }

    if (event.key === "?" && !layerStack.length && !isEditable(event.target)) {
      event.preventDefault();
      openShortcuts();
      return;
    }

    if (event.key === "/" && !layerStack.length && !isEditable(event.target)) {
      event.preventDefault();
      $("#url-search").focus();
    }
  });

  /* ------------------------------------------------------------------ */
  /* Modal                                                              */
  /* ------------------------------------------------------------------ */

  function closeModal() {
    if (!modalLayer) return;
    const layer = modalLayer;
    modalLayer = null;
    modalBody.innerHTML = "";
    popLayer(layer);
  }

  function openModal({ title, body, onMount, trigger = document.activeElement }) {
    if (modalLayer) closeModal();
    modalTitle.textContent = title;
    modalBody.innerHTML = body;
    modalLayer = pushLayer({
      scrim: modalScrim,
      panel: modal,
      trigger,
      onClose: closeModal,
      initialFocus: modalBody.querySelector("input, select, textarea, button, a[href]") || modal,
    });
    onMount?.(modalBody);
  }

  $("#modal-close").addEventListener("click", closeModal);
  modalScrim.addEventListener("click", (event) => {
    if (event.target === modalScrim) closeModal();
  });

  function openShortcuts() {
    openModal({
      title: "Keyboard shortcuts",
      trigger: $("#shortcuts-trigger"),
      body: `
        <p>A small, honest legend for the lab. Production would add only the shortcuts that are
        available on the current screen.</p>
        <ul class="key-list">
          <li><span>Open this legend</span><kbd>?</kbd></li>
          <li><span>Close the top layer</span><kbd>Esc</kbd></li>
          <li><span>Move through a layer</span><kbd>Tab</kbd></li>
          <li><span>Move backwards</span><kbd>Shift + Tab</kbd></li>
          <li><span>Focus workspace search</span><kbd>/</kbd></li>
        </ul>
      `,
    });
  }

  $("#shortcuts-trigger").addEventListener("click", openShortcuts);
  $("#shortcuts-inline").addEventListener("click", openShortcuts);

  /* ------------------------------------------------------------------ */
  /* Drawer + dirty guard                                               */
  /* ------------------------------------------------------------------ */

  function setDrawerDirty(next) {
    drawerDirty = next;
    drawerDirtyNote.hidden = !next;
  }

  function loadDrawer(item, trigger = document.activeElement) {
    if (drawerLayer) {
      popLayer(drawerLayer);
      drawerLayer = null;
    }

    drawerTitle.textContent = item.title;
    drawerCopy.textContent = item.copy;
    drawerTitleInput.value = item.title;
    drawerNotes.value = item.notes;
    drawerGuard.hidden = true;
    pendingNavigation = "";
    setDrawerDirty(false);

    drawerLayer = pushLayer({
      scrim: drawerScrim,
      panel: drawer,
      trigger,
      onClose: attemptCloseDrawer,
      initialFocus: drawerTitleInput,
    });
    announce(`${item.title} detail opened. Focus is trapped in the drawer.`);
  }

  function openDrawerById(id, { push = true, trigger = document.activeElement } = {}) {
    const item = ITEMS.find((entry) => entry.id === id);
    if (!item) return;
    ui = { ...ui, drawer: id };
    writeUrl({ push });
    loadDrawer(item, trigger);
  }

  function closeDrawer({ force = false, fromHistory = false } = {}) {
    if (!drawerLayer) return;
    if (drawerDirty && !force) {
      drawerGuard.hidden = false;
      $("#guard-stay").focus();
      return;
    }
    const layer = drawerLayer;
    drawerLayer = null;
    drawerGuard.hidden = true;
    pendingNavigation = "";
    setDrawerDirty(false);
    ui = { ...ui, drawer: "" };
    popLayer(layer);
    if (!fromHistory) writeUrl();
    announce("Drawer closed. Focus returned to the trigger.");
  }

  function attemptCloseDrawer() {
    if (drawerDirty) {
      pendingNavigation = "";
      drawerGuard.hidden = false;
      $("#guard-stay").focus();
      announce("Unsaved changes. Stay and save, or discard.");
      return;
    }
    closeDrawer();
  }

  $("#open-drawer").addEventListener("click", () => openDrawerById("debate"));
  $("#open-drawer-secondary").addEventListener("click", () => openDrawerById("pitch-night"));
  $("#drawer-close").addEventListener("click", attemptCloseDrawer);
  $("#drawer-cancel").addEventListener("click", attemptCloseDrawer);
  drawerScrim.addEventListener("click", (event) => {
    if (event.target === drawerScrim) attemptCloseDrawer();
  });

  drawerTitleInput.addEventListener("input", () => setDrawerDirty(true));
  drawerNotes.addEventListener("input", () => setDrawerDirty(true));

  $("#drawer-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const title = drawerTitleInput.value.trim() || "Untitled";
    const item = ITEMS.find((entry) => entry.id === ui.drawer);
    if (item) {
      item.title = title;
      item.notes = drawerNotes.value;
    }
    drawerTitle.textContent = title;
    setDrawerDirty(false);
    closeDrawer({ force: true });
    showToast("Draft saved. The URL kept the same detail.");
    announce("Draft saved. Drawer closed and focus restored.");
  });

  $("#guard-stay").addEventListener("click", () => {
    drawerGuard.hidden = true;
    drawerNotes.focus();
    announce("Stayed in the drawer. The draft is still here.");
  });

  $("#guard-discard").addEventListener("click", () => {
    const destination = pendingNavigation;
    pendingNavigation = "";
    setDrawerDirty(false);
    drawerGuard.hidden = true;
    closeDrawer({ force: true });
    if (destination) {
      window.location.href = destination;
      return;
    }
    announce("Draft discarded. No changes were saved.");
  });

  $$("[data-exit-link]").forEach((link) => {
    link.addEventListener("click", (event) => {
      if (!drawerDirty) return;
      event.preventDefault();
      pendingNavigation = link.href;
      drawerGuard.hidden = false;
      $("#guard-stay").focus();
      announce("Navigation blocked: unsaved drawer changes.");
    });
  });

  window.addEventListener("beforeunload", (event) => {
    if (!drawerDirty) return;
    event.preventDefault();
    event.returnValue = "";
  });

  /* ------------------------------------------------------------------ */
  /* URL wiring                                                         */
  /* ------------------------------------------------------------------ */

  $$(".tab").forEach((button) => {
    button.addEventListener("click", () => {
      if (button.dataset.tab === ui.tab) return;
      changeState({ tab: button.dataset.tab }, { push: true, message: `${button.dataset.tab} tab` });
    });
  });

  $('[role="tablist"]').addEventListener("keydown", (event) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const tabs = $$(".tab");
    const current = tabs.findIndex((tab) => tab.dataset.tab === ui.tab);
    const next =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? tabs.length - 1
          : (current + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
    const target = tabs[next];
    changeState({ tab: target.dataset.tab }, { push: true, message: `${target.dataset.tab} tab` });
    target.focus();
  });

  $("#url-search").addEventListener("input", (event) => {
    ui = { ...ui, q: event.target.value };
    renderList();
    writeUrl();
  });

  $("#url-category").addEventListener("change", (event) => {
    changeState({ category: event.target.value }, { push: true, message: "Category filter updated" });
  });

  $("#url-sort").addEventListener("change", (event) => {
    changeState({ sort: event.target.value }, { push: true, message: "Sort order updated" });
  });

  $("#url-reset").addEventListener("click", () => {
    if (drawerLayer) closeDrawer({ force: true });
    ui = { ...defaults };
    applyState();
    writeUrl({ push: true });
    announce("View reset to defaults. URL is clean.");
    showToast("View reset. The URL no longer carries filters.");
  });

  window.addEventListener("popstate", restoreFromHistory);
  if (isFile) window.addEventListener("hashchange", restoreFromHistory);

  function restoreFromHistory() {
    if (drawerDirty && drawerLayer) {
      writeUrl({ push: true });
      drawerGuard.hidden = false;
      $("#guard-stay").focus();
      announce("Navigation blocked: the drawer still has unsaved changes.");
      return;
    }

    const next = readState();
    const drawerChanged = next.drawer !== ui.drawer;
    ui = next;
    applyState();
    writeUrl();

    if (drawerChanged) {
      if (ui.drawer) {
        const item = ITEMS.find((entry) => entry.id === ui.drawer);
        if (item) loadDrawer(item, $("#open-drawer"));
      } else if (drawerLayer) {
        closeDrawer({ force: true, fromHistory: true });
      }
    }
    announce("View restored from the URL.");
  }

  document.addEventListener("click", (event) => {
    const opener = event.target.closest("[data-open-detail]");
    if (opener) {
      openDrawerById(opener.dataset.openDetail, { trigger: opener });
    }
  });

  $("#share-view").addEventListener("click", async () => {
    const url = window.location.href;
    try {
      await navigator.clipboard.writeText(url);
      showToast("Share link copied. It carries the current view.");
    } catch {
      const field = document.createElement("input");
      field.value = url;
      document.body.appendChild(field);
      field.select();
      try {
        document.execCommand("copy");
        showToast("Share link copied.");
      } catch {
        showToast("Copy is blocked in this preview. Select the URL from the field.", true);
      }
      field.remove();
    }
    announce("Current view copied as a share link.");
  });

  /* ------------------------------------------------------------------ */
  /* Widget boundaries                                                  */
  /* ------------------------------------------------------------------ */

  const widgetCrashes = { pulse: false, attendance: false, budget: false };

  const widgetRenderers = {
    pulse() {
      if (widgetCrashes.pulse) throw new Error("Pulse query failed");
      return `
        <p class="widget-value"><b>+18%</b><span>RSVP velocity</span></p>
        <div class="spark" aria-hidden="true">
          <i style="--h:32%"></i><i style="--h:52%"></i><i style="--h:41%"></i>
          <i style="--h:68%"></i><i style="--h:60%"></i><i style="--h:84%"></i>
          <i style="--h:72%"></i><i style="--h:92%"></i>
        </div>
      `;
    },
    attendance() {
      if (widgetCrashes.attendance) throw new Error("Attendance row failed");
      return `
        <p class="widget-value"><b>42</b><span>going</span></p>
        <p class="mini-note">37 attended · 5 on the waitlist</p>
        <div class="meter" aria-hidden="true"><span style="--value:81%"></span></div>
      `;
    },
    budget() {
      if (widgetCrashes.budget) throw new Error("Budget summary failed");
      return `
        <p class="widget-value"><b>64%</b><span>of term budget</span></p>
        <p class="mini-note">KSh 48,200 of 75,000 committed</p>
        <div class="meter" aria-hidden="true"><span style="--value:64%"></span></div>
      `;
    },
  };

  function renderWidgets() {
    let failed = 0;
    Object.entries(widgetRenderers).forEach(([id, render]) => {
      const target = $(`[data-widget-body="${id}"]`);
      if (!target) return;
      try {
        target.innerHTML = render();
      } catch (error) {
        failed += 1;
        console.warn(`Widget boundary caught ${id}:`, error);
        target.innerHTML = `
          <div class="widget-error" role="alert">
            <p><strong>${id.charAt(0).toUpperCase() + id.slice(1)} failed.</strong>
            The other widgets are still live.</p>
            <button type="button" data-retry-widget="${id}">Retry widget</button>
          </div>
        `;
      }
    });

    $("#widget-status").textContent = failed
      ? `${failed} boundary${failed === 1 ? "" : "ies"} caught`
      : "All widgets healthy";
  }

  function crashOneWidget() {
    const next = ["pulse", "attendance", "budget"].find((id) => !widgetCrashes[id]);
    if (!next) {
      Object.keys(widgetCrashes).forEach((id) => {
        widgetCrashes[id] = false;
      });
      showToast("All widgets recovered. Crashing Pulse again.");
      widgetCrashes.pulse = true;
    } else {
      widgetCrashes[next] = true;
    }
    renderWidgets();
    $("#boundary-note").innerHTML =
      "The boundary replaced only the failed widget. Retry lives inside the card.";
    announce("One widget crashed. The rest of the workspace kept rendering.");
  }

  document.addEventListener("click", (event) => {
    const retry = event.target.closest("[data-retry-widget]");
    if (!retry) return;
    const id = retry.dataset.retryWidget;
    widgetCrashes[id] = false;
    renderWidgets();
    announce(`${id} widget recovered locally.`);
    showToast(`${id.charAt(0).toUpperCase() + id.slice(1)} recovered without a page reload.`);
  });

  /* ------------------------------------------------------------------ */
  /* Pointer / touch                                                    */
  /* ------------------------------------------------------------------ */

  let touchSimulated = false;
  const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)");

  function renderPointerState() {
    document.body.classList.toggle("sim-touch", touchSimulated);
    $$("#touch-toggle, [data-sim='touch']").forEach((button) => {
      button.setAttribute("aria-pressed", String(touchSimulated));
      if (button.id === "touch-toggle") {
        button.textContent = touchSimulated ? "Return to fine pointer" : "Simulate touch device";
      }
    });
    $("#pointer-status").textContent = touchSimulated
      ? "Simulated touch"
      : finePointer.matches
        ? "Fine pointer"
        : "Touch pointer";
    $("#pointer-note").textContent = touchSimulated
      ? "Actions stay visible and tappable; no hover is required."
      : "Hover or keyboard-focus a row to reveal its actions.";
  }

  function toggleTouch() {
    touchSimulated = !touchSimulated;
    renderPointerState();
    announce(
      touchSimulated
        ? "Touch device simulated. Row actions are permanently visible."
        : "Fine pointer restored. Row actions are hover/focus revealed."
    );
    showToast(touchSimulated ? "Touch actions stay visible." : "Hover disclosure restored.");
  }

  $("#touch-toggle").addEventListener("click", toggleTouch);
  finePointer.addEventListener?.("change", renderPointerState);

  document.addEventListener("click", (event) => {
    const action = event.target.closest("[data-row-action]");
    if (!action) return;
    showToast(`${action.dataset.rowAction} is reachable with a tap.`);
    announce(`${action.dataset.rowAction} action triggered.`);
  });

  /* ------------------------------------------------------------------ */
  /* Z-index + URL inspector                                            */
  /* ------------------------------------------------------------------ */

  function openInspector() {
    const names = [
      ["--z-base", "Base content"],
      ["--z-sticky", "Sticky header / lab bar"],
      ["--z-dropdown", "Dropdown menu"],
      ["--z-drawer", "Detail drawer"],
      ["--z-modal", "Modal / re-auth"],
      ["--z-toast", "Connection pill / toast"],
      ["--z-tooltip", "Tooltip"],
    ];
    const styles = getComputedStyle(document.documentElement);
    const query = stateParams().toString();
    const rows = names
      .map(
        ([name, label], index) => `
          <li>
            <span>${label}</span>
            <span><code>${name}</code> <b>${styles.getPropertyValue(name).trim()}</b></span>
          </li>
        `
      )
      .join("");
    const preview = names
      .map(
        ([name, label], index) =>
          `<span style="--i:${index};z-index:var(${name})">${index + 1}. ${label}</span>`
      )
      .join("");

    openModal({
      title: "Layer & URL inspection",
      trigger: $("#inspect-layer"),
      body: `
        <p>One ladder owns every overlay. The lab bar sits at the sticky layer; the drawer and
        modal sit above it, while toasts and tooltips can still surface.</p>
        <ul class="z-list">${rows}</ul>
        <div class="z-preview" aria-label="Z-index layer preview">${preview}</div>
        <p class="url-state-line"><strong>URL state:</strong> ${
          query ? `?${escapeHtml(query)}` : "clean · defaults"
        }<br/><strong>Full URL:</strong> ${escapeHtml(window.location.href)}</p>
        <div class="modal-actions">
          <button class="btn btn-primary" type="button" data-copy-url>Copy this URL</button>
          <button class="btn" type="button" data-close-modal>Close</button>
        </div>
      `,
    });
  }

  document.addEventListener("click", (event) => {
    if (event.target.closest("[data-close-modal]")) closeModal();
    if (event.target.closest("[data-copy-url]")) {
      navigator.clipboard
        ?.writeText(window.location.href)
        .then(() => showToast("URL copied from the inspector."))
        .catch(() => showToast("Copy is blocked in this preview.", true));
    }
  });

  $("#inspect-layer").addEventListener("click", openInspector);

  /* ------------------------------------------------------------------ */
  /* Session expiry                                                     */
  /* ------------------------------------------------------------------ */

  function openSessionExpiry(trigger = document.activeElement) {
    const draft = drawerLayer ? drawerNotes.value : $("#draft-note").value;
    const preview = draft.trim() || "No draft yet. This modal would keep any text you had written.";
    openModal({
      title: "Your session expired",
      trigger,
      body: `
        <p>Your sign-in timed out. The draft below is still intact; re-authenticate to keep working
        without losing the page state.</p>
        <span class="draft-preview">${escapeHtml(preview)}</span>
        <form id="reauth-form">
          <label>
            Password
            <input type="password" id="reauth-password" autocomplete="current-password" required />
          </label>
          <div class="modal-actions">
            <button class="btn btn-primary" type="submit">Continue session</button>
            <button class="btn" type="button" data-close-modal>Not now</button>
          </div>
        </form>
      `,
      onMount(body) {
        const form = $("#reauth-form", body);
        const password = $("#reauth-password", body);
        form.addEventListener("submit", (event) => {
          event.preventDefault();
          if (!password.value) {
            password.focus();
            return;
          }
          closeModal();
          $("#network-status").textContent = "Session restored";
          $("#session-readout").textContent = "Draft preserved through re-authentication.";
          showToast("Session restored. Your draft is still here.");
          announce("Re-authenticated. No form state was lost.");
        });
        password.focus();
      },
    });
    $("#network-status").textContent = "Session expired";
    announce("Session expired. Re-authentication opened without clearing the draft.");
  }

  $("#session-expire").addEventListener("click", (event) =>
    openSessionExpiry(event.currentTarget)
  );

  /* ------------------------------------------------------------------ */
  /* Offline pill                                                       */
  /* ------------------------------------------------------------------ */

  let offlineSimulated = false;
  let reconnecting = false;
  let reconnectTimer;

  function renderConnection() {
    const pill = $("#connection-pill");
    const text = $("#connection-text");
    const networkStatus = $("#network-status");
    const actuallyOffline = !navigator.onLine;

    if (offlineSimulated) {
      pill.hidden = false;
      pill.dataset.state = "offline";
      text.textContent = "Offline · changes stay queued";
      networkStatus.textContent = "Offline (simulated)";
      networkStatus.dataset.state = "offline";
    } else if (reconnecting) {
      pill.hidden = false;
      pill.dataset.state = "reconnecting";
      text.textContent = "Reconnecting…";
      networkStatus.textContent = "Reconnecting";
    } else if (actuallyOffline) {
      pill.hidden = false;
      pill.dataset.state = "offline";
      text.textContent = "Offline · changes stay queued";
      networkStatus.textContent = "Offline";
    } else {
      pill.hidden = true;
      networkStatus.textContent = $("#network-status").dataset.state === "restored"
        ? "Session restored"
        : "Online";
      delete networkStatus.dataset.state;
    }
  }

  function toggleOffline() {
    clearTimeout(reconnectTimer);
    if (offlineSimulated) {
      offlineSimulated = false;
      reconnecting = true;
      renderConnection();
      announce("Reconnecting. The page remains usable.");
      reconnectTimer = setTimeout(() => {
        reconnecting = false;
        renderConnection();
        showToast("Back online. Queued changes were kept.");
        announce("Back online. Nothing was discarded.");
      }, 1400);
    } else {
      offlineSimulated = true;
      reconnecting = false;
      renderConnection();
      showToast("Offline. You can keep reading and editing.");
      announce("Offline status pill shown. It does not block the page.");
    }
  }

  $("#offline-inline").addEventListener("click", toggleOffline);
  window.addEventListener("online", renderConnection);
  window.addEventListener("offline", renderConnection);

  /* ------------------------------------------------------------------ */
  /* Type, theme, scroll, fallback                                      */
  /* ------------------------------------------------------------------ */

  let fallbackShown = false;
  $("#fallback-toggle").addEventListener("click", (event) => {
    fallbackShown = !fallbackShown;
    $("#fallback-sample").classList.toggle("use-fallback", fallbackShown);
    event.currentTarget.setAttribute("aria-pressed", String(fallbackShown));
    event.currentTarget.textContent = fallbackShown ? "Show live font" : "Show fallback";
    $("#layout-status").textContent = fallbackShown ? "Fallback metrics" : "Stable";
    announce(
      fallbackShown
        ? "Metric-matched fallback shown. The line box stays close."
        : "Live Archivo restored."
    );
  });

  let scrollExpanded = false;
  $("#scroll-toggle").addEventListener("click", (event) => {
    const frame = $("#scroll-frame");
    const inner = $("#scroll-frame-inner");
    const before = frame.getBoundingClientRect().width;
    scrollExpanded = !scrollExpanded;

    let extra = $(".scroll-extra", inner);
    if (!extra) {
      extra = document.createElement("div");
      extra.className = "scroll-extra";
      extra.innerHTML = `
        <p>Waitlist: two places opened after the venue change.</p>
        <p>Reading group: Thursday, 16:00, library annex.</p>
        <p>Seed library: bring empty packets for the exchange.</p>
        <p>Field trip consent forms are due Friday.</p>
        <p>Volunteer roster: still need two drivers.</p>
      `;
      inner.appendChild(extra);
    }
    extra.hidden = !scrollExpanded;
    event.currentTarget.setAttribute("aria-pressed", String(scrollExpanded));
    event.currentTarget.textContent = scrollExpanded ? "Shrink frame" : "Grow frame";

    requestAnimationFrame(() => {
      const after = frame.getBoundingClientRect().width;
      const shift = Math.abs(after - before);
      $("#scroll-readout").textContent =
        shift < 0.5
          ? "Frame width held through the scrollbar change (0px shift)."
          : `Frame shifted ${shift.toFixed(1)}px.`;
      announce(
        shift < 0.5
          ? "Scrollbar gutter reserved. No horizontal shift."
          : "The scrollbar changed the frame width."
      );
    });
  });

  function setTheme(dark, { announceChange = true } = {}) {
    document.documentElement.dataset.theme = dark ? "dark" : "";
    $$("#theme-toggle, #theme-toggle-inline").forEach((button) => {
      button.setAttribute("aria-pressed", String(dark));
      if (button.id === "theme-toggle") button.textContent = dark ? "Paper mode" : "Dark mode";
      if (button.id === "theme-toggle-inline") {
        button.textContent = dark ? "Return to paper mode" : "Toggle dark mode";
      }
    });
    $("#theme-status").textContent = dark ? "Dark · oklch elevation" : "Paper mode";
    if (announceChange) {
      announce(dark ? "Dark mode. Surfaces step up in lightness." : "Paper mode restored.");
    }
  }

  function toggleTheme() {
    setTheme(document.documentElement.dataset.theme !== "dark");
  }

  $("#theme-toggle").addEventListener("click", toggleTheme);
  $("#theme-toggle-inline").addEventListener("click", toggleTheme);

  /* ------------------------------------------------------------------ */
  /* Scroll rail + simulation bar                                       */
  /* ------------------------------------------------------------------ */

  document.addEventListener("click", (event) => {
    const scrollButton = event.target.closest("[data-scroll]");
    if (!scrollButton) return;
    const target = document.getElementById(scrollButton.dataset.scroll);
    if (!target) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    target.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    announce(`${target.querySelector("h2")?.textContent || "Section"} in view.`);
  });

  $$("[data-sim]").forEach((button) => {
    button.addEventListener("click", () => {
      switch (button.dataset.sim) {
        case "crash":
          crashOneWidget();
          break;
        case "offline":
          toggleOffline();
          break;
        case "session":
          openSessionExpiry(button);
          break;
        case "touch":
          toggleTouch();
          break;
        case "guard":
          if (!drawerLayer) {
            openDrawerById("debate", { trigger: button });
            setTimeout(() => {
              drawerNotes.value =
                "Draft: shift the debate to the auditorium and confirm the judges.";
              setDrawerDirty(true);
              attemptCloseDrawer();
            }, 120);
          } else {
            drawerNotes.value =
              "Draft: shift the debate to the auditorium and confirm the judges.";
            setDrawerDirty(true);
            attemptCloseDrawer();
          }
          announce("Focus drawer opened with a dirty draft. Try Cancel or Escape.");
          break;
        case "inspect":
          openInspector();
          break;
        default:
          break;
      }
    });
  });

  /* ------------------------------------------------------------------ */
  /* Boot                                                               */
  /* ------------------------------------------------------------------ */

  ui = readState();
  hasUrlState = Boolean(readParams().toString());
  applyState();
  writeUrl();
  if (hasUrlState) $("#url-status").textContent = "Restored from URL";
  renderWidgets();
  renderPointerState();
  renderConnection();
  setTheme(window.matchMedia("(prefers-color-scheme: dark)").matches, {
    announceChange: false,
  });

  if (ui.drawer) {
    const item = ITEMS.find((entry) => entry.id === ui.drawer);
    if (item) {
      requestAnimationFrame(() => loadDrawer(item, $("#open-drawer")));
    } else {
      ui = { ...ui, drawer: "" };
      writeUrl();
    }
  }

  announce(
    hasUrlState
      ? "Lab ready. The current view was restored from the URL."
      : "Lab ready. Every simulator is available in the floating test bar."
  );
})();
