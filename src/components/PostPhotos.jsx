import ReportButton from "./ReportButton";
import styles from "./PostPhotos.module.css";

/** Up to three photos attached to a post, in their saved order. */
export default function PostPhotos({
  media = [],
  label = "Photos with this post",
  showReport = false,
}) {
  const photos = media.filter((entry) => entry.url);
  if (!photos.length) return null;

  return (
    <ul className={styles.list} data-count={photos.length} aria-label={label}>
      {photos.map((photo) => (
        <li key={photo.id} className={styles.item}>
          <img
            src={photo.url}
            alt={photo.decorative ? "" : photo.altText}
            width={photo.width || undefined}
            height={photo.height || undefined}
            loading="lazy"
            decoding="async"
          />
          {showReport && (
            <div className={styles.report}>
              <ReportButton targetType="media" targetId={photo.id} label="Report photo" />
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
