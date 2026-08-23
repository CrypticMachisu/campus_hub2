import styles from "./Footer.module.css";

export default function Footer() {
  return (
    <footer className={styles.footer}>
      <div className={`container ${styles.inner}`}>
        <p className={styles.text}>
          CampusHub — built by students, for students.
        </p>
      </div>
    </footer>
  );
}
