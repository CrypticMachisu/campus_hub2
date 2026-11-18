import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import {
  addCampusDomain,
  createCampus,
  getCampusSettings,
  removeCampusDomain,
  updateCampus,
} from "../utils/campusesStore";
import styles from "./CampusSettings.module.css";

function slugify(value) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function domainList(value) {
  return [
    ...new Set(
      value
        .split(/[\s,]+/)
        .map((domain) => domain.trim())
        .filter(Boolean)
    ),
  ];
}

export default function CampusSettings() {
  const { user, loading: authLoading } = useAuth();
  const [campuses, setCampuses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: "", slug: "", domains: "" });
  const [slugTouched, setSlugTouched] = useState(false);

  const refresh = useCallback(async () => {
    setError("");
    try {
      setCampuses(await getCampusSettings());
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!user || user.role !== "tier1") {
      setLoading(false);
      return;
    }
    setLoading(true);
    refresh().finally(() => setLoading(false));
  }, [authLoading, refresh, user]);

  function handleName(value) {
    setForm((current) => ({
      ...current,
      name: value,
      slug: slugTouched ? current.slug : slugify(value),
    }));
  }

  async function handleCreate(e) {
    e.preventDefault();
    setError("");
    setNotice("");
    const name = form.name.trim();
    const slug = form.slug.trim();
    const domains = domainList(form.domains);
    if (!name || !slug) return;

    setCreating(true);
    try {
      const campus = await createCampus({ name, slug, domains });
      setForm({ name: "", slug: "", domains: "" });
      setSlugTouched(false);
      setNotice(`${campus.name} was added.`);
      await refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  }

  if (authLoading) {
    return (
      <main className={styles.page}>
        <p role="status">Loading campus settings…</p>
      </main>
    );
  }

  if (!user || user.role !== "tier1") {
    return (
      <main className={styles.page}>
        <header className={styles.header}>
          <p className={styles.eyebrow}>Platform settings</p>
          <h1>Campus settings</h1>
        </header>
        <p className={styles.notice}>
          Tier 1 admin access is required. <Link to="/">Return to the edition</Link>.
        </p>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <p className={styles.eyebrow}>Platform settings</p>
        <h1>Campus settings</h1>
        <p className={styles.lede}>
          Change how a campus is named, its URL slug, and which email domains join it at
          registration. Removing a domain only stops new signups; existing accounts keep their
          campus.
        </p>
      </header>

      {notice && (
        <p className={styles.notice} role="status">
          {notice}
        </p>
      )}
      {error && (
        <p className={styles.error} role="alert">
          {error}{" "}
          <button type="button" className={styles.quiet} onClick={refresh}>
            Try again
          </button>
        </p>
      )}

      <section className={styles.section} aria-labelledby="add-campus-heading">
        <h2 id="add-campus-heading">Add a campus</h2>
        <p className={styles.sectionLede}>
          A campus needs a display name, a unique lowercase slug, and at least one email domain.
          Prefer the institution&apos;s real domain over a personal or temporary one.
        </p>
        <form className={styles.form} onSubmit={handleCreate}>
          <div className={styles.formRow}>
            <label className={styles.field}>
              Campus name
              <input
                type="text"
                value={form.name}
                onChange={(e) => handleName(e.target.value)}
                placeholder="Strathmore University"
                maxLength={150}
                required
              />
            </label>
            <label className={styles.field}>
              Slug
              <input
                type="text"
                value={form.slug}
                onChange={(e) => {
                  setSlugTouched(true);
                  setForm((current) => ({ ...current, slug: e.target.value }));
                }}
                placeholder="strathmore"
                pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
                maxLength={80}
                required
              />
              <span className={styles.hint}>
                Lowercase letters, numbers and single hyphens. The campus id never changes.
              </span>
            </label>
          </div>
          <label className={styles.field}>
            Email domains
            <input
              type="text"
              value={form.domains}
              onChange={(e) => setForm((current) => ({ ...current, domains: e.target.value }))}
              placeholder="strathmore.edu, campus.edu"
              required
            />
            <span className={styles.hint}>
              Separate multiple domains with commas or spaces. These decide which campus a new
              account joins.
            </span>
          </label>
          <div className={styles.actions}>
            <button
              type="submit"
              className={`${styles.button} ${styles.primary}`}
              disabled={creating}
            >
              {creating ? "Adding campus…" : "Add campus"}
            </button>
          </div>
        </form>
      </section>

      <section className={styles.section} aria-labelledby="campuses-heading">
        <h2 id="campuses-heading">Campuses</h2>
        <p className={styles.sectionLede}>
          {loading
            ? "Loading the campus list…"
            : `${campuses.length} ${campuses.length === 1 ? "campus" : "campuses"} configured.`}
        </p>

        {loading && <p role="status">Loading campuses…</p>}
        {!loading && campuses.length === 0 && (
          <p className={styles.empty}>No campuses yet. Add the first one above.</p>
        )}
        {!loading && (
          <ul className={styles.campusList}>
            {campuses.map((campus) => (
              <CampusCard
                key={campus.id}
                campus={campus}
                onChanged={async (message) => {
                  setNotice(message);
                  await refresh();
                }}
              />
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

function CampusCard({ campus, onChanged }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(campus.name);
  const [slug, setSlug] = useState(campus.slug);
  const [domain, setDomain] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  function startEditing() {
    setName(campus.name);
    setSlug(campus.slug);
    setEditing(true);
    setError("");
  }

  async function handleSave(e) {
    e.preventDefault();
    setError("");
    setBusy("details");
    try {
      await updateCampus(campus.id, { name, slug });
      setEditing(false);
      await onChanged(`${campus.name} was updated.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  }

  async function handleAddDomain(e) {
    e.preventDefault();
    setError("");
    setBusy("domain");
    try {
      await addCampusDomain(campus.id, domain);
      setDomain("");
      await onChanged(`${domain.trim().toLowerCase()} was added to ${campus.name}.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  }

  async function handleRemoveDomain(value) {
    if (
      !window.confirm(
        `Remove ${value} from ${campus.name}? New signups will no longer join this campus with it.`
      )
    ) {
      return;
    }
    setError("");
    setBusy(`remove-${value}`);
    try {
      await removeCampusDomain(campus.id, value);
      await onChanged(`${value} was removed from ${campus.name}.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  }

  return (
    <li className={styles.campusCard}>
      <div className={styles.cardHead}>
        <div>
          <h3>{campus.name}</h3>
          <p className={styles.slug}>{campus.slug}</p>
          <p className={styles.meta}>
            <span>
              {campus.userCount} {campus.userCount === 1 ? "account" : "accounts"}
            </span>
            <span>
              {campus.clubCount} {campus.clubCount === 1 ? "club" : "clubs"}
            </span>
            <span>Campus id {campus.id}</span>
          </p>
        </div>
        {!editing && (
          <button
            type="button"
            className={`${styles.button} ${styles.quiet}`}
            onClick={startEditing}
          >
            Edit details
          </button>
        )}
      </div>

      <ul className={styles.domains} aria-label={`Email domains for ${campus.name}`}>
        {campus.domains.map((value) => (
          <li key={value} className={styles.domain}>
            {value}
            <button
              type="button"
              className={styles.domainRemove}
              aria-label={`Remove ${value} from ${campus.name}`}
              title={
                campus.domains.length <= 1
                  ? "A campus needs at least one email domain."
                  : `Remove ${value}`
              }
              disabled={campus.domains.length <= 1 || Boolean(busy)}
              onClick={() => handleRemoveDomain(value)}
            >
              {busy === `remove-${value}` ? "…" : "×"}
            </button>
          </li>
        ))}
      </ul>
      {campus.domains.length <= 1 && (
        <p className={styles.pending}>A campus needs at least one email domain.</p>
      )}
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}

      {editing && (
        <form className={`${styles.form} ${styles.cardForm}`} onSubmit={handleSave}>
          <div className={styles.formRow}>
            <label className={styles.field}>
              Campus name
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={150}
                required
              />
            </label>
            <label className={styles.field}>
              Slug
              <input
                type="text"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
                maxLength={80}
                required
              />
            </label>
          </div>
          <div className={styles.actions}>
            <button
              type="submit"
              className={`${styles.button} ${styles.primary}`}
              disabled={busy === "details"}
            >
              {busy === "details" ? "Saving…" : "Save changes"}
            </button>
            <button
              type="button"
              className={`${styles.button} ${styles.quiet}`}
              onClick={() => setEditing(false)}
              disabled={busy === "details"}
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      <form
        className={styles.form}
        onSubmit={handleAddDomain}
        aria-label={`Add a domain to ${campus.name}`}
      >
        <div className={styles.formRow}>
          <label className={styles.field}>
            Add an email domain
            <input
              type="text"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              placeholder="school.ac.ke"
            />
          </label>
          <div className={styles.actions} style={{ alignSelf: "end" }}>
            <button
              type="submit"
              className={`${styles.button} ${styles.primary}`}
              disabled={!domain.trim() || busy === "domain"}
            >
              {busy === "domain" ? "Adding…" : "Add domain"}
            </button>
          </div>
        </div>
      </form>
    </li>
  );
}
