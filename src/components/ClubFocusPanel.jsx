import styles from "./ClubFocusPanel.module.css";

/**
 * The one club-dependent panel in the workspace.
 *
 * Content comes from the club's playbook (category default, overridden by the
 * club's admin): a debate club gets this week's motion, a photography club gets
 * a shooting prompt, a running club gets pace groups. The shape is shared, so
 * the panel never needs a per-category component.
 *
 * @param {{ playbook: ReturnType<typeof import("../utils/clubPlaybook").getClubPlaybook>, clubName: string }} props
 */
export default function ClubFocusPanel({ playbook, clubName }) {
  const { focus } = playbook;
  const hasContent = Boolean(focus.title || focus.body || focus.items.length || focus.link);
  if (!hasContent) return null;

  return (
    <section className={styles.panel} aria-labelledby="club-focus-title">
      <p className={styles.kicker}>{focus.kicker}</p>

      <h2 id="club-focus-title" className={styles.title}>
        {focus.title}
      </h2>

      {focus.body && <p className={styles.body}>{focus.body}</p>}

      {focus.items.length > 0 && (
        <ul className={styles.items}>
          {focus.items.map((item) => (
            <li key={item} className={styles.item}>
              {item}
            </li>
          ))}
        </ul>
      )}

      {focus.link && (
        <a className={styles.link} href={focus.link} target="_blank" rel="noreferrer noopener">
          Open the club&apos;s link
          <span className="visually-hidden"> (opens in a new tab)</span>
        </a>
      )}

      <p className={styles.footnote}>For {clubName} members</p>
    </section>
  );
}
