import { Capacitor } from "@capacitor/core";

/**
 * Where `/api/*` requests go.
 *
 * - Web (Vercel): relative URLs — same origin as the page.
 * - Native iOS shell (Capacitor): the web bundle is served from
 *   `capacitor://localhost`, so every API call must be absolute and point at
 *   the production deployment. `VITE_API_BASE` overrides the default.
 */
export const PRODUCTION_ORIGIN = "https://open-house-planner.vercel.app";

function resolveBase(): string {
  const fromEnv = (import.meta.env?.VITE_API_BASE as string | undefined)?.trim();
  if (fromEnv) return fromEnv.replace(/\/+$/, "");
  return Capacitor.isNativePlatform() ? PRODUCTION_ORIGIN : "";
}

export const API_BASE: string = resolveBase();

/** Prefix a site-relative path with the API base. Absolute URLs pass through. */
export function apiUrl(path: string, base: string = API_BASE): string {
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(path)) return path;
  return base + (path.startsWith("/") ? path : `/${path}`);
}

/** Origin to put in user-facing links (share URLs). Never `capacitor://`. */
export function publicOrigin(): string {
  return API_BASE || window.location.origin;
}
