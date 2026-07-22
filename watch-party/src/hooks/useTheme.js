import { useState, useEffect, useCallback } from "react";

const STORAGE_KEY = "watchme_theme";

/**
 * useTheme — Dark/Light Cinema theme management.
 *
 * Persists to localStorage, sets `data-theme` on `<html>`.
 * Returns `{ theme, setTheme, toggleTheme }`.
 */
export default function useTheme() {
  const [theme, setThemeState] = useState(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === "light" || stored === "dark") return stored;
    } catch {
      // localStorage unavailable
    }
    // Default: dark
    return "dark";
  });

  // Sync data-theme attribute and localStorage
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // ignore
    }
  }, [theme]);

  const setTheme = useCallback((next) => {
    if (next === "light" || next === "dark") {
      setThemeState(next);
    }
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((prev) => (prev === "dark" ? "light" : "dark"));
  }, []);

  return { theme, setTheme, toggleTheme };
}
