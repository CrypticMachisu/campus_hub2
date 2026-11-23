import { createContext, useCallback, useContext, useEffect, useState } from "react";

const STORAGE_KEY = "campushub_theme";
const ThemeContext = createContext(null);

function systemTheme() {
  if (typeof window === "undefined" || !window.matchMedia) return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function storedTheme() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "light" || stored === "dark") return stored;
  } catch {
    // Storage can be unavailable in private mode; use the system preference.
  }
  return null;
}

function initialTheme() {
  if (typeof document !== "undefined" && document.documentElement.dataset.theme) {
    return document.documentElement.dataset.theme;
  }
  return storedTheme() || systemTheme();
}

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(initialTheme);
  // Until someone uses the toggle, the OS preference stays live. A saved
  // choice wins; we do not overwrite it just because the app mounted.
  const [followSystem, setFollowSystem] = useState(() => !storedTheme());

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    if (followSystem) {
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {
        // The visual preference still applies for this session.
      }
      return;
    }
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // The visual preference still applies for this session.
    }
  }, [theme, followSystem]);

  useEffect(() => {
    if (!followSystem || typeof window === "undefined" || !window.matchMedia) return;
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    function handleChange(event) {
      setTheme(event.matches ? "dark" : "light");
    }
    query.addEventListener("change", handleChange);
    return () => query.removeEventListener("change", handleChange);
  }, [followSystem]);

  const toggleTheme = useCallback(() => {
    setFollowSystem(false);
    setTheme((current) => (current === "dark" ? "light" : "dark"));
  }, []);

  const followSystemTheme = useCallback(() => {
    setFollowSystem(true);
    setTheme(systemTheme());
  }, []);

  return (
    <ThemeContext.Provider
      value={{ theme, setTheme, toggleTheme, followSystem, followSystemTheme }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used within a ThemeProvider");
  return context;
}
