// The v2 -> UI mapping is the one place `startTime` becomes the `date` + `time`
// the components read. If it broke, nothing would throw: every reader would
// simply get undefined fields and sort every event as "oldest" or "past", the
// quiet failure VERSIONING_NOTES §3 describes. These pin the conversion.
//
// The store imports the fetch wrapper, whose Vite `import.meta.env` cannot be
// parsed outside a bundler, so the wrapper is replaced before the import runs.
jest.mock("../src/utils/api", () => ({ apiFetch: jest.fn() }));

import { toUiEvent } from "../src/utils/eventsStore.js";

// A v2 event as the API returns it: one ISO timestamp with the +03:00 offset,
// no separate date/time.
const EVENT = {
  id: "custom-1",
  clubId: "club-01",
  title: "Novice Debate Night",
  location: "Humanities Hall, Room 214",
  startTime: "2026-11-13T18:30:00+03:00",
};

describe("toUiEvent", () => {
  it("maps a normal timestamp to date and HH:MM, keeping every other field", () => {
    const ui = toUiEvent(EVENT);

    expect(ui.date).toBe("2026-11-13");
    expect(ui.time).toBe("18:30");
    expect(ui.startTime).toBeUndefined();
    expect(ui.title).toBe("Novice Debate Night");
    expect(ui.location).toBe("Humanities Hall, Room 214");
  });

  it("handles a timestamp with no seconds", () => {
    const ui = toUiEvent({ ...EVENT, startTime: "2026-11-13T06:30+03:00" });

    expect(ui.date).toBe("2026-11-13");
    expect(ui.time).toBe("06:30");
  });

  it("keeps the correct day just past midnight", () => {
    const ui = toUiEvent({ ...EVENT, startTime: "2026-11-14T00:05:00+03:00" });

    expect(ui.date).toBe("2026-11-14");
    expect(ui.time).toBe("00:05");
  });

  it("reads the wall clock, so an early +03:00 time is not pushed back a day", () => {
    // Converting through Date would subtract three hours here and reach 12 Nov
    // in any zone west of EAT — the bug v2 exists to fix.
    const ui = toUiEvent({ ...EVENT, startTime: "2026-11-13T00:30:00+03:00" });

    expect(ui.date).toBe("2026-11-13");
    expect(ui.time).toBe("00:30");
  });

  it("passes an event without startTime straight through", () => {
    const v1Event = { id: "event-01", date: "2026-11-02", time: "06:30" };

    expect(toUiEvent(v1Event)).toBe(v1Event);
  });
});
