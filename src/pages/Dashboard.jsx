// src/pages/Dashboard.jsx
import { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { clubs, CATEGORIES } from "../data/mockData";
import {
  getAllEvents,
  saveCustomEvent,
  deleteCustomEvent,
} from "../utils/eventsStore";
import { getSignupsByEvent } from "../utils/storage";
import { getAnnouncements, saveAnnouncement } from "../utils/dashboardStorage";
import { getCurrentUser, canManageClub } from "../utils/authStore";
import styles from "./Dashboard.module.css";

const FALLBACK_IMAGE = "https://placehold.co/600x300";

function todayISO() {
  return new Date().toISOString().split("T")[0];
}

// Peer review (shared contract): sort by date + time combined, not date
// alone, so same-day events order correctly. Ideally this lives in a shared
// utils file used by Home/EventDetail too — flagged for the group, applied
// locally here in the meantime.
function eventTimestamp(event) {
  const time = event.time && /^\d{2}:\d{2}$/.test(event.time) ? event.time : "00:00";
  const parsed = new Date(`${event.date}T${time}`);
  return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
}

const emptyForm = {
  id: null,
  title: "",
  description: "",
  date: todayISO(),
  time: "12:00",
  location: "",
  category: CATEGORIES[0],
  imageUrl: "",
};

export default function Dashboard() {
  const { clubId } = useParams();
  const club = clubs.find((c) => c.id === clubId);
  const user = getCurrentUser();
  const authorized = canManageClub(user, clubId);

  const [allEvents, setAllEvents] = useState(getAllEvents());
  const [selectedEventId, setSelectedEventId] = useState(null);
  const [announcements, setAnnouncements] = useState(getAnnouncements(clubId));
  const [announcementText, setAnnouncementText] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [saveMessage, setSaveMessage] = useState("");

  // Reactivity without a global state library: refresh from localStorage
  // whenever a write happens, in this tab (custom event) or another
  // (native `storage` event).
  useEffect(() => {
    function refresh() {
      setAllEvents(getAllEvents());
    }
    window.addEventListener("campushub:events-updated", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("campushub:events-updated", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  useEffect(() => {
    setAnnouncements(getAnnouncements(clubId));
    setForm(emptyForm);
    setSelectedEventId(null);
  }, [clubId]);

  // --- Permission gate --------------------------------------------------
  // Deliberately placed before touching any of the sections below, and
  // deliberately not a redirect (per §5, unauthorized visitors still reach
  // the route, they just don't see admin tools).
  if (!club) {
    return (
      <div className={styles.page}>
        <p className={styles.notFound}>Club not found.</p>
      </div>
    );
  }

  if (!authorized) {
    return (
      <div className={styles.page}>
        <div className={styles.unauthorized}>
          <h1>Admin access required</h1>
          <p>
            You don&apos;t have admin access to <strong>{club.name}</strong>.
            {!user && (
              <>
                {" "}
                <Link to="/login" className={styles.loginLink}>
                  Log in
                </Link>{" "}
                with an account that manages this club.
              </>
            )}
            {user && (
              <> This is expected if you&apos;re not an admin for this club.</>
            )}
          </p>
        </div>
      </div>
    );
  }

  // --- Derived data -------------------------------------------------------
  const clubEvents = useMemo(
    () =>
      allEvents
        .filter((e) => e.clubId === clubId)
        .sort((a, b) => eventTimestamp(a) - eventTimestamp(b)),
    [allEvents, clubId]
  );

  // Tier 2 admins only see clubs they actually manage in the switcher
  // (nice-to-have from the original spec — not strictly required, since
  // picking an unmanaged club just bounces to "not authorized" anyway).
  const switchableClubs =
    user?.role === "tier1"
      ? clubs
      : clubs.filter((c) => user?.adminForClubs?.includes(c.id));

  const selectedEvent = clubEvents.find((e) => e.id === selectedEventId) || null;

  // --- Event form handlers --------------------------------------------------
  function startEdit(event) {
    setForm({
      id: event.id,
      title: event.title,
      description: event.description,
      date: event.date,
      time: event.time,
      location: event.location,
      category: event.category,
      imageUrl: event.imageUrl || "",
    });
    setSaveMessage("");
  }

  function cancelEdit() {
    setForm(emptyForm);
    setSaveMessage("");
  }

  function handleFormChange(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function handleSubmitEvent(e) {
    e.preventDefault();

    // Defense in depth (peer review): the page-level gate already blocks
    // unauthorized users from reaching this form, but guard the mutating
    // call itself too in case of future refactors.
    if (!canManageClub(user, clubId)) return;

    const title = form.title.trim();
    const description = form.description.trim();
    const location = form.location.trim();
    const imageUrl = form.imageUrl.trim();

    if (!title) return; // trimmed-empty title is not a valid event

    saveCustomEvent({
      id: form.id, // null for create, existing id for edit
      clubId,
      title,
      description,
      date: form.date || todayISO(),
      time: form.time || "12:00",
      location,
      category: form.category,
      imageUrl: imageUrl || FALLBACK_IMAGE,
    });

    setAllEvents(getAllEvents());
    setForm(emptyForm);
    setSaveMessage(form.id ? "Event updated." : "Event created.");
  }

  function handleDeleteEvent(eventId) {
    if (!canManageClub(user, clubId)) return; // defense in depth
    const confirmed = window.confirm(
      "Delete this event? This can't be undone."
    );
    if (!confirmed) return;

    deleteCustomEvent(eventId);
    setAllEvents(getAllEvents());
    if (selectedEventId === eventId) setSelectedEventId(null);
    if (form.id === eventId) setForm(emptyForm);
    setSaveMessage("Event deleted.");
  }

  // --- Announcement handler --------------------------------------------------
  function handlePostAnnouncement(e) {
    e.preventDefault();
    if (!canManageClub(user, clubId)) return; // defense in depth

    const saved = saveAnnouncement({ clubId, text: announcementText });
    if (!saved) return; // whitespace-only text, nothing to post

    setAnnouncements(getAnnouncements(clubId));
    setAnnouncementText("");
  }

  // --- Stats (error-boundary style, per peer review) --------------------
  function signupCountFor(eventId) {
    try {
      const signups = getSignupsByEvent(eventId);
      return Array.isArray(signups) ? signups.length : 0;
    } catch {
      return null; // renders as "—" below
    }
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <p className={styles.eyebrow}>Club Admin</p>
        <h1>{club.name} Dashboard</h1>
        <p className={styles.subtitle}>
          Logged in as {user.name} ({user.role === "tier1" ? "Tier 1" : "Tier 2"})
        </p>
      </header>

      {/* 1. Club switcher ------------------------------------------------- */}
      {switchableClubs.length > 1 && (
        <section className={styles.section}>
          <label className={styles.switcherLabel} htmlFor="club-switcher">
            Switch club
          </label>
          <select
            id="club-switcher"
            className={styles.switcher}
            value={clubId}
            onChange={(e) => {
              window.location.href = `/dashboard/${e.target.value}`;
            }}
          >
            {switchableClubs.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </section>
      )}

      {saveMessage && <div className={styles.toast}>{saveMessage}</div>}

      {/* 2. Events + create/edit form -------------------------------------- */}
      <section className={styles.section}>
        <h2>Events</h2>

        <ul className={styles.eventList}>
          {clubEvents.length === 0 && (
            <li className={styles.emptyState}>No events yet for this club.</li>
          )}
          {clubEvents.map((event) => {
            const isCustom = event.id.startsWith("custom-");
            return (
              <li key={event.id} className={styles.eventRow}>
                <button
                  type="button"
                  className={styles.eventRowMain}
                  onClick={() => setSelectedEventId(event.id)}
                >
                  <span className={styles.eventTitle}>{event.title}</span>
                  <span className={styles.eventMeta}>
                    {event.date} · {event.time}
                  </span>
                </button>
                {isCustom ? (
                  <span className={styles.rowActions}>
                    <button type="button" onClick={() => startEdit(event)}>
                      Edit
                    </button>
                    <button
                      type="button"
                      className={styles.dangerButton}
                      onClick={() => handleDeleteEvent(event.id)}
                    >
                      Delete
                    </button>
                  </span>
                ) : (
                  <span className={styles.readOnlyBadge}>Seed event · read-only</span>
                )}
              </li>
            );
          })}
        </ul>

        <form className={styles.form} onSubmit={handleSubmitEvent}>
          <h3>{form.id ? "Edit event" : "Create new event"}</h3>

          <label>
            Title
            <input
              type="text"
              value={form.title}
              onChange={(e) => handleFormChange("title", e.target.value)}
              required
            />
          </label>

          <label>
            Description
            <textarea
              value={form.description}
              onChange={(e) => handleFormChange("description", e.target.value)}
              rows={3}
            />
          </label>

          <div className={styles.formRow}>
            <label>
              Date
              {/* Peer review: min = today, default = today */}
              <input
                type="date"
                value={form.date}
                min={todayISO()}
                onChange={(e) => handleFormChange("date", e.target.value)}
                required
              />
            </label>
            <label>
              Time
              <input
                type="time"
                value={form.time}
                onChange={(e) => handleFormChange("time", e.target.value)}
                required
              />
            </label>
          </div>

          <label>
            Location
            <input
              type="text"
              value={form.location}
              onChange={(e) => handleFormChange("location", e.target.value)}
            />
          </label>

          <label>
            Category
            <select
              value={form.category}
              onChange={(e) => handleFormChange("category", e.target.value)}
            >
              {CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </label>

          <label>
            Image URL <span className={styles.optional}>(optional)</span>
            <input
              type="url"
              value={form.imageUrl}
              placeholder={FALLBACK_IMAGE}
              onChange={(e) => handleFormChange("imageUrl", e.target.value)}
            />
          </label>

          <div className={styles.formActions}>
            <button type="submit" className={styles.primaryButton}>
              {form.id ? "Save changes" : "Create event"}
            </button>
            {form.id && (
              <button type="button" onClick={cancelEdit}>
                Cancel
              </button>
            )}
          </div>
        </form>
      </section>

      {/* 3. Sign-ups -------------------------------------------------------- */}
      <section className={styles.section}>
        <h2>Sign-ups</h2>
        {!selectedEvent && (
          <p className={styles.emptyState}>
            Select an event above to see who&apos;s signed up.
          </p>
        )}
        {selectedEvent && (
          <>
            <h3>{selectedEvent.title}</h3>
            <SignupsTable eventId={selectedEvent.id} />
          </>
        )}
      </section>

      {/* 4. Announcements ----------------------------------------------- */}
      <section className={styles.section}>
        <h2>Announcements</h2>
        <form className={styles.announcementForm} onSubmit={handlePostAnnouncement}>
          <textarea
            value={announcementText}
            onChange={(e) => setAnnouncementText(e.target.value)}
            placeholder="Post an update to club members…"
            rows={2}
          />
          <button type="submit" className={styles.primaryButton}>
            Post
          </button>
        </form>
        <ul className={styles.announcementList}>
          {announcements.length === 0 && (
            <li className={styles.emptyState}>No announcements yet.</li>
          )}
          {[...announcements]
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
            .map((a) => (
              <li key={a.id} className={styles.announcementItem}>
                <p>{a.text}</p>
                <time>{new Date(a.createdAt).toLocaleString()}</time>
              </li>
            ))}
        </ul>
      </section>

      {/* 5. Stats ----------------------------------------------------------- */}
      <section className={styles.section}>
        <h2>Stats</h2>
        <table className={styles.statsTable}>
          <thead>
            <tr>
              <th>Event</th>
              <th>Sign-ups</th>
            </tr>
          </thead>
          <tbody>
            {clubEvents.map((event) => {
              const count = signupCountFor(event.id);
              return (
                <tr key={event.id}>
                  <td>{event.title}</td>
                  <td>{count === null ? "—" : count}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </div>
  );
}

// Small local subcomponent — keeps the sign-ups fetch/try-catch isolated
// from the rest of the page's render logic.
function SignupsTable({ eventId }) {
  let signups = [];
  try {
    const result = getSignupsByEvent(eventId);
    signups = Array.isArray(result) ? result : [];
  } catch {
    return <p className={styles.emptyState}>Couldn&apos;t load sign-ups.</p>;
  }

  if (signups.length === 0) {
    return <p className={styles.emptyState}>Nobody has signed up yet.</p>;
  }

  return (
    <table className={styles.signupsTable}>
      <thead>
        <tr>
          <th>Name</th>
          <th>Email</th>
        </tr>
      </thead>
      <tbody>
        {signups.map((s) => (
          <tr key={s.id}>
            <td>{s.name}</td>
            <td>{s.email}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}