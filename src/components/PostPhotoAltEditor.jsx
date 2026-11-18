import { useEffect, useId, useRef, useState } from "react";
import styles from "./PostPhotoAltEditor.module.css";

/**
 * Change the description of a photo that is already on a post. Kept separate
 * from the post text editor so a correction does not republish the whole
 * dispatch, and so the required-description rule stays visible.
 */
export default function PostPhotoAltEditor({ media, photoNumber, onSave, disabled = false }) {
  const [editing, setEditing] = useState(false);
  const [altText, setAltText] = useState(media.altText || "");
  const [decorative, setDecorative] = useState(Boolean(media.decorative));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const dialogRef = useRef(null);
  const inputRef = useRef(null);
  const inputId = useId();
  const hintId = useId();
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (editing && dialog && !dialog.open) {
      dialog.showModal();
      inputRef.current?.focus();
    } else if (!editing && dialog?.open) {
      dialog.close();
    }
  }, [editing]);

  function startEditing() {
    setAltText(media.altText || "");
    setDecorative(Boolean(media.decorative));
    setError("");
    setEditing(true);
  }

  async function save(event) {
    event.preventDefault();
    if (!decorative && !altText.trim()) {
      setError("Describe the photo for screen readers, or mark it as decorative.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      await onSave({
        altText: decorative ? "" : altText.trim(),
        decorative,
      });
      setEditing(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className={styles.trigger}
        aria-label={`Edit description for photo ${photoNumber}`}
        onClick={startEditing}
        disabled={disabled}
      >
        Edit description
      </button>

      {editing && (
        <dialog
          ref={dialogRef}
          className={styles.dialog}
          aria-labelledby={titleId}
          onClose={() => {
            setEditing(false);
            setError("");
          }}
        >
          <form onSubmit={save}>
            <h2 id={titleId} className={styles.title}>
              Photo {photoNumber} description
            </h2>
            <p className={styles.intro}>
              This is what screen readers announce for the photo. Say what it shows, not what it is.
            </p>
            <label className={styles.label} htmlFor={inputId}>
              <span>Description for screen readers</span>
              <input
                ref={inputRef}
                id={inputId}
                type="text"
                maxLength={300}
                value={altText}
                disabled={saving || decorative}
                aria-describedby={hintId}
                onChange={(event) => setAltText(event.target.value)}
              />
            </label>
            <p id={hintId} className={styles.hint}>
              Required unless the photo is decorative.
            </p>
            <label className={styles.check}>
              <input
                type="checkbox"
                checked={decorative}
                disabled={saving}
                onChange={(event) => {
                  setDecorative(event.target.checked);
                  if (event.target.checked) setAltText("");
                }}
              />
              <span>This photo is decorative</span>
            </label>
            {error && (
              <p className={styles.error} role="alert">
                {error}
              </p>
            )}
            <div className={styles.actions}>
              <button type="submit" className={styles.save} disabled={saving}>
                {saving ? "Saving…" : "Save description"}
              </button>
              <button
                type="button"
                className={styles.cancel}
                onClick={() => setEditing(false)}
                disabled={saving}
              >
                Cancel
              </button>
            </div>
          </form>
        </dialog>
      )}
    </>
  );
}
