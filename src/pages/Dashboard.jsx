// src/pages/Dashboard.jsx
import { useEffect, useMemo, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { CATEGORIES, createClub } from "../utils/clubsStore";
import { useClubs } from "../context/ClubsContext";
import { useAuth } from "../context/AuthContext";
import {
  getAllEvents,
  saveCustomEvent,
  deleteCustomEvent,
} from "../utils/eventsStore";
import { getSignupsByEvent } from "../utils/storage";
import { getAnnouncements, saveAnnouncement } from "../utils/dashboardStorage";
import {
  getPendingAdminRequests,
  getAllUsers,
  promoteToClubAdmin,
  demoteFromClubAdmin,
  approveAdminRequest,
  denyAdminRequest,
} from "../utils/adminStore";
import { canManageClub } from "../utils/authStore";
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
  const navigate = useNavigate();
  const { clubs, loading: clubsLoading } = useClubs();
  const { user, loading: authLoading } = useAuth();
  const club = clubs.find((c) => c.id === clubId);
  const authorized = canManageClub(user, clubId);

  const [allEvents, setAllEvents] = useState([]);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [selectedEventId, setSelectedEventId] = useState(null);
  const [announcements, setAnnouncements] = useState([]);
  const [announcementText, setAnnouncementText] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [saveMessage, setSaveMessage] = useState("");

  async function refreshEvents() {
    setAllEvents(await getAllEvents());
  }

  useEffect(() => {
    refreshEvents().finally(() => setEventsLoading(false));
  }, []);

  useEffect(() => {
    if (!clubId) return;
    getAnnouncements(clubId).then(setAnnouncements);
    setForm(emptyForm);
    setSelectedEventId(null);
  }, [clubId]);

  // --- Loading / permission gates ----------------------------------------
  if (clubsLoading || authLoading) {
    return (
      <div className={styles.page}>
        <p className={styles.notFound}>Loading…</p>
      </div>
    );
  }

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
  const clubEvents = allEvents
    .filter((e) => e.clubId === clubId)
    .sort((a, b) => eventTimestamp(a) - eventTimestamp(b));

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

  async function handleSubmitEvent(e) {
    e.preventDefault();

    // Defense in depth (peer review): the page-level gate already blocks
    // unauthorized users from reaching this form, and the server
    // independently re-checks canManageClub on every write too.
    if (!canManageClub(user, clubId)) return;

    const title = form.title.trim();
    const description = form.description.trim();
    const location = form.location.trim();
    const imageUrl = form.imageUrl.trim();

    if (!title) return; // trimmed-empty title is not a valid event

    try {
      await saveCustomEvent({
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

      await refreshEvents();
      setForm(emptyForm);
      setSaveMessage(form.id ? "Event updated." : "Event created.");
    } catch (err) {
      setSaveMessage(err.message);
    }
  }

  async function handleDeleteEvent(eventId) {
    if (!canManageClub(user, clubId)) return; // defense in depth
    const confirmed = window.confirm("Delete this event? This can't be undone.");
    if (!confirmed) return;

    await deleteCustomEvent(eventId);
    await refreshEvents();
    if (selectedEventId === eventId) setSelectedEventId(null);
    if (form.id === eventId) setForm(emptyForm);
    setSaveMessage("Event deleted.");
  }

  // --- Announcement handler --------------------------------------------------
  async function handlePostAnnouncement(e) {
    e.preventDefault();
    if (!canManageClub(user, clubId)) return; // defense in depth

    const saved = await saveAnnouncement({ clubId, text: announcementText });
    if (!saved) return; // whitespace-only text, nothing to post

    setAnnouncements(await getAnnouncements(clubId));
    setAnnouncementText("");
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

      {/* Create a new club (tier1 only) ------------------------------------ */}
      {user.role === "tier1" && (
        <CreateClubSection onCreated={(newClub) => navigate(`/dashboard/${newClub.id}`)} />
      )}

      {/* Admin management (tier1 only) ------------------------------------ */}
      {user.role === "tier1" && <AdminManagementSection clubId={clubId} />}

      {saveMessage && <div className={styles.toast}>{saveMessage}</div>}

      {/* 2. Events + create/edit form -------------------------------------- */}
      <section className={styles.section}>
        <h2>Events</h2>

        <ul className={styles.eventList}>
          {eventsLoading && <li className={styles.emptyState}>Loading events…</li>}
          {!eventsLoading && clubEvents.length === 0 && (
            <li className={styles.emptyState}>No events yet for this club.</li>
          )}
          {clubEvents.map((event) => {
            const isCustom = !event.isSeed;
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
            {clubEvents.map((event) => (
              <StatsRow key={event.id} event={event} />
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

// Small local subcomponent — keeps each event's sign-up count fetch
// isolated so one failure doesn't block the whole stats table.
function StatsRow({ event }) {
  const [count, setCount] = useState(null);

  useEffect(() => {
    let cancelled = false;
    getSignupsByEvent(event.id)
      .then((signups) => {
        if (!cancelled) setCount(Array.isArray(signups) ? signups.length : 0);
      })
      .catch(() => {
        if (!cancelled) setCount(null);
      });
    return () => {
      cancelled = true;
    };
  }, [event.id]);

  return (
    <tr>
      <td>{event.title}</td>
      <td>{count === null ? "—" : count}</td>
    </tr>
  );
}

// Small local subcomponent — keeps the sign-ups fetch/loading state
// isolated from the rest of the page's render logic.
function SignupsTable({ eventId }) {
  const [signups, setSignups] = useState(null); // null = loading
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setSignups(null);
    setFailed(false);
    getSignupsByEvent(eventId)
      .then((result) => {
        if (!cancelled) setSignups(Array.isArray(result) ? result : []);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [eventId]);

  if (failed) {
    return <p className={styles.emptyState}>Couldn&apos;t load sign-ups.</p>;
  }
  if (signups === null) {
    return <p className={styles.emptyState}>Loading sign-ups…</p>;
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

// Tier1-only panel: review pending admin requests for this club, revoke
// or grant tier2 admin access for it.
function AdminManagementSection({ clubId }) {
  const [requests, setRequests] = useState([]);
  const [users, setUsers] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);

  async function refresh() {
    const [allRequests, allUsers] = await Promise.all([
      getPendingAdminRequests(),
      getAllUsers(),
    ]);
    setRequests(allRequests.filter((r) => r.clubId === clubId));
    setUsers(allUsers);
  }

  useEffect(() => {
    setLoading(true);
    refresh().finally(() => setLoading(false));
  }, [clubId]);

  const currentAdmins = users.filter((u) => u.adminForClubs.includes(clubId));
  const promotableUsers = users.filter((u) => !u.adminForClubs.includes(clubId));

  async function handleApprove(requestId) {
    await approveAdminRequest(requestId);
    setMessage("Request approved — that user is now a tier 2 admin for this club.");
    await refresh();
  }

  async function handleDeny(requestId) {
    await denyAdminRequest(requestId);
    setMessage("Request denied.");
    await refresh();
  }

  async function handlePromote(e) {
    e.preventDefault();
    if (!selectedUserId) return;
    await promoteToClubAdmin(selectedUserId, clubId);
    setMessage("Promoted to tier 2 admin for this club.");
    setSelectedUserId("");
    await refresh();
  }

  async function handleRevoke(userId) {
    const confirmed = window.confirm("Remove this user's admin access to this club?");
    if (!confirmed) return;
    await demoteFromClubAdmin(userId, clubId);
    setMessage("Admin access revoked for this club.");
    await refresh();
  }

  return (
    <section className={styles.section}>
      <h2>Admin Management</h2>
      {message && <div className={styles.toast}>{message}</div>}

      <h3>Current admins for this club</h3>
      {loading && <p className={styles.emptyState}>Loading…</p>}
      {!loading && currentAdmins.length === 0 && (
        <p className={styles.emptyState}>No tier 2 admins for this club yet.</p>
      )}
      <ul className={styles.eventList}>
        {currentAdmins.map((u) => (
          <li key={u.id} className={styles.eventRow}>
            <span>
              {u.name} <span className={styles.eventMeta}>({u.email})</span>
            </span>
            <span className={styles.rowActions}>
              <button type="button" className={styles.dangerButton} onClick={() => handleRevoke(u.id)}>
                Revoke
              </button>
            </span>
          </li>
        ))}
      </ul>

      <h3>Pending requests</h3>
      {!loading && requests.length === 0 && (
        <p className={styles.emptyState}>No pending admin requests for this club.</p>
      )}
      <ul className={styles.eventList}>
        {requests.map((r) => (
          <li key={r.id} className={styles.eventRow}>
            <span>
              {r.userName} <span className={styles.eventMeta}>({r.userEmail})</span>
            </span>
            <span className={styles.rowActions}>
              <button type="button" onClick={() => handleApprove(r.id)}>
                Approve
              </button>
              <button type="button" className={styles.dangerButton} onClick={() => handleDeny(r.id)}>
                Deny
              </button>
            </span>
          </li>
        ))}
      </ul>

      <h3>Promote a user directly</h3>
      <form className={styles.form} onSubmit={handlePromote}>
        <label>
          User
          <select value={selectedUserId} onChange={(e) => setSelectedUserId(e.target.value)}>
            <option value="">Select a user…</option>
            {promotableUsers.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name} ({u.email}) — {u.role === "tier2" ? "Tier 2 admin" : "Member"}
              </option>
            ))}
          </select>
        </label>
        <div className={styles.formActions}>
          <button type="submit" className={styles.primaryButton} disabled={!selectedUserId}>
            Promote to Tier 2 Admin
          </button>
        </div>
      </form>
    </section>
  );
}

const emptyClubForm = {
  name: "",
  description: "",
  category: CATEGORIES[0],
  logoUrl: "",
  meetingTime: "",
  meetingLocation: "",
  tags: "",
};

// Tier1-only panel: create a brand-new club, then hand it off (via
// onCreated) so the caller can navigate straight to its dashboard.
function CreateClubSection({ onCreated }) {
  const { refresh } = useClubs();
  const [form, setForm] = useState(emptyClubForm);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  function handleChange(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    const name = form.name.trim();
    if (!name) return;

    setSubmitting(true);
    try {
      const newClub = await createClub({ ...form, name });
      await refresh();
      setForm(emptyClubForm);
      onCreated(newClub);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className={styles.section}>
      <h2>Create a new club</h2>
      <form className={styles.form} onSubmit={handleSubmit}>
        <label>
          Name
          <input
            type="text"
            value={form.name}
            onChange={(e) => handleChange("name", e.target.value)}
            required
          />
        </label>

        <label>
          Description
          <textarea
            value={form.description}
            onChange={(e) => handleChange("description", e.target.value)}
            rows={3}
          />
        </label>

        <label>
          Category
          <select value={form.category} onChange={(e) => handleChange("category", e.target.value)}>
            {CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
        </label>

        <div className={styles.formRow}>
          <label>
            Meeting time
            <input
              type="text"
              value={form.meetingTime}
              placeholder="Tuesdays, 6:00 PM"
              onChange={(e) => handleChange("meetingTime", e.target.value)}
            />
          </label>
          <label>
            Meeting location
            <input
              type="text"
              value={form.meetingLocation}
              onChange={(e) => handleChange("meetingLocation", e.target.value)}
            />
          </label>
        </div>

        <label>
          Logo URL <span className={styles.optional}>(optional)</span>
          <input
            type="url"
            value={form.logoUrl}
            onChange={(e) => handleChange("logoUrl", e.target.value)}
          />
        </label>

        <label>
          Tags <span className={styles.optional}>(comma-separated, optional)</span>
          <input
            type="text"
            value={form.tags}
            placeholder="beginner-friendly, weekly"
            onChange={(e) => handleChange("tags", e.target.value)}
          />
        </label>

        {error && <p className={styles.error}>{error}</p>}

        <div className={styles.formActions}>
          <button type="submit" className={styles.primaryButton} disabled={submitting}>
            {submitting ? "Creating…" : "Create club"}
          </button>
        </div>
      </form>
    </section>
  );
}