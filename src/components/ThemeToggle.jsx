import { useTheme } from "../context/ThemeContext";
import styles from "./ThemeToggle.module.css";

export default function ThemeToggle({ className = "" }) {
  const { theme, toggleTheme, followSystem, followSystemTheme } = useTheme();
  const dark = theme === "dark";

  return (
    <span className={`${styles.group} ${className}`.trim()}>
      <button
        type="button"
        className={styles.toggle}
        aria-pressed={dark}
        aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
        title={dark ? "Switch to light mode" : "Switch to dark mode"}
        onClick={toggleTheme}
      >
        <span aria-hidden="true">{dark ? "☀" : "◐"}</span>
        <span>{dark ? "Light" : "Dark"}</span>
      </button>
      {!followSystem && (
        <button
          type="button"
          className={styles.reset}
          aria-label="Follow system theme"
          title="Follow system theme"
          onClick={followSystemTheme}
        >
          <span aria-hidden="true">↺</span>
        </button>
      )}
    </span>
  );
}
