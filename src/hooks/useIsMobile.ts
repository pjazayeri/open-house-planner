import { useEffect, useState } from "react";

/** Matches the CSS breakpoint used throughout the app (`max-width: 767px`). */
export const MOBILE_QUERY = "(max-width: 767px)";

function matches(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia(MOBILE_QUERY).matches
    : false;
}

/** True on phone-width viewports; updates live on resize/rotation. */
export function useIsMobile(): boolean {
  const [mobile, setMobile] = useState<boolean>(matches);
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia(MOBILE_QUERY);
    const onChange = (e: MediaQueryListEvent) => setMobile(e.matches);
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, []);
  return mobile;
}
