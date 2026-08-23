import { Link } from "react-router-dom";
import styles from "./ClubCard.module.css";

/**
 * @typedef {Object} Club
 * @property {string} id
 * @property {string} name
 * @property {string} category
 * @property {string} description
 * @property {string} logoUrl
 */

/**
 * Clickable summary card for a club, linking to its profile page.
 * @param {{ club: Club }} props
 */
export default function ClubCard({ club }) {
  return (
    <Link to={`/clubs/${club.id}`} className={styles.card}>
      <span className={styles.pin} aria-hidden="true" />
      <img className={styles.logo} src={club.logoUrl} alt="" />
      <div className={styles.body}>
        <span className={styles.badge}>{club.category}</span>
        <h3 className={styles.name}>{club.name}</h3>
        <p className={styles.description}>{club.description}</p>
      </div>
    </Link>
  );
}
