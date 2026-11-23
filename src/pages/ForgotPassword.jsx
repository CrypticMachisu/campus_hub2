import { Link } from "react-router-dom";
import { usePageMetadata } from "../hooks/usePageMetadata";
import styles from "./Login.module.css";

export default function ForgotPassword() {
  usePageMetadata({
    title: "Reset your password",
    description: "Get help resetting your Kesho password.",
  });

  return (
    <div className={`container ${styles.wrap}`}>
      <h1>Reset your password</h1>
      <p className={styles.blurb}>
        Password reset isn&apos;t available yet. Contact your campus administrator for help getting
        back into your account.
      </p>
      <p className={styles.blurb}>
        If you already have a reset link, you can{" "}
        <Link to="/reset-password">set a new password</Link>.
      </p>
      <p className={styles.blurb}>
        <Link to="/login">Back to log in</Link>
      </p>
    </div>
  );
}
