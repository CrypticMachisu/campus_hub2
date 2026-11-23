import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useClubs } from "../context/ClubsContext";
import { getCampuses } from "../utils/campusesStore";
import { formatDateTime } from "../utils/dateTime";
import {
  addFamilyAdmin,
  createFamily,
  getFamilySettings,
  linkFamilyChapter,
  moveFamilyChapter,
  removeFamilyAdmin,
  unlinkFamilyChapter,
  updateFamily,
  uploadFamilyMark,
} from "../utils/clubFamiliesStore";
import { usePageMetadata } from "../hooks/usePageMetadata";
import styles from "./FamilySettings.module.css";

/** Center-crop a chosen image to a 256px square and return a data URL. */
function squareImageDataUrl(file) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type.startsWith("image/")) {
      reject(new Error("Choose a JPEG, PNG or WebP image."));
      return;
    }
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      try {
        const side = Math.min(image.naturalWidth, image.naturalHeight);
        const canvas = document.createElement("canvas");
        canvas.width = 256;
        canvas.height = 256;
        const context = canvas.getContext("2d");
        context.drawImage(
          image,
          (image.naturalWidth - side) / 2,
          (image.naturalHeight - side) / 2,
          side,
          side,
          0,
          0,
          256,
          256
        );
        resolve(canvas.toDataURL("image/jpeg", 0.86));
      } catch (err) {
        reject(err);
      } finally {
        URL.revokeObjectURL(objectUrl);
      }
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("That image could not be read."));
    };
    image.src = objectUrl;
  });
}

function slugify(value) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export default function FamilySettings() {
  usePageMetadata({
    title: "Family settings",
    description: "Manage shared club-family identity and chapters.",
  });

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
    logoUrl: "",
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

  const canManageFamilies =
    Boolean(user) && (user.role === "tier1" || (user.familyAdminOf || []).length > 0);
  const isTier1 = user?.role === "tier1";

  useEffect(() => {
    if (authLoading) return;
    if (!canManageFamilies) {
      setLoading(false);
      return;
    }
    setLoading(true);
    reload().finally(() => setLoading(false));
  }, [authLoading, canManageFamilies, reload]);

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
      setForm({ name: "", slug: "", homeCampusId: "", description: "", logoUrl: "" });
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

  if (!canManageFamilies) {
    return (
      <main className={styles.page}>
        <header className={styles.header}>
          <p className={styles.eyebrow}>Platform settings</p>
          <h1>Club families</h1>
        </header>
        <p className={styles.notice}>
          Platform admin or family editor access is required.{" "}
          <Link to="/">Return to the edition</Link>.
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
          the name, mark and URL; each chapter keeps its own officers, members and activity.
          {isTier1
            ? " Platform admins control the chapter list and can delegate identity editing below."
            : " You can edit the shared identity, but the chapter list stays with platform admins."}
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

      {isTier1 && (
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
            <label className={styles.field}>
              Family mark URL <span className={styles.optional}>(optional)</span>
              <input
                type="url"
                value={form.logoUrl}
                onChange={(e) => setForm((current) => ({ ...current, logoUrl: e.target.value }))}
                placeholder="https://…/family-mark.png"
                maxLength={500}
              />
              <span className={styles.hint}>
                Use a square image. A monogram is shown when no mark is set.
              </span>
            </label>
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
      )}

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
                families={families}
                clubs={clubs}
                isTier1={isTier1}
                onChanged={handleFamilySaved}
              />
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

function FamilyCard({ family, families, clubs, isTier1, onChanged }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(family.name);
  const [slug, setSlug] = useState(family.slug);
  const [description, setDescription] = useState(family.description || "");
  const [logoUrl, setLogoUrl] = useState(family.logoUrl || "");
  const [markPreview, setMarkPreview] = useState("");
  const [markBusy, setMarkBusy] = useState(false);
  const [clubId, setClubId] = useState("");
  const [moveClubId, setMoveClubId] = useState("");
  const [moveTargetId, setMoveTargetId] = useState("");
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
    setLogoUrl(family.logoUrl || "");
    setMarkPreview("");
    setEditing(true);
    setError("");
  }

  async function handleSave(e) {
    e.preventDefault();
    setError("");
    setBusy("details");
    try {
      let nextLogoUrl = logoUrl;
      if (markPreview) {
        setMarkBusy(true);
        const marked = await uploadFamilyMark(family.id, markPreview);
        nextLogoUrl = marked.logoUrl;
        setLogoUrl(nextLogoUrl);
        setMarkPreview("");
      }
      const updated = await updateFamily(family.id, {
        name,
        slug,
        description,
        logoUrl: nextLogoUrl,
      });
      setEditing(false);
      await onChanged(updated, `${updated.name} was updated.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setMarkBusy(false);
      setBusy("");
    }
  }

  async function handleMarkFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setError("");
    try {
      setMarkPreview(await squareImageDataUrl(file));
    } catch (err) {
      setError(err.message);
    } finally {
      event.target.value = "";
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

  const moveChapter = family.chapters.find((chapter) => chapter.id === moveClubId);
  const moveTargets = families.filter(
    (candidate) =>
      candidate.id !== family.id &&
      (!moveChapter ||
        !candidate.chapters.some((chapter) => chapter.campusId === moveChapter.campusId))
  );

  async function handleMoveChapter(e) {
    e.preventDefault();
    if (!moveClubId || !moveTargetId) return;
    const target = families.find((candidate) => candidate.id === moveTargetId);
    const chapter = family.chapters.find((entry) => entry.id === moveClubId);
    setError("");
    setBusy("move");
    try {
      const updated = await moveFamilyChapter(moveTargetId, moveClubId, family.id);
      setMoveClubId("");
      setMoveTargetId("");
      await onChanged(
        updated,
        `${chapter?.name || "The chapter"} moved to ${target?.name || "the target family"}.`
      );
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
        <div className={styles.identity}>
          <FamilyMark family={family} />
          <div>
            <h3>{family.name}</h3>
            <p className={styles.slug}>
              {family.slug} · home {family.homeCampusName}
            </p>
          </div>
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
      {(family.lastIdentityChange || family.lastChapterMove) && (
        <div className={styles.auditBlock}>
          {family.lastIdentityChange && (
            <p>
              <span>Last identity edit</span>
              {family.lastIdentityChange.actorName} · {formatDateTime(family.lastIdentityChange.at)}
            </p>
          )}
          {family.lastChapterMove && (
            <p>
              <span>Last chapter move</span>
              {family.lastChapterMove.detail.clubName || "A chapter"} from{" "}
              {family.lastChapterMove.detail.fromFamilyName || "another family"} to{" "}
              {family.lastChapterMove.detail.toFamilyName || family.name} ·{" "}
              {family.lastChapterMove.actorName} · {formatDateTime(family.lastChapterMove.at)}
            </p>
          )}
        </div>
      )}
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
                {isTier1 && (
                  <button
                    type="button"
                    className={styles.chapterRemove}
                    disabled={Boolean(busy)}
                    onClick={() => handleRemoveChapter(chapter)}
                  >
                    {busy === `remove-${chapter.id}` ? "…" : "Detach"}
                  </button>
                )}
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
          <label className={styles.field}>
            Family mark URL <span className={styles.optional}>(optional)</span>
            <input
              type="url"
              value={logoUrl}
              onChange={(e) => {
                setLogoUrl(e.target.value);
                setMarkPreview("");
              }}
              placeholder="https://…/family-mark.png"
              maxLength={500}
            />
          </label>
          <label className={styles.field}>
            Or upload and crop a square mark
            <input type="file" accept="image/jpeg,image/png,image/webp" onChange={handleMarkFile} />
            <span className={styles.hint}>
              The image is center-cropped to 256 × 256. Upload needs object storage; the URL field
              stays available as a fallback.
            </span>
          </label>
          {markPreview && (
            <div className={styles.markPreview}>
              <img src={markPreview} alt="Preview of the cropped family mark" />
              <button
                type="button"
                className={`${styles.button} ${styles.quiet}`}
                onClick={() => setMarkPreview("")}
              >
                Clear preview
              </button>
            </div>
          )}
          <div className={styles.actions}>
            <button
              type="submit"
              className={`${styles.button} ${styles.primary}`}
              disabled={busy === "details" || markBusy}
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
      )}{" "}
      {isTier1 && families.length > 1 && family.chapters.length > 0 && (
        <details className={styles.moveBlock}>
          <summary>Move a chapter to another family</summary>
          <form className={styles.form} onSubmit={handleMoveChapter}>
            <div className={styles.formRow}>
              <label className={styles.field}>
                Chapter
                <select
                  value={moveClubId}
                  onChange={(e) => {
                    setMoveClubId(e.target.value);
                    setMoveTargetId("");
                  }}
                >
                  <option value="">Choose a chapter</option>
                  {family.chapters.map((chapter) => (
                    <option key={chapter.id} value={chapter.id}>
                      {chapter.name} — {chapter.campusName}
                    </option>
                  ))}
                </select>
              </label>
              <label className={styles.field}>
                Move to
                <select
                  value={moveTargetId}
                  onChange={(e) => setMoveTargetId(e.target.value)}
                  disabled={!moveClubId}
                >
                  <option value="">Choose a family</option>
                  {moveTargets.map((candidate) => (
                    <option key={candidate.id} value={candidate.id}>
                      {candidate.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <p className={styles.hint}>
              The target family must not already have a chapter on that campus. The move is audited
              with both family names.
            </p>
            {moveClubId && moveTargets.length === 0 && (
              <p className={styles.hint}>No other family has a free chapter slot on that campus.</p>
            )}
            <div className={styles.actions}>
              <button
                type="submit"
                className={`${styles.button} ${styles.primary}`}
                disabled={!moveClubId || !moveTargetId || busy === "move"}
              >
                {busy === "move" ? "Moving…" : "Move chapter"}
              </button>
            </div>
          </form>
        </details>
      )}
      {isTier1 && (
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
                Only unlinked clubs on a campus without a chapter are listed. A family has at most
                one chapter per campus.
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
      )}
      {isTier1 && <FamilyAdmins family={family} onChanged={onChanged} />}
    </li>
  );
}

function FamilyMark({ family }) {
  if (family.logoUrl) {
    return <img className={styles.familyMark} src={family.logoUrl} alt="" />;
  }
  return (
    <span className={styles.familyMarkFallback} aria-hidden="true">
      {family.name.slice(0, 2).toUpperCase()}
    </span>
  );
}

function FamilyAdmins({ family, onChanged }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("lead");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  async function handleAdd(e) {
    e.preventDefault();
    if (!email.trim()) return;
    setError("");
    setBusy("add");
    try {
      const updated = await addFamilyAdmin(family.id, { email: email.trim(), role });
      setEmail("");
      setRole("lead");
      await onChanged(updated, `${updated.name} has a new family editor.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  }

  async function handleRemove(admin) {
    if (!window.confirm(`Remove ${admin.name}'s family editor access?`)) return;
    setError("");
    setBusy(`remove-${admin.id}`);
    try {
      const updated = await removeFamilyAdmin(family.id, admin.id);
      await onChanged(updated, `${admin.name} is no longer a family editor.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  }

  return (
    <div className={styles.adminBlock}>
      <h4>Family editors</h4>
      <p className={styles.hint}>
        Editors can change the shared name, mark and description. They cannot add, move or detach
        chapters, or edit chapter content.
      </p>
      {family.admins?.length ? (
        <ul className={styles.adminList}>
          {family.admins.map((admin) => (
            <li key={admin.id} className={styles.adminRow}>
              <span>
                <strong>{admin.name}</strong>
                <small>
                  {admin.email} · {admin.role}
                </small>
              </span>
              <button
                type="button"
                className={styles.chapterRemove}
                disabled={Boolean(busy)}
                onClick={() => handleRemove(admin)}
              >
                {busy === `remove-${admin.id}` ? "…" : "Remove"}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className={styles.hint}>No delegated editors yet.</p>
      )}
      <form className={styles.form} onSubmit={handleAdd}>
        <div className={styles.formRow}>
          <label className={styles.field}>
            Account email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="member@campus.edu"
              required
            />
          </label>
          <label className={styles.field}>
            Role
            <select value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="lead">Lead</option>
              <option value="editor">Editor</option>
            </select>
          </label>
        </div>
        <div className={styles.actions}>
          <button
            type="submit"
            className={`${styles.button} ${styles.primary}`}
            disabled={busy === "add"}
          >
            {busy === "add" ? "Adding…" : "Add family editor"}
          </button>
        </div>
      </form>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
