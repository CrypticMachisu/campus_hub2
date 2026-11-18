// src/pages/Dashboard.jsx
import { Fragment, useEffect, useState, useCallback } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { CATEGORIES, createClub, updateClub } from "../utils/clubsStore";
import { useClubs } from "../context/ClubsContext";
import { useAuth } from "../context/AuthContext";
import { getAllEvents, saveCustomEvent, deleteCustomEvent } from "../utils/eventsStore";
import { getSignupsByEvent } from "../utils/storage";
import { getAnnouncements, saveAnnouncement } from "../utils/dashboardStorage";
import ClubPostsDesk from "../components/ClubPostsDesk";
import Tier1ReportQueue from "../components/Tier1ReportQueue";
import { formatDateTime, formatEventDate } from "../utils/dateTime";
import {
  COMMITMENT_KINDS,
  createCommitment,
  deleteCommitment,
  getCommitments,
  getCommitmentRoster,
  updateCommitment,
  updateCommitmentCapacity,
  removeCommitmentSignup,
  markCommitmentAttendance,
} from "../utils/commitmentsStore";
import {
  getPendingAdminRequests,
  getAllUsers,
  promoteToClubAdmin,
  demoteFromClubAdmin,
  approveAdminRequest,
  denyAdminRequest,
  promoteToCampusAdmin,
  removeCampusAdmin,
} from "../utils/adminStore";
import { canManageClub } from "../utils/authStore";
import { SkeletonGroup, SkeletonListRow, CardStackSkeleton } from "../components/Skeleton";
import ErrorState from "../components/ErrorState";
import styles from "./Dashboard.module.css";

const FALLBACK_IMAGE = "https://placehold.co/600x300";

const ROLE_LABELS = {
  tier1: "Tier 1",
  campus_admin: "Campus admin",
  tier2: "Club admin",
  member: "Member",
};

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
  bringNote: "",
  capacity: "",
};

export default function Dashboard() {
  const { clubId } = useParams();
  const navigate = useNavigate();
  const { clubs, loading: clubsLoading, error: clubsError, refresh: refreshClubs } = useClubs();
  const { user, loading: authLoading } = useAuth();
  const club = clubs.find((c) => c.id === clubId);
  const authorized = canManageClub(user, clubId);
  const isCampusAdmin = ["tier1", "campus_admin"].includes(user?.role);

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
        <SkeletonGroup label="Loading dashboard…">
          <CardStackSkeleton count={3} />
        </SkeletonGroup>
      </div>
    );
  }

  if (clubsError && clubs.length === 0) {
    return (
      <div className={styles.page}>
        <ErrorState title="The dashboard didn't load" message={clubsError} onRetry={refreshClubs} />
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
            {user && <> This is expected if you&apos;re not an admin for this club.</>}
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
    user?.role === "tier1" ? clubs : clubs.filter((c) => user?.adminForClubs?.includes(c.id));

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
      bringNote: event.bringNote || "",
      capacity: event.capacity ?? "",
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

    // Blank capacity means unlimited; anything else must be a real number of
    // seats, so a stray "12abc" can't cap an event at zero.
    let capacity = null;
    if (form.capacity !== "" && form.capacity !== null) {
      capacity = Number(form.capacity);
      if (!Number.isInteger(capacity) || capacity < 1) {
        setSaveMessage(
          "Capacity must be a whole number of at least 1 — leave it blank for unlimited."
        );
        return;
      }
    }

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
        bringNote: form.bringNote.trim(),
        capacity,
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
      <div className={styles.desk}>
        <header className={styles.header}>
          <div className={styles.headerText}>
            <p className={styles.eyebrow}>Club Admin</p>
            <h1>{club.name} Dashboard</h1>
            <p className={styles.subtitle}>
              Logged in as {user.name} ({ROLE_LABELS[user.role]}) · {user.campusName}
            </p>
          </div>
          <div className={styles.headerStamp} aria-hidden="true">
            <span>Club admin</span>
            <strong>Desk copy</strong>
          </div>
        </header>

        {/* 1. Club switcher ------------------------------------------------- */}
        {switchableClubs.length > 1 && (
          <div className={styles.deskBar}>
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
          </div>
        )}

        {/* Create a new club (tier1 and campus admins) ----------------------- */}
        {isCampusAdmin && (
          <CreateClubSection onCreated={(newClub) => navigate(`/dashboard/${newClub.id}`)} />
        )}

        {/* Admin management (tier1 and campus admins) ----------------------- */}
        {isCampusAdmin && <AdminManagementSection clubId={clubId} />}

        {/* Cross-club moderation (tier1 and campus admins) ------------------ */}
        {isCampusAdmin && <Tier1ReportQueue />}

        {saveMessage && <div className={styles.toast}>{saveMessage}</div>}

        {/* 2. Events + create/edit form -------------------------------------- */}
        <section className={`${styles.section} ${styles.eventsSection}`}>
          <h2>Events</h2>

          <ul className={styles.eventList}>
            {eventsLoading && (
              <>
                <SkeletonListRow />
                <SkeletonListRow />
                <SkeletonListRow />
              </>
            )}
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

            <div className={styles.formRow}>
              <label>
                What to bring <span className={styles.optional}>(optional)</span>
                <input
                  type="text"
                  value={form.bringNote}
                  maxLength={240}
                  placeholder="Bring a laptop and charger"
                  onChange={(e) => handleFormChange("bringNote", e.target.value)}
                />
              </label>
              <label>
                Capacity <span className={styles.optional}>(blank = unlimited)</span>
                <input
                  type="number"
                  min="1"
                  value={form.capacity}
                  placeholder="e.g. 14"
                  onChange={(e) => handleFormChange("capacity", e.target.value)}
                />
              </label>
            </div>

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
        <section className={`${styles.section} ${styles.signupsSection}`}>
          <h2>Sign-ups</h2>
          {!selectedEvent && (
            <p className={styles.emptyState}>Select an event above to see who&apos;s signed up.</p>
          )}
          {selectedEvent && (
            <>
              <h3>{selectedEvent.title}</h3>
              <SignupsTable eventId={selectedEvent.id} />
            </>
          )}
        </section>

        {/* 4. Commitments -------------------------------------------------- */}
        <section className={`${styles.section} ${styles.commitmentsSection}`}>
          <h2>Commitments</h2>
          <CommitmentsDesk clubId={club.id} />
        </section>

        {/* 5. Announcements ----------------------------------------------- */}
        <section className={`${styles.section} ${styles.announcementsSection}`}>
          <h2>Announcements</h2>
          <form className={styles.announcementForm} onSubmit={handlePostAnnouncement}>
            <textarea
              value={announcementText}
              onChange={(e) => setAnnouncementText(e.target.value)}
              aria-label="Announcement text"
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

        {/* 6. Posts — the club page's dispatches and report queue ------------ */}
        <section className={`${styles.section} ${styles.postsSection}`}>
          <h2>Posts</h2>
          <ClubPostsDesk clubId={club.id} />
        </section>

        {/* 7. Playbook — the club-specific bits members see ------------------- */}
        <ClubFocusSection club={club} className={styles.focusSection} />

        {/* 8. Stats ----------------------------------------------------------- */}
        <section className={`${styles.section} ${styles.statsSection}`}>
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

/**
 * Officer desk for commitments: publish, edit and cancel notices, change the
 * seat count, and read the waitlist and roster in one place. Lowering capacity
 * never deletes anyone, the newest signups simply become waitlisted, which the
 * member ticket reflects on its next read. Roster removal is for withdrawals
 * taken by phone; cancelling removes the notice and its signups after an
 * explicit confirmation that says so.
 */
const EMPTY_EDITOR = {
  mode: "create",
  id: null,
  kind: "activity",
  title: "",
  description: "",
  date: "",
  time: "09:00",
  location: "",
  county: "",
  capacity: "",
  hostName: "",
};

function sortCommitments(list) {
  return [...list].sort((a, b) => `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`));
}

function CommitmentsDesk({ clubId }) {
  const [rows, setRows] = useState(null); // null = loading
  const [failed, setFailed] = useState("");
  const [notice, setNotice] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [capacityDraft, setCapacityDraft] = useState("");
  const [savingId, setSavingId] = useState(null);
  const [rosters, setRosters] = useState({});
  const [confirmRemoveId, setConfirmRemoveId] = useState(null);
  const [removingId, setRemovingId] = useState(null);
  const [savingAttendanceId, setSavingAttendanceId] = useState(null);
  const [editor, setEditor] = useState(null);
  const [editorSaving, setEditorSaving] = useState(false);
  const [editorError, setEditorError] = useState("");
  const [confirmCancelId, setConfirmCancelId] = useState(null);
  const [cancellingId, setCancellingId] = useState(null);

  const load = useCallback(async () => {
    setFailed("");
    try {
      setRows(await getCommitments({ clubId }));
    } catch (err) {
      setFailed(err.message);
      setRows([]);
    }
  }, [clubId]);

  useEffect(() => {
    setRows(null);
    setRosters({});
    setEditingId(null);
    setNotice("");
    setEditor(null);
    setConfirmCancelId(null);
    load();
  }, [clubId, load]);

  async function loadRoster(commitmentId) {
    setRosters((current) => ({
      ...current,
      [commitmentId]: { loading: true, error: "" },
    }));
    try {
      const data = await getCommitmentRoster(commitmentId);
      setRosters((current) => ({ ...current, [commitmentId]: { data } }));
    } catch (err) {
      setRosters((current) => ({
        ...current,
        [commitmentId]: { error: err.message },
      }));
    }
  }

  function toggleRoster(row) {
    if (rosters[row.id]?.data) {
      setRosters((current) => {
        const next = { ...current };
        delete next[row.id];
        return next;
      });
      return;
    }
    loadRoster(row.id);
  }

  async function saveCapacity(row) {
    setSavingId(row.id);
    setNotice("");
    try {
      const updated = await updateCommitmentCapacity(
        row.id,
        capacityDraft === "" ? null : Number(capacityDraft)
      );
      setRows((current) =>
        current.map((entry) =>
          entry.id === row.id ? { ...entry, capacity: updated.capacity } : entry
        )
      );
      setEditingId(null);
      setNotice(
        updated.capacity == null
          ? `${row.title} now has no seat limit.`
          : `${row.title} now has ${updated.capacity} ${updated.capacity === 1 ? "place" : "places"}.`
      );
      if (rosters[row.id]) loadRoster(row.id);
    } catch (err) {
      setNotice(err.message);
    } finally {
      setSavingId(null);
    }
  }

  async function removePerson(row, person) {
    setRemovingId(person.id);
    setNotice("");
    try {
      const result = await removeCommitmentSignup(row.id, person.id);
      setRows((current) =>
        current.map((entry) =>
          entry.id === row.id ? { ...entry, signupCount: result.signupCount } : entry
        )
      );
      setConfirmRemoveId(null);
      setNotice(`${person.name} was removed from ${row.title}.`);
      loadRoster(row.id);
    } catch (err) {
      setNotice(err.message);
    } finally {
      setRemovingId(null);
    }
  }

  async function markAttendance(row, person, status) {
    setSavingAttendanceId(person.id);
    setNotice("");
    try {
      await markCommitmentAttendance(row.id, person.id, status);
      setRosters((current) => {
        const entry = current[row.id];
        if (!entry?.data) return current;
        const roster = entry.data.roster.map((candidate) =>
          candidate.id === person.id ? { ...candidate, attendance: status } : candidate
        );
        return {
          ...current,
          [row.id]: {
            data: {
              ...entry.data,
              roster,
              summary: {
                ...entry.data.summary,
                attended: roster.filter((candidate) => candidate.attendance === "attended").length,
                noShow: roster.filter((candidate) => candidate.attendance === "no_show").length,
              },
            },
          },
        };
      });
      if (status === "unknown") {
        setNotice(`Cleared the attendance mark for ${person.name}.`);
      } else {
        setNotice(
          `${person.name} marked ${status === "attended" ? "attended" : "as a no-show"} for ${row.title}.`
        );
      }
    } catch (err) {
      setNotice(err.message);
    } finally {
      setSavingAttendanceId(null);
    }
  }

  function startCreate() {
    setEditor({ ...EMPTY_EDITOR });
    setEditorError("");
    setNotice("");
    setConfirmCancelId(null);
  }

  function startEdit(row) {
    setEditor({
      mode: "edit",
      id: row.id,
      kind: row.kind,
      title: row.title,
      description: row.description || "",
      date: row.date,
      time: row.time,
      location: row.location,
      county: row.county || "",
      capacity: row.capacity == null ? "" : String(row.capacity),
      hostName: row.hostName || "",
    });
    setEditorError("");
    setNotice("");
    setConfirmCancelId(null);
  }

  function updateEditorField(field, value) {
    setEditor((current) => ({ ...current, [field]: value }));
  }

  async function saveEditor(event) {
    event.preventDefault();
    if (!editor) return;
    setEditorError("");

    let capacity = null;
    if (editor.capacity !== "" && editor.capacity !== null) {
      capacity = Number(editor.capacity);
      if (!Number.isInteger(capacity) || capacity < 1 || capacity > 10000) {
        setEditorError(
          "Spaces must be a whole number between 1 and 10000 — leave it blank for no limit."
        );
        return;
      }
    }

    const payload = {
      kind: editor.kind,
      title: editor.title.trim(),
      description: editor.description.trim(),
      date: editor.date,
      time: editor.time,
      location: editor.location.trim(),
      county: editor.county.trim(),
      hostName: editor.hostName.trim(),
      capacity,
    };

    setEditorSaving(true);
    try {
      if (editor.mode === "edit") {
        const updated = await updateCommitment(editor.id, payload);
        setRows((current) =>
          sortCommitments(current.map((entry) => (entry.id === updated.id ? updated : entry)))
        );
        setNotice(`${updated.title} was updated.`);
        if (rosters[editor.id]?.data) loadRoster(editor.id);
      } else {
        const created = await createCommitment({ clubId, ...payload });
        setRows((current) => sortCommitments([...current, created]));
        setNotice(`${created.title} is now on the club's commitments.`);
      }
      setEditor(null);
    } catch (err) {
      setEditorError(err.message);
    } finally {
      setEditorSaving(false);
    }
  }

  async function cancelCommitment(row) {
    setCancellingId(row.id);
    setNotice("");
    try {
      await deleteCommitment(row.id);
      setRows((current) => current.filter((entry) => entry.id !== row.id));
      setRosters((current) => {
        const next = { ...current };
        delete next[row.id];
        return next;
      });
      setConfirmCancelId(null);
      setNotice(
        row.signupCount > 0
          ? `${row.title} was cancelled and ${row.signupCount} ${row.signupCount === 1 ? "signup" : "signups"} removed.`
          : `${row.title} was cancelled.`
      );
    } catch (err) {
      setNotice(err.message);
    } finally {
      setCancellingId(null);
    }
  }

  if (failed) {
    return (
      <div>
        <p className={styles.emptyState}>Commitments didn&apos;t load: {failed}</p>
        <button type="button" onClick={load}>
          Try again
        </button>
      </div>
    );
  }

  if (rows === null) {
    return (
      <SkeletonGroup label="Loading commitments…">
        <CardStackSkeleton count={2} />
      </SkeletonGroup>
    );
  }

  return (
    <>
      <p className={styles.deskNote}>
        Publish and edit notices here; changes apply immediately. Lowering a capacity moves the
        newest signups to the waitlist instead of deleting them, and cancelling a commitment removes
        its signups after an explicit confirmation.
      </p>

      {notice && (
        <p className={styles.deskNotice} role="status">
          {notice}
        </p>
      )}

      <div className={styles.deskToolbar}>
        <button
          type="button"
          className={styles.primaryButton}
          aria-expanded={Boolean(editor)}
          onClick={() => {
            if (editor) {
              setEditor(null);
              setEditorError("");
            } else {
              startCreate();
            }
          }}
        >
          {editor ? "Close editor" : "Publish a commitment"}
        </button>
      </div>

      {editor && (
        <form
          className={styles.form}
          onSubmit={saveEditor}
          aria-label={editor.mode === "edit" ? "Edit commitment" : "New commitment"}
        >
          <h3>{editor.mode === "edit" ? "Edit commitment" : "New commitment"}</h3>

          <div className={styles.formRow}>
            <label>
              Type
              <select
                value={editor.kind}
                onChange={(e) => updateEditorField("kind", e.target.value)}
              >
                {COMMITMENT_KINDS.map((kind) => (
                  <option key={kind.id} value={kind.id}>
                    {kind.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Title
              <input
                type="text"
                required
                maxLength={150}
                value={editor.title}
                onChange={(e) => updateEditorField("title", e.target.value)}
              />
            </label>
          </div>

          <div className={styles.formRow}>
            <label>
              Date
              <input
                type="date"
                required
                value={editor.date}
                onChange={(e) => updateEditorField("date", e.target.value)}
              />
            </label>
            <label>
              Time
              <input
                type="time"
                required
                value={editor.time}
                onChange={(e) => updateEditorField("time", e.target.value)}
              />
            </label>
            <label>
              Spaces <span className={styles.optional}>(blank = no limit)</span>
              <input
                type="number"
                min="1"
                max="10000"
                value={editor.capacity}
                placeholder="No limit"
                onChange={(e) => updateEditorField("capacity", e.target.value)}
              />
            </label>
          </div>

          <div className={styles.formRow}>
            <label>
              Where
              <input
                type="text"
                required
                maxLength={150}
                value={editor.location}
                onChange={(e) => updateEditorField("location", e.target.value)}
              />
            </label>
            <label>
              County
              <input
                type="text"
                maxLength={80}
                value={editor.county}
                onChange={(e) => updateEditorField("county", e.target.value)}
              />
            </label>
            <label>
              Host
              <input
                type="text"
                maxLength={120}
                value={editor.hostName}
                placeholder="Who is hosting?"
                onChange={(e) => updateEditorField("hostName", e.target.value)}
              />
            </label>
          </div>

          <label>
            What happens
            <textarea
              rows={3}
              value={editor.description}
              onChange={(e) => updateEditorField("description", e.target.value)}
            />
          </label>

          {editorError && (
            <p className={styles.error} role="alert">
              {editorError}
            </p>
          )}

          <div className={styles.formActions}>
            <button type="submit" className={styles.primaryButton} disabled={editorSaving}>
              {editorSaving
                ? "Saving…"
                : editor.mode === "edit"
                  ? "Save changes"
                  : "Publish commitment"}
            </button>
            <button
              type="button"
              onClick={() => {
                setEditor(null);
                setEditorError("");
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {rows.length === 0 ? (
        <p className={styles.emptyState}>No upcoming commitments for this club.</p>
      ) : (
        <table className={`${styles.signupsTable} ${styles.commitmentsTable}`}>
          <thead>
            <tr>
              <th scope="col">Date</th>
              <th scope="col">Commitment</th>
              <th scope="col">Places</th>
              <th scope="col">Waitlist</th>
              <th scope="col">Roster</th>
              <th scope="col">Manage</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const going =
                row.capacity == null ? row.signupCount : Math.min(row.signupCount, row.capacity);
              const waiting =
                row.capacity == null ? 0 : Math.max(0, row.signupCount - row.capacity);
              const rosterState = rosters[row.id];
              const isEditing = editingId === row.id;

              return (
                <Fragment key={row.id}>
                  <tr>
                    <td>
                      <time dateTime={`${row.date}T${row.time}`}>{formatEventDate(row.date)}</time>
                      <br />
                      <span className={styles.cellNote}>{row.time}</span>
                    </td>
                    <td>
                      <strong>{row.title}</strong>
                      <br />
                      <span className={styles.cellNote}>
                        {row.kindLabel} · {row.location}
                      </span>
                    </td>
                    <td>
                      {isEditing ? (
                        <span className={styles.capacityEditor}>
                          <input
                            type="number"
                            min="1"
                            max="10000"
                            value={capacityDraft}
                            placeholder="No limit"
                            aria-label={`Spaces for ${row.title}`}
                            onChange={(e) => setCapacityDraft(e.target.value)}
                          />
                          <button
                            type="button"
                            className={styles.smallButton}
                            onClick={() => saveCapacity(row)}
                            disabled={savingId === row.id}
                          >
                            {savingId === row.id ? "Saving…" : "Save"}
                          </button>
                          <button
                            type="button"
                            className={styles.smallButton}
                            onClick={() => setEditingId(null)}
                          >
                            Cancel
                          </button>
                        </span>
                      ) : (
                        <span>
                          {going}
                          {row.capacity == null ? " · no limit" : ` / ${row.capacity}`}
                          <br />
                          <button
                            type="button"
                            className={styles.smallButton}
                            onClick={() => {
                              setEditingId(row.id);
                              setCapacityDraft(row.capacity == null ? "" : String(row.capacity));
                            }}
                          >
                            Edit seats
                          </button>
                        </span>
                      )}
                    </td>
                    <td>
                      {waiting > 0 ? (
                        <span className={styles.waitBadge}>{waiting} waiting</span>
                      ) : (
                        <span className={styles.cellNote}>None</span>
                      )}
                    </td>
                    <td>
                      <button
                        type="button"
                        className={styles.smallButton}
                        onClick={() => toggleRoster(row)}
                        aria-expanded={Boolean(rosterState?.data)}
                      >
                        {rosterState?.data ? "Hide" : `View (${row.signupCount})`}
                      </button>
                    </td>
                    <td>
                      {confirmCancelId === row.id ? (
                        <span className={styles.cancelConfirm}>
                          <span className={styles.cellNote}>
                            Cancel this notice
                            {row.signupCount > 0
                              ? ` and remove ${row.signupCount} ${row.signupCount === 1 ? "signup" : "signups"}?`
                              : "?"}
                          </span>
                          <span className={styles.rowActions}>
                            <button
                              type="button"
                              className={styles.dangerButton}
                              onClick={() => cancelCommitment(row)}
                              disabled={cancellingId === row.id}
                              aria-label={`Confirm cancelling ${row.title}`}
                            >
                              {cancellingId === row.id ? "Cancelling…" : "Yes"}
                            </button>
                            <button type="button" onClick={() => setConfirmCancelId(null)}>
                              No
                            </button>
                          </span>
                        </span>
                      ) : (
                        <span className={styles.rowActions}>
                          <button type="button" onClick={() => startEdit(row)}>
                            Edit
                          </button>
                          <button
                            type="button"
                            className={styles.dangerButton}
                            onClick={() => setConfirmCancelId(row.id)}
                            aria-label={`Cancel ${row.title}`}
                          >
                            Cancel
                          </button>
                        </span>
                      )}
                    </td>
                  </tr>

                  {rosterState && (
                    <tr key={`${row.id}-roster`}>
                      <td colSpan={6} className={styles.rosterCell}>
                        {rosterState.loading && (
                          <p className={styles.emptyState}>Loading roster…</p>
                        )}
                        {rosterState.error && (
                          <p className={styles.emptyState}>
                            Roster didn&apos;t load: {rosterState.error}
                          </p>
                        )}
                        {rosterState.data && (
                          <>
                            <p className={styles.rosterSummary}>
                              Going {rosterState.data.summary.going}
                              {rosterState.data.summary.capacity != null
                                ? ` of ${rosterState.data.summary.capacity}`
                                : ""}{" "}
                              · Waitlist {rosterState.data.summary.waitlisted} · Checked in{" "}
                              {rosterState.data.summary.attended}
                              {rosterState.data.summary.noShow > 0
                                ? ` · No-shows ${rosterState.data.summary.noShow}`
                                : ""}
                            </p>
                            {rosterState.data.roster.length === 0 ? (
                              <p className={styles.emptyState}>Nobody has committed yet.</p>
                            ) : (
                              <table className={styles.rosterTable}>
                                <thead>
                                  <tr>
                                    <th scope="col">#</th>
                                    <th scope="col">Name</th>
                                    <th scope="col">Email</th>
                                    <th scope="col">Signed up</th>
                                    <th scope="col">State</th>
                                    <th scope="col">Attendance</th>
                                    <th scope="col">Remove</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {rosterState.data.roster.map((person) => (
                                    <tr key={person.id}>
                                      <td>{person.position}</td>
                                      <td>{person.name}</td>
                                      <td>{person.email}</td>
                                      <td>{formatDateTime(person.signedUpAt)}</td>
                                      <td>
                                        {person.waitlisted ? (
                                          <span className={styles.waitBadge}>Waitlist</span>
                                        ) : (
                                          "Going"
                                        )}
                                      </td>
                                      <td>
                                        {person.waitlisted ? (
                                          <span className={styles.cellNote}>Waitlist</span>
                                        ) : (
                                          <select
                                            className={styles.attendanceSelect}
                                            value={person.attendance || "unknown"}
                                            aria-label={`Attendance for ${person.name}`}
                                            disabled={savingAttendanceId === person.id}
                                            onChange={(e) =>
                                              markAttendance(row, person, e.target.value)
                                            }
                                          >
                                            <option value="unknown">Not marked</option>
                                            <option value="attended">Attended</option>
                                            <option value="no_show">No-show</option>
                                          </select>
                                        )}
                                      </td>
                                      <td>
                                        {confirmRemoveId === person.id ? (
                                          <span className={styles.confirmInline}>
                                            <button
                                              type="button"
                                              className={styles.dangerButton}
                                              onClick={() => removePerson(row, person)}
                                              disabled={removingId === person.id}
                                            >
                                              {removingId === person.id ? "Removing…" : "Yes"}
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() => setConfirmRemoveId(null)}
                                            >
                                              No
                                            </button>
                                          </span>
                                        ) : (
                                          <button
                                            type="button"
                                            className={styles.smallButton}
                                            onClick={() => setConfirmRemoveId(person.id)}
                                          >
                                            Remove
                                          </button>
                                        )}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            )}
                          </>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      )}
    </>
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
    return (
      <SkeletonGroup label="Loading sign-ups…">
        <CardStackSkeleton count={2} />
      </SkeletonGroup>
    );
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
          <th>Signed up</th>
        </tr>
      </thead>
      <tbody>
        {signups.map((s) => (
          <tr key={s.id}>
            <td>{s.name}</td>
            <td>{s.email}</td>
            <td>{formatDateTime(s.createdAt)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// Tier1 and campus-admin panel: review pending admin requests for this club,
// revoke or grant tier2 admin access for it. The API scopes a campus admin to
// their own campus's users and clubs.
function AdminManagementSection({ clubId }) {
  const { user } = useAuth();
  const [requests, setRequests] = useState([]);
  const [users, setUsers] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [selectedCampusAdminId, setSelectedCampusAdminId] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const [allRequests, allUsers] = await Promise.all([getPendingAdminRequests(), getAllUsers()]);
    setRequests(allRequests.filter((r) => r.clubId === clubId));
    setUsers(allUsers);
  }, [clubId]);

  useEffect(() => {
    setLoading(true);
    refresh().finally(() => setLoading(false));
  }, [refresh]);

  const currentAdmins = users.filter((u) => u.adminForClubs.includes(clubId));
  const promotableUsers = users.filter(
    (u) => !u.adminForClubs.includes(clubId) && u.role !== "campus_admin"
  );
  const campusAdmins = users.filter((u) => u.role === "campus_admin");
  const campusCandidates = users.filter((u) => u.role !== "campus_admin");

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

  async function handlePromoteCampusAdmin(e) {
    e.preventDefault();
    if (!selectedCampusAdminId) return;
    const updated = await promoteToCampusAdmin(selectedCampusAdminId);
    setMessage(`${updated.name} can now manage every club on ${updated.campusName}.`);
    setSelectedCampusAdminId("");
    await refresh();
  }

  async function handleRemoveCampusAdmin(userId) {
    const confirmed = window.confirm("Remove this user's campus-admin rights?");
    if (!confirmed) return;
    const updated = await removeCampusAdmin(userId);
    setMessage(`${updated.name} is now a ${ROLE_LABELS[updated.role] || "member"}.`);
    await refresh();
  }

  return (
    <section className={styles.section}>
      <h2>Admin Management</h2>
      {message && <div className={styles.toast}>{message}</div>}

      <h3>Current admins for this club</h3>
      {loading && (
        <SkeletonGroup label="Loading admin panel…">
          <CardStackSkeleton count={2} />
        </SkeletonGroup>
      )}
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
              <button
                type="button"
                className={styles.dangerButton}
                onClick={() => handleRevoke(u.id)}
              >
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
              <button
                type="button"
                className={styles.dangerButton}
                onClick={() => handleDeny(r.id)}
              >
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
                {u.name} ({u.email}) — {ROLE_LABELS[u.role] || "Member"}
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

      {user?.role === "tier1" && (
        <>
          <h3>Campus administration</h3>
          <p className={styles.emptyState}>
            A campus admin manages every club on their campus. Tier 1 remains the only platform-wide
            role.
          </p>
          {campusAdmins.length === 0 && <p className={styles.emptyState}>No campus admins yet.</p>}
          <ul className={styles.eventList}>
            {campusAdmins.map((u) => (
              <li key={u.id} className={styles.eventRow}>
                <span>
                  {u.name} <span className={styles.eventMeta}>({u.email})</span>
                </span>
                <span className={styles.rowActions}>
                  <button
                    type="button"
                    className={styles.dangerButton}
                    onClick={() => handleRemoveCampusAdmin(u.id)}
                  >
                    Remove
                  </button>
                </span>
              </li>
            ))}
          </ul>

          <form className={styles.form} onSubmit={handlePromoteCampusAdmin}>
            <label>
              User
              <select
                value={selectedCampusAdminId}
                onChange={(e) => setSelectedCampusAdminId(e.target.value)}
              >
                <option value="">Select a user…</option>
                {campusCandidates.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} ({u.email}) — {ROLE_LABELS[u.role] || "Member"}
                  </option>
                ))}
              </select>
            </label>
            <div className={styles.formActions}>
              <button
                type="submit"
                className={styles.primaryButton}
                disabled={!selectedCampusAdminId}
              >
                Make campus admin
              </button>
            </div>
          </form>
        </>
      )}
    </section>
  );
}

function toPlaybookForm(overrides = {}) {
  return {
    rsvpLabel: overrides.rsvpLabel || "",
    bringNote: overrides.bringNote || "",
    focusTitle: overrides.focusTitle || "",
    focusBody: overrides.focusBody || "",
    focusItems: (overrides.focusItems || []).join("\n"),
    focusLink: overrides.focusLink || "",
  };
}

// Admins tune the member workspace here: the RSVP verb, what to bring, and the
// club's focus panel. Blank fields fall back to the category default, so a club
// that never opens this form still reads correctly.
function ClubFocusSection({ club, className = "" }) {
  const { refresh } = useClubs();
  const [form, setForm] = useState(() => toPlaybookForm(club.playbookOverrides));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    setForm(toPlaybookForm(club.playbookOverrides));
    setMessage("");
  }, [club.id, club.playbookOverrides]);

  function handleChange(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setMessage("");
    try {
      await updateClub(club.id, {
        ...form,
        focusItems: form.focusItems
          .split("\n")
          .map((item) => item.trim())
          .filter(Boolean),
      });
      await refresh();
      setMessage("Saved — this is what members now see in their workspace.");
    } catch (err) {
      setMessage(err.message);
    } finally {
      setSaving(false);
    }
  }

  function handleClear(e) {
    e.preventDefault();
    setForm(toPlaybookForm());
    setMessage("Cleared — save to fall back to the category defaults.");
  }

  return (
    <section className={`${styles.section} ${className}`}>
      <h2>Member workspace</h2>
      <p className={styles.emptyState}>
        These fields change how the workspace reads for {club.name} members. Leave one blank to use
        the default for the {club.category} category.
      </p>

      {message && <div className={styles.toast}>{message}</div>}

      <form className={styles.form} onSubmit={handleSubmit}>
        <label>
          RSVP button label
          <input
            type="text"
            value={form.rsvpLabel}
            placeholder="I'm going"
            maxLength={40}
            onChange={(e) => handleChange("rsvpLabel", e.target.value)}
          />
        </label>

        <label>
          What to bring <span className={styles.optional}>(one line, shown on the next event)</span>
          <input
            type="text"
            value={form.bringNote}
            placeholder="Bring your case notes — prep starts 10 minutes before the round."
            maxLength={240}
            onChange={(e) => handleChange("bringNote", e.target.value)}
          />
        </label>

        <label>
          Focus panel title
          <input
            type="text"
            value={form.focusTitle}
            placeholder="Motion & case prep"
            maxLength={120}
            onChange={(e) => handleChange("focusTitle", e.target.value)}
          />
        </label>

        <label>
          Focus panel text
          <textarea
            value={form.focusBody}
            rows={3}
            maxLength={500}
            placeholder="Every session opens with a motion. Come with one argument for it and one against it."
            onChange={(e) => handleChange("focusBody", e.target.value)}
          />
        </label>

        <label>
          Focus checklist <span className={styles.optional}>(one per line, up to 5)</span>
          <textarea
            value={form.focusItems}
            rows={3}
            placeholder={
              "Read the brief posted in the feed\nPick your speaking role before you arrive"
            }
            onChange={(e) => handleChange("focusItems", e.target.value)}
          />
        </label>

        <label>
          Focus link <span className={styles.optional}>(optional, opens in a new tab)</span>
          <input
            type="url"
            value={form.focusLink}
            placeholder="https://…"
            maxLength={300}
            onChange={(e) => handleChange("focusLink", e.target.value)}
          />
        </label>

        <div className={styles.formActions}>
          <button type="submit" className={styles.primaryButton} disabled={saving}>
            {saving ? "Saving…" : "Save workspace settings"}
          </button>
          <button type="button" onClick={handleClear}>
            Clear all
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

// Tier1 and campus-admin panel: create a brand-new club, then hand it off (via
// onCreated) so the caller can navigate straight to its dashboard. The server
// pins a campus admin to their own campus.
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
