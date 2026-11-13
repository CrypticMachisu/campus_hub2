import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { canManageClub, isClubMember } from "../utils/authStore";
import { downloadEventIcs } from "../utils/calendar";
import { formatEventDate } from "../utils/dateTime";
import {
  OPPORTUNITY_KINDS,
  addAgroOpportunity,
  deleteAgroOpportunity,
  getAgroOpportunities,
  kindLabel,
  registerOpportunityInterest,
  withdrawOpportunityInterest,
} from "../utils/agroStore";
import { AGRI_CLUB_ID } from "./AgriClubSpotlight";
import styles from "./AgroOpportunities.module.css";

/** "12 Nov, 19:04" — when the grower snapshot beside a card was saved. */
function savedAt(iso) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

const EMPTY_FORM = {
  kind: "farm_visit",
  title: "",
  description: "",
  date: "",
  time: "09:00",
  location: "",
  county: "",
  capacity: "",
  hostName: "",
};

/**
 * Upcoming AgroConnect opportunities for the Agri club: farm visits,
 * tree-planting days, harvest mornings and volunteering shifts.
 *
 * Nothing here is derived from the partner. Every activity is a local record,
 * either seeded with the club or published by one of its admins — that is what
 * `source` says, and the two are listed separately rather than blended.
 * AgroConnect only supplies the matched grower's details beside a card, so the
 * list renders whether or not Team 6's API is answering.
 *
 * Members see the list and register interest; club admins also get the form to
 * publish and remove activities. Everyone else gets a members-only note.
 */
export default function AgroOpportunities({ heading = "AgroConnect opportunities" }) {
  const { user } = useAuth();
  const managesClub = canManageClub(user, AGRI_CLUB_ID);
  const member = Boolean(user) && (isClubMember(user, AGRI_CLUB_ID) || managesClub);

  const [opportunities, setOpportunities] = useState([]);
  const [partner, setPartner] = useState({ live: false, asOf: null, stale: false });
  const [status, setStatus] = useState(member ? "loading" : "locked"); // locked | loading | ok | error
  const [error, setError] = useState("");
  const [pendingIds, setPendingIds] = useState(() => new Set());
  const [notice, setNotice] = useState("");
  const [confirmingId, setConfirmingId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formStatus, setFormStatus] = useState("idle"); // idle | saving | error
  const [formError, setFormError] = useState("");

  const load = useCallback(() => {
    setStatus("loading");
    setError("");
    getAgroOpportunities()
      .then((data) => {
        setOpportunities(data.opportunities);
        setPartner(data.partner);
        setStatus("ok");
      })
      .catch((err) => {
        setError(err.message);
        setStatus("error");
      });
  }, []);

  useEffect(() => {
    // The server refuses non-members anyway; not fetching keeps their view
    // honest instead of flashing an error for a rule they cannot satisfy.
    if (!member) {
      setStatus("locked");
      return;
    }
    load();
  }, [member, load]);

  /** Optimistic interest toggle, rolled back if the API refuses. */
  async function toggleInterest(opportunity) {
    if (pendingIds.has(opportunity.id)) return;
    const nextInterested = !opportunity.interested;

    setPendingIds((current) => new Set(current).add(opportunity.id));
    setOpportunities((current) =>
      current.map((entry) =>
        entry.id === opportunity.id
          ? {
              ...entry,
              interested: nextInterested,
              interestCount: Math.max(0, entry.interestCount + (nextInterested ? 1 : -1)),
            }
          : entry
      )
    );

    try {
      const interest = nextInterested
        ? await registerOpportunityInterest(opportunity.id)
        : await withdrawOpportunityInterest(opportunity.id);
      setOpportunities((current) =>
        current.map((entry) =>
          entry.id === opportunity.id
            ? { ...entry, interested: interest.interested, interestCount: interest.interestCount }
            : entry
        )
      );
      setNotice(
        nextInterested
          ? `You're on the list for ${opportunity.title}. The club can see your interest.`
          : `You've withdrawn your interest in ${opportunity.title}.`
      );
    } catch (err) {
      setOpportunities((current) =>
        current.map((entry) =>
          entry.id === opportunity.id
            ? {
                ...entry,
                interested: opportunity.interested,
                interestCount: opportunity.interestCount,
              }
            : entry
        )
      );
      setNotice(err.message);
    } finally {
      setPendingIds((current) => {
        const next = new Set(current);
        next.delete(opportunity.id);
        return next;
      });
    }
  }

  async function handleAdd(event) {
    event.preventDefault();
    setFormStatus("saving");
    setFormError("");
    try {
      const created = await addAgroOpportunity({
        ...form,
        capacity: form.capacity === "" ? null : Number(form.capacity),
      });
      setOpportunities((current) =>
        [...current, created].sort((a, b) =>
          `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`)
        )
      );
      setForm(EMPTY_FORM);
      setShowForm(false);
      setFormStatus("idle");
      setNotice(`${created.title} is now on the club calendar.`);
    } catch (err) {
      setFormError(err.message);
      setFormStatus("error");
    }
  }

  async function handleDelete(opportunity) {
    try {
      await deleteAgroOpportunity(opportunity.id);
      setOpportunities((current) => current.filter((entry) => entry.id !== opportunity.id));
      setConfirmingId(null);
      setNotice(`${opportunity.title} was removed.`);
    } catch (err) {
      setNotice(err.message);
    }
  }

  function renderCard(opportunity) {
    const pending = pendingIds.has(opportunity.id);
    const full = opportunity.capacity != null && opportunity.interestCount >= opportunity.capacity;

    return (
      <li key={opportunity.id} className={styles.card}>
        <div className={styles.cardTop}>
          <span className={styles.kind}>{kindLabel(opportunity.kind)}</span>
          <time className={styles.when} dateTime={`${opportunity.date}T${opportunity.time}`}>
            {formatEventDate(opportunity.date)} · {opportunity.time}
          </time>
        </div>

        <h3 className={styles.cardTitle}>{opportunity.title}</h3>
        <p className={styles.description}>{opportunity.description}</p>

        <p className={styles.meta}>
          {opportunity.location}
          {opportunity.county ? ` · ${opportunity.county}` : ""}
        </p>
        <p className={styles.meta}>
          {opportunity.grower
            ? `Grower: ${opportunity.grower.name} (AgroConnect)`
            : opportunity.hostName
              ? `Host: ${opportunity.hostName}`
              : "Hosted by the Agro club"}
          {opportunity.capacity != null
            ? ` · ${Math.min(
                opportunity.interestCount,
                opportunity.capacity
              )}/${opportunity.capacity} spaces`
            : ""}
        </p>

        <p className={styles.count}>
          {opportunity.interestCount}{" "}
          {opportunity.interestCount === 1 ? "member is" : "members are"} interested
          {full && opportunity.interested ? " · full, you're on the list" : ""}
        </p>

        <div className={styles.actions}>
          <button
            type="button"
            className={opportunity.interested ? styles.interestedButton : styles.primaryButton}
            onClick={() => toggleInterest(opportunity)}
            disabled={pending}
            aria-pressed={opportunity.interested}
          >
            {pending
              ? "Saving…"
              : opportunity.interested
                ? "Interested"
                : full
                  ? "Join the list"
                  : "I'm interested"}
          </button>

          <button
            type="button"
            className={styles.ghostButton}
            onClick={() =>
              downloadEventIcs(
                {
                  id: opportunity.id,
                  title: opportunity.title,
                  location: opportunity.location,
                  description: opportunity.description,
                  date: opportunity.date,
                  time: opportunity.time,
                },
                "Agri-Business & Farming Club"
              )
            }
          >
            Add to calendar
          </button>

          {managesClub &&
            (confirmingId === opportunity.id ? (
              <span className={styles.confirm}>
                Remove?
                <button
                  type="button"
                  className={styles.confirmYes}
                  onClick={() => handleDelete(opportunity)}
                >
                  Yes
                </button>
                <button
                  type="button"
                  className={styles.ghostButton}
                  onClick={() => setConfirmingId(null)}
                >
                  No
                </button>
              </span>
            ) : (
              <button
                type="button"
                className={styles.removeButton}
                onClick={() => setConfirmingId(opportunity.id)}
              >
                Remove
              </button>
            ))}
        </div>
      </li>
    );
  }

  function renderGroup(label, description, rows) {
    if (rows.length === 0) return null;
    return (
      <div className={styles.group}>
        <h3 className={styles.groupTitle}>
          {label} <span className={styles.groupCount}>{rows.length}</span>
        </h3>
        <p className={styles.groupNote}>{description}</p>
        <ul className={styles.grid}>{rows.map(renderCard)}</ul>
      </div>
    );
  }

  // Local records only, and the two local origins are shown apart: what the
  // club scheduled itself, and the starter activities seeded with the club.
  const adminAdded = opportunities.filter((entry) => entry.source === "admin");
  const seeded = opportunities.filter((entry) => entry.source !== "admin");

  return (
    <section className={styles.section} aria-labelledby="agro-opportunities">
      <div className={styles.head}>
        <div>
          <p className={styles.eyebrow}>From our growers</p>
          <h2 id="agro-opportunities" className={styles.title}>
            {heading}
          </h2>
        </div>
        {managesClub && member && (
          <button
            type="button"
            className={styles.ghostButton}
            onClick={() => setShowForm((open) => !open)}
            aria-expanded={showForm}
          >
            {showForm ? "Close" : "Add an activity"}
          </button>
        )}
      </div>

      {!user && (
        <p className={styles.locked}>
          Opportunities are for club members. <Link to="/login">Log in</Link> and join the
          Agri-Business &amp; Farming Club to see farm visits, planting days and volunteering
          shifts.
        </p>
      )}

      {user && !member && (
        <p className={styles.locked}>
          Only Agri-Business &amp; Farming Club members can see opportunities. Join the club above
          to view farm visits, planting days and volunteering shifts.
        </p>
      )}

      {member && (
        <>
          <p className={styles.freshness}>
            {partner.live
              ? "Grower details are live from AgroConnect. Activities are the club's own records."
              : partner.stale
                ? `AgroConnect isn't answering — showing the grower list we saved on ${savedAt(
                    partner.asOf
                  )}. The activities below are the club's own and are unaffected.`
                : "AgroConnect isn't answering and we have no saved grower list yet — showing the club's own activities."}
          </p>

          <p className="visually-hidden" role="status">
            {notice}
          </p>

          {showForm && managesClub && (
            <form className={styles.form} onSubmit={handleAdd}>
              <div className={styles.formRow}>
                <label className={styles.field}>
                  <span>Type</span>
                  <select
                    value={form.kind}
                    onChange={(e) => setForm({ ...form, kind: e.target.value })}
                  >
                    {OPPORTUNITY_KINDS.map((kind) => (
                      <option key={kind.id} value={kind.id}>
                        {kind.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={styles.field}>
                  <span>Title</span>
                  <input
                    required
                    maxLength={150}
                    value={form.title}
                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                  />
                </label>
              </div>

              <div className={styles.formRow}>
                <label className={styles.field}>
                  <span>Date</span>
                  <input
                    required
                    type="date"
                    value={form.date}
                    onChange={(e) => setForm({ ...form, date: e.target.value })}
                  />
                </label>
                <label className={styles.field}>
                  <span>Time</span>
                  <input
                    required
                    type="time"
                    value={form.time}
                    onChange={(e) => setForm({ ...form, time: e.target.value })}
                  />
                </label>
                <label className={styles.field}>
                  <span>Spaces</span>
                  <input
                    type="number"
                    min="1"
                    max="10000"
                    placeholder="No limit"
                    value={form.capacity}
                    onChange={(e) => setForm({ ...form, capacity: e.target.value })}
                  />
                </label>
              </div>

              <div className={styles.formRow}>
                <label className={styles.field}>
                  <span>Where</span>
                  <input
                    required
                    maxLength={150}
                    value={form.location}
                    onChange={(e) => setForm({ ...form, location: e.target.value })}
                  />
                </label>
                <label className={styles.field}>
                  <span>County</span>
                  <input
                    maxLength={80}
                    value={form.county}
                    onChange={(e) => setForm({ ...form, county: e.target.value })}
                  />
                </label>
                <label className={styles.field}>
                  <span>Host / grower</span>
                  <input
                    maxLength={120}
                    value={form.hostName}
                    onChange={(e) => setForm({ ...form, hostName: e.target.value })}
                  />
                </label>
              </div>

              <label className={styles.field}>
                <span>What happens</span>
                <textarea
                  rows={3}
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
              </label>

              {formError && <p className={styles.error}>{formError}</p>}
              <button
                type="submit"
                className={styles.primaryButton}
                disabled={formStatus === "saving"}
              >
                {formStatus === "saving" ? "Publishing…" : "Publish activity"}
              </button>
            </form>
          )}

          {status === "loading" && (
            <p className={styles.empty} aria-busy="true">
              Loading opportunities…
            </p>
          )}

          {status === "error" && (
            <div className={styles.empty}>
              <p>Opportunities didn&apos;t load: {error}</p>
              <button type="button" className={styles.ghostButton} onClick={load}>
                Try again
              </button>
            </div>
          )}

          {status === "ok" && opportunities.length === 0 && (
            <p className={styles.empty}>
              No activities are scheduled right now. Check back after the next club meeting.
            </p>
          )}

          {status === "ok" && opportunities.length > 0 && (
            <>
              {renderGroup(
                "Added by club admins",
                "Scheduled in CampusHub by this club's admins.",
                adminAdded
              )}
              {renderGroup(
                "CampusHub starter activities",
                "Seeded with the club when it joined CampusHub; admins can remove them.",
                seeded
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}
