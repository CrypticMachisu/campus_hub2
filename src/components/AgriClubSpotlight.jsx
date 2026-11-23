import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import styles from "./AgriClubSpotlight.module.css";

// The club row created by server/migrations/004_add_agriculture_club.sql.
export const AGRI_CLUB_ID = "club-07";

/**
 * Recruitment block for the Agri club. Everything here belongs to the club
 * itself — there is no external feed to wait for, so it renders instantly and
 * cannot fail. The activities below it are the club's own records.
 */
export default function AgriClubSpotlight() {
  const { user } = useAuth();

  return (
    <section className={styles.spotlight}>
      <div className={styles.pitch}>
        <h2>Grow with us</h2>
        <p>
          The Agri-Business &amp; Farming Club is for anyone curious about where food comes from and
          how it reaches a plate. We run farm visits, planting days and volunteering shifts with
          growers around Kenya, and we learn the business side of food along the way. New members
          are welcome, whatever your course.
        </p>
        <div className={styles.cta}>
          <a href="#events" className={styles.primary}>
            See our next event &amp; RSVP
          </a>
          {!user && (
            <Link to="/login" className={styles.secondary}>
              Log in to RSVP
            </Link>
          )}
        </div>
      </div>
    </section>
  );
}
