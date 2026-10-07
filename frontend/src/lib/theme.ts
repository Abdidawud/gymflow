import { useCallback, useEffect, useSyncExternalStore } from "react";
import { THEME_STORAGE_KEY } from "./theme-script";

export type ThemePreference = "light" | "dark" | "system";
const CHANGE_EVENT = "gymflow-theme-change";

function readPreference(): ThemePreference {
  try {
    const value = window.localStorage.getItem(THEME_STORAGE_KEY);
    return value === "light" || value === "dark" ? value : "system";
  } catch {
    return "system";
  }
}

function systemPrefersDark(): boolean {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function apply(preference: ThemePreference) {
  const dark = preference === "dark" || (preference === "system" && systemPrefersDark());
  const root = document.documentElement;
  root.classList.toggle("dark", dark);
  root.style.colorScheme = dark ? "dark" : "light";
}

function subscribe(onChange: () => void) {
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGE_EVENT, onChange);
  media.addEventListener("change", onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
    media.removeEventListener("change", onChange);
  };
}

export function setThemePreference(preference: ThemePreference) {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // Storage blocked: still apply for this page.
  }
  apply(preference);
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

/** Light / Dark / System preference plus the resolved theme. */
export function useTheme() {
  const snapshot = useSyncExternalStore(
    subscribe,
    () => `${readPreference()}|${systemPrefersDark() ? "dark" : "light"}`,
    () => "system|light",
  );
  const [preference, system] = snapshot.split("|") as [ThemePreference, "light" | "dark"];
  const resolved: "light" | "dark" = preference === "system" ? system : preference;

  // Keep <html> in sync when the OS theme changes while "System" is selected.
  useEffect(() => {
    apply(preference);
  }, [preference, system]);

  const setPreference = useCallback((next: ThemePreference) => setThemePreference(next), []);
  return { preference, resolved, setPreference };
}
