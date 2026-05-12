import { useEffect, useState, useCallback } from "react";

export type Theme = "dark" | "light";

const LS_KEY = "theme";

function safeGet(key: string): string | null {
  try {
    return window.localStorage?.getItem?.(key) ?? null;
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string): void {
  try {
    window.localStorage?.setItem?.(key, value);
  } catch {
    /* storage unavailable */
  }
}

function readInitialTheme(): Theme {
  if (typeof window === "undefined") return "dark";
  const stored = safeGet(LS_KEY);
  if (stored === "dark" || stored === "light") return stored;
  // Fall back to OS preference.
  if (window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches) {
    return "light";
  }
  return "dark";
}

/**
 * Single source of truth for the active theme. Writes `data-theme` on the
 * <html> element (consumed by `:root[data-theme="light"]` overrides in
 * src/index.css) and mirrors to localStorage so the choice survives refresh.
 *
 * Cloud persistence (cross-device sync) is a later subtask — for now this
 * is local to the browser.
 */
export function useTheme(): { theme: Theme; toggleTheme: () => void; setTheme: (t: Theme) => void } {
  const [theme, setThemeState] = useState<Theme>(readInitialTheme);

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.dataset.theme = theme;
    safeSet(LS_KEY, theme);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setThemeState((t) => (t === "dark" ? "light" : "dark"));
  }, []);

  return { theme, toggleTheme, setTheme: setThemeState };
}
