// Per-club "playbook": the small amount of vocabulary and content that makes a
// workspace feel like *this* club rather than a generic page with a logo on it.
//
// Two layers, in this order:
//   1. Category defaults  — free, so a brand-new club already reads correctly.
//   2. Club overrides     — nullable columns on `clubs` (migration 005) that an
//                           admin edits from the club dashboard.
//
// Deliberately small: an RSVP verb, a "what to bring" note, and one focus
// panel. Everything else (agenda, feed, roster, discussion) stays shared, so
// seven categories don't become seven forks of the workspace.

const DEFAULT_FOCUS = {
  kicker: "Club focus",
  title: "What's coming up",
  body: "Announcements and events from the club land here first.",
  items: [],
  link: "",
};

export const CATEGORY_PLAYBOOKS = {
  Academic: {
    rsvpLabel: "I'll be there",
    cancelLabel: "Can't make it",
    bringNote: "Bring your case notes — prep starts 10 minutes before the round.",
    focus: {
      kicker: "This week's brief",
      title: "Motion & case prep",
      body: "Every session opens with a motion. Come with one argument for it and one against it.",
      items: [
        "Read the brief posted in the feed",
        "Pick your speaking role before you arrive",
        "Bring one piece of evidence you can cite",
      ],
      link: "",
    },
  },
  "Arts & Culture": {
    rsvpLabel: "I'm in",
    cancelLabel: "Sitting this out",
    bringNote: "Bring a camera or a phone — there's always something worth shooting.",
    focus: {
      kicker: "This week's prompt",
      title: "Shoot to a theme",
      body: "Each week has a prompt. Post your best frame and leave one honest note on someone else's.",
      items: ["Shoot the weekly prompt", "Post one frame to the feed", "Leave one critique"],
      link: "",
    },
  },
  "Sports & Fitness": {
    rsvpLabel: "I'm running",
    cancelLabel: "Sitting this out",
    bringNote: "Meet five minutes early — groups leave on the dot.",
    focus: {
      kicker: "Pace groups",
      title: "Pick your pace",
      body: "Three groups go out together, so nobody runs alone. Move down a group on a hard week.",
      items: ["A · sub-5:00/km", "B · 5:00–6:00/km", "C · conversational, walk breaks welcome"],
      link: "",
    },
  },
  Technology: {
    rsvpLabel: "I'll be there",
    cancelLabel: "Can't make it",
    bringNote: "Bring a laptop and charger — project nights are hands-on.",
    focus: {
      kicker: "Demo night",
      title: "Claim a five-minute slot",
      body: "Show what you're building, then take questions. No slides needed — show it working.",
      items: [
        "Demo something unfinished",
        "Say what you're stuck on",
        "Post your repo in the feed",
      ],
      link: "",
    },
  },
  "Community Service": {
    rsvpLabel: "I'm volunteering",
    cancelLabel: "Can't make it",
    bringNote: "Closed shoes and a water bottle. Transport leaves from the Student Union.",
    focus: {
      kicker: "Saturday shift",
      title: "Before you go",
      body: "Shifts are planned around who's coming, so the RSVP is what books the van.",
      items: [
        "RSVP by Friday so transport is booked",
        "Bring a water bottle and closed shoes",
        "Log your hours after the shift",
      ],
      link: "",
    },
  },
  Agriculture: {
    rsvpLabel: "I'll be there",
    cancelLabel: "Can't make it",
    bringNote: "Field days need closed shoes — some plots are muddy.",
    focus: {
      kicker: "Market day",
      title: "What's in season",
      body: "Growers list produce on AgroConnect ahead of the Saturday market stall.",
      items: [
        "Check the new grower listings",
        "Bring cash for the market stall",
        "Share one grower worth following",
      ],
      link: "",
    },
  },
  Social: {
    rsvpLabel: "I'm coming",
    cancelLabel: "Can't make it",
    bringNote: "Bring something to share if you can — there's always a table for it.",
    focus: {
      kicker: "Bring-a-thing",
      title: "What to bring",
      body: "Potluck rules: bring something, or bring someone. Both count.",
      items: ["Bring a dish, snack or drink", "A +1 is welcome", "Post what you're bringing"],
      link: "",
    },
  },
};

/** Clubs whose category has no playbook yet still get usable copy. */
export const DEFAULT_PLAYBOOK = {
  rsvpLabel: "I'm going",
  cancelLabel: "Can't make it",
  bringNote: "",
  focus: DEFAULT_FOCUS,
};

/**
 * Merge a club's overrides over its category defaults.
 * @param {{ category?: string, playbookOverrides?: object } | null | undefined} club
 */
export function getClubPlaybook(club) {
  const base = CATEGORY_PLAYBOOKS[club?.category] || DEFAULT_PLAYBOOK;
  const overrides = club?.playbookOverrides || {};
  const items = Array.isArray(overrides.focusItems) ? overrides.focusItems.filter(Boolean) : [];

  return {
    rsvpLabel: overrides.rsvpLabel || base.rsvpLabel,
    cancelLabel: base.cancelLabel,
    bringNote: overrides.bringNote || base.bringNote,
    focus: {
      kicker: base.focus.kicker,
      title: overrides.focusTitle || base.focus.title,
      body: overrides.focusBody || base.focus.body,
      items: items.length > 0 ? items : base.focus.items,
      link: overrides.focusLink || base.focus.link || "",
    },
    isCustomized: Boolean(
      overrides.rsvpLabel ||
      overrides.bringNote ||
      overrides.focusTitle ||
      overrides.focusBody ||
      items.length > 0 ||
      overrides.focusLink
    ),
  };
}
