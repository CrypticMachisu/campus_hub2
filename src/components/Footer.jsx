import styles from "./Footer.module.css";

export default function Footer() {
  return (
    <footer className={styles.footer}>
      <div className={`container ${styles.inner}`}>
        <p className={styles.mark}>kesho</p>
        <p className={styles.text}>Show up tomorrow. Built by students, for students.</p>
      </div>
    </footer>
  );
}
