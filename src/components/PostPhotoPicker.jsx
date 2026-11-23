import { useId } from "react";
import { ACCEPTED_PHOTO_TYPES, MAX_POST_PHOTOS } from "../utils/photoFiles";
import styles from "./PostPhotoPicker.module.css";

/**
 * Add up to three photos, each with a description or an explicit decorative
 * choice. The file input is a real labelled control; previews are not the only
 * way to understand what is attached.
 */
export default function PostPhotoPicker({
  photos,
  onAdd,
  onRemove,
  onChange,
  disabled = false,
  error = "",
}) {
  const inputId = useId();

  return (
    <div className={styles.picker}>
      <div className={styles.head}>
        <label className={styles.fileLabel} htmlFor={inputId}>
          <span>Add photos</span>
          <input
            id={inputId}
            type="file"
            accept={ACCEPTED_PHOTO_TYPES}
            multiple
            disabled={disabled || photos.length >= MAX_POST_PHOTOS}
            onChange={onAdd}
          />
        </label>
        <span className={styles.count}>
          {photos.length} of {MAX_POST_PHOTOS}
        </span>
      </div>
      <p className={styles.hint}>JPEG, PNG or WebP, up to 5 MB each.</p>

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}

      {photos.length > 0 && (
        <ul className={styles.list}>
          {photos.map((photo, index) => {
            const descriptionId = `photo-${photo.key}-description`;
            return (
              <li key={photo.key} className={styles.item}>
                <fieldset className={styles.fieldset}>
                  <legend>Photo {index + 1}</legend>
                  <img className={styles.preview} src={photo.previewUrl} alt="" />
                  <label className={styles.altLabel}>
                    <span>Description for screen readers</span>
                    <input
                      type="text"
                      maxLength={300}
                      value={photo.altText}
                      disabled={disabled || photo.decorative}
                      aria-describedby={descriptionId}
                      onChange={(e) => onChange(photo.key, { altText: e.target.value })}
                    />
                  </label>
                  <p id={descriptionId} className={styles.hint}>
                    Required unless the photo is decorative.
                  </p>
                  <label className={styles.check}>
                    <input
                      type="checkbox"
                      checked={photo.decorative}
                      disabled={disabled}
                      onChange={(e) =>
                        onChange(photo.key, {
                          decorative: e.target.checked,
                          altText: e.target.checked ? "" : photo.altText,
                        })
                      }
                    />
                    <span>Decorative — no description needed</span>
                  </label>
                  <button
                    type="button"
                    className={styles.remove}
                    disabled={disabled}
                    onClick={() => onRemove(photo.key)}
                  >
                    Remove photo
                  </button>
                </fieldset>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
