import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

export type ThemePreference = "light" | "dark" | "system";
export function validPreference(value: unknown): value is ThemePreference {
  return value === "light" || value === "dark" || value === "system";
}
export function resolveTheme(preference: ThemePreference, systemDark: boolean) {
  return preference === "dark" || (preference === "system" && systemDark)
    ? "paper-dark"
    : "paper-light";
}

const ThemeContext = createContext<{
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
} | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>(() => {
    if (typeof window === "undefined") return "system";
    try {
      const stored = window.localStorage.getItem("ieum.theme");
      return validPreference(stored) ? stored : "system";
    } catch {
      return "system";
    }
  });
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => {
      document.documentElement.dataset.ieumTheme = resolveTheme(
        preference,
        media.matches,
      );
    };
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [preference]);
  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (event.key !== "ieum.theme") return;
      setPreferenceState(
        validPreference(event.newValue) ? event.newValue : "system",
      );
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);
  const setPreference = (next: ThemePreference) => {
    setPreferenceState(next);
    try {
      window.localStorage.setItem("ieum.theme", next);
    } catch {
      // The selected theme remains usable when device storage is blocked.
    }
  };
  return (
    <ThemeContext.Provider value={{ preference, setPreference }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const value = useContext(ThemeContext);
  if (!value) throw new Error("ThemeProvider is required");
  return value;
}
