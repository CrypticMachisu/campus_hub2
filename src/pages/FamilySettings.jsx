import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useClubs } from "../context/ClubsContext";
import { getCampuses } from "../utils/campusesStore";
import {
  createFamily,
  getFamilySettings,
  linkFamilyChapter,
  unlinkFamilyChapter,
  updateFamily,
} from "../utils/clubFamiliesStore";
import styles from "./FamilySettings.module.css";

function slugify(value) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export default function FamilySettings() {
  const { user, loading: authLoading } = useAuth();
  const { clubs, refresh: refreshClubs } = useClubs();
  const [families, setFamilies] = useState([]);
  const [campuses, setCampuses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    name: "",
    slug: "",
    homeCampusId: "",
    description: "",
  });
  const [slugTouched, setSlugTouched] = useState(false);

  const reload = useCallback(async () => {
    setError("");
    try {
      const [familyRows, campusRows] = await Promise.all([getFamilySettings(), getCampuses()]);
      setFamilies(familyRows);
      setCampuses(campusRows);
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
    reload().finally(() => setLoading(false));
  }, [authLoading, reload, user]);

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
    if (!name || !slug || !form.homeCampusId) return;

    setCreating(true);
    try {
      const family = await createFamily({ ...form, name, slug });
      setForm({ name: "", slug: "", homeCampusId: "", description: "" });
      setSlugTouched(false);
      setNotice(`${family.name} was created. Add its chapters next.`);
      await reload();
    } catch (err) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  }

  async function handleFamilySaved(family, message) {
    setNotice(message);
    await Promise.all([reload(), refreshClubs()]);
    return family;
  }

  if (authLoading) {
    return (
      <main className={styles.page}>
        <p role="status">Loading family settings…</p>
      </main>
    );
  }

  if (!user || user.role !== "tier1") {
    return (
      <main className={styles.page}>
        <header className={styles.header}>
          <p className={styles.eyebrow}>Platform settings</p>
          <h1>Club families</h1>
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
        <h1>Club families</h1>
        <p className={styles.lede}>
          A family is the shared identity for a club with chapters on more than one campus. It owns
          the name and URL; each chapter keeps its own officers, members and activity. Linking a
          club here does not change what members see yet.
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
          <button type="button" className={styles.quiet} onClick={reload}>
            Try again
          </button>
        </p>
      )}

      <section className={styles.section} aria-labelledby="create-family-heading">
        <h2 id="create-family-heading">Create a family</h2>
        <p className={styles.sectionLede}>
          Start with the shared name, a unique lowercase slug, and the campus that owns the
          identity. Existing clubs can be attached afterwards.
        </p>
        <form className={styles.form} onSubmit={handleCreate}>
          <div className={styles.formRow}>
            <label className={styles.field}>
              Family name
              <input
                type="text"
                value={form.name}
                onChange={(e) => handleName(e.target.value)}
                placeholder="Kesho Debate Union"
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
                placeholder="kesho-debate-union"
                pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
                maxLength={80}
                required
              />
              <span className={styles.hint}>Lowercase letters, numbers and single hyphens.</span>
            </label>
          </div>
          <div className={styles.formRow}>
            <label className={styles.field}>
              Home campus
              <select
                value={form.homeCampusId}
                onChange={(e) =>
                  setForm((current) => ({ ...current, homeCampusId: e.target.value }))
                }
                required
              >
                <option value="">Choose a campus</option>
                {campuses.map((campus) => (
                  <option key={campus.id} value={campus.id}>
                    {campus.name}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.field}>
              Description
              <input
                type="text"
                value={form.description}
                onChange={(e) =>
                  setForm((current) => ({ ...current, description: e.target.value }))
                }
                placeholder="Optional shared description"
                maxLength={2000}
              />
            </label>
          </div>
          <div className={styles.actions}>
            <button
              type="submit"
              className={`${styles.button} ${styles.primary}`}
              disabled={creating}
            >
              {creating ? "Creating…" : "Create family"}
            </button>
          </div>
        </form>
      </section>

      <section className={styles.section} aria-labelledby="families-heading">
        <h2 id="families-heading">Families</h2>
        <p className={styles.sectionLede}>
          {loading
            ? "Loading families…"
            : `${families.length} ${families.length === 1 ? "family" : "families"} configured.`}
        </p>

        {loading && <p role="status">Loading club families…</p>}
        {!loading && families.length === 0 && (
          <p className={styles.empty}>No families yet. Create the first one above.</p>
        )}
        {!loading && (
          <ul className={styles.familyList}>
            {families.map((family) => (
              <FamilyCard
                key={family.id}
                family={family}
                clubs={clubs}
                onChanged={handleFamilySaved}
              />
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

function FamilyCard({ family, clubs, onChanged }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(family.name);
  const [slug, setSlug] = useState(family.slug);
  const [description, setDescription] = useState(family.description || "");
  const [clubId, setClubId] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const candidates = clubs.filter(
    (club) =>
      !club.familyId && !family.chapters.some((chapter) => chapter.campusId === club.campusId)
  );

  function startEditing() {
    setName(family.name);
    setSlug(family.slug);
    setDescription(family.description || "");
    setEditing(true);
    setError("");
  }

  async function handleSave(e) {
    e.preventDefault();
    setError("");
    setBusy("details");
    try {
      const updated = await updateFamily(family.id, { name, slug, description });
      setEditing(false);
      await onChanged(updated, `${updated.name} was updated.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  }

  async function handleAddChapter(e) {
    e.preventDefault();
    if (!clubId) return;
    setError("");
    setBusy("chapter");
    try {
      const updated = await linkFamilyChapter(family.id, clubId);
      setClubId("");
      await onChanged(updated, `A chapter was added to ${updated.name}.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  }

  async function handleRemoveChapter(chapter) {
    if (!window.confirm(`Detach ${chapter.name} from ${family.name}? The club itself stays.`)) {
      return;
    }
    setError("");
    setBusy(`remove-${chapter.id}`);
    try {
      const updated = await unlinkFamilyChapter(family.id, chapter.id);
      await onChanged(updated, `${chapter.name} is no longer a chapter.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  }

  return (
    <li className={styles.familyCard}>
      <div className={styles.cardHead}>
        <div>
          <h3>{family.name}</h3>
          <p className={styles.slug}>
            {family.slug} · home {family.homeCampusName}
          </p>
        </div>
        <div className={styles.cardActions}>
          <span className={styles.status}>{family.status}</span>
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
      </div>

      {family.description && <p className={styles.description}>{family.description}</p>}

      <div className={styles.chapterBlock}>
        <h4>Chapters</h4>
        {family.chapters.length === 0 ? (
          <p className={styles.hint}>No chapters linked yet.</p>
        ) : (
          <ul className={styles.chapterList}>
            {family.chapters.map((chapter) => (
              <li key={chapter.id} className={styles.chapter}>
                <span>
                  <strong>{chapter.name}</strong>
                  <small>{chapter.campusName}</small>
                </span>
                <button
                  type="button"
                  className={styles.chapterRemove}
                  disabled={Boolean(busy)}
                  onClick={() => handleRemoveChapter(chapter)}
                >
                  {busy === `remove-${chapter.id}` ? "…" : "Detach"}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}

      {editing && (
        <form className={`${styles.form} ${styles.cardForm}`} onSubmit={handleSave}>
          <div className={styles.formRow}>
            <label className={styles.field}>
              Family name
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
          <label className={styles.field}>
            Description
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={2000}
            />
          </label>
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
        onSubmit={handleAddChapter}
        aria-label={`Add a chapter to ${family.name}`}
      >
        <div className={styles.formRow}>
          <label className={styles.field}>
            Add an existing club as a chapter
            <select value={clubId} onChange={(e) => setClubId(e.target.value)}>
              <option value="">Choose a club</option>
              {candidates.map((club) => (
                <option key={club.id} value={club.id}>
                  {club.name} — {club.campusName || "campus"}
                </option>
              ))}
            </select>
            <span className={styles.hint}>
              Only unlinked clubs on a campus without a chapter are listed. A family has at most one
              chapter per campus.
            </span>
          </label>
          <div className={styles.actions} style={{ alignSelf: "end" }}>
            <button
              type="submit"
              className={`${styles.button} ${styles.primary}`}
              disabled={!clubId || busy === "chapter"}
            >
              {busy === "chapter" ? "Linking…" : "Add chapter"}
            </button>
          </div>
        </div>
        {candidates.length === 0 && (
          <p className={styles.hint}>No eligible unlinked clubs are available right now.</p>
        )}
      </form>
    </li>
  );
}
