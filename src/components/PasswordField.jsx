import { useState } from "react";
import styles from "./PasswordField.module.css";

// Reusable password input with a Show/Hide toggle. Used on Login,
// Forgot Password, and Reset Password.
export default function PasswordField({ id, value, onChange, autoComplete, minLength, required }) {
  const [visible, setVisible] = useState(false);

  return (
    <div className={styles.wrapper}>
      <input
        id={id}
        type={visible ? "text" : "password"}
        className={styles.input}
        value={value}
        onChange={onChange}
        autoComplete={autoComplete}
        minLength={minLength}
        required={required}
      />
      <button
        type="button"
        className={styles.toggleButton}
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Hide password" : "Show password"}
      >
        {visible ? "Hide" : "Show"}
      </button>
    </div>
  );
}