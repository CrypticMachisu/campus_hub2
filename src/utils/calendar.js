// Calendar export for a single event.
//
// Generates a minimal, standards-clean .ics (RFC 5545) so members can drop
// an event into Apple/Google/Outlook without us storing a calendar feed.
// Times are floating local times on purpose: the app's event times are
// already club-local wall-clock times, not instants.

/** Escape text per RFC 5545 (backslash, semicolon, comma, newline). */
function escapeText(value = "") {
  return String(value)
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/** "2026-11-12" + "18:00" -> "20261112T180000" */
function toIcsStamp(date, time) {
  const [year, month, day] = date.split("-");
  const [hours, minutes] = (time || "09:00").split(":");
  return `${year}${month}${day}T${hours}${minutes}00`;
}

/** Default length when the data has no end time: two hours. */
function endStamp(date, time) {
  const [hours, minutes] = (time || "09:00").split(":").map(Number);
  const end = new Date(`${date}T00:00:00`);
  end.setHours(hours + 2, minutes, 0, 0);
  const pad = (n) => String(n).padStart(2, "0");
  return (
    `${end.getFullYear()}${pad(end.getMonth() + 1)}${pad(end.getDate())}` +
    `T${pad(end.getHours())}${pad(end.getMinutes())}00`
  );
}

export function buildEventIcs(event, clubName = "") {
  const start = toIcsStamp(event.date, event.time);
  const end = endStamp(event.date, event.time);
  const now = new Date().toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//CampusHub//Club Events//EN",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${event.id}@campushub`,
    `DTSTAMP:${now}`,
    `DTSTART:${start}`,
    `DTEND:${end}`,
    `SUMMARY:${escapeText(event.title)}`,
    `LOCATION:${escapeText(event.location || "")}`,
    `DESCRIPTION:${escapeText([clubName, event.description].filter(Boolean).join(" — "))}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}

/** Triggers a download of the event as a .ics file. */
export function downloadEventIcs(event, clubName = "") {
  const blob = new Blob([buildEventIcs(event, clubName)], {
    type: "text/calendar;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${event.title.replace(/[^\w-]+/g, "-").toLowerCase()}.ics`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
