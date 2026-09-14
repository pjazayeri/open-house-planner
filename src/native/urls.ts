// Pure URL helpers for the native shell. No Capacitor imports so they are
// trivially unit-testable.

/** Custom URL scheme registered in ios/App/App/Info.plist (CFBundleURLTypes). */
export const AUTH_SCHEME = "openhouseplanner";

/** Hash the web app watches for to run the sign-in handoff (see App.tsx). */
export const NATIVE_LOGIN_HASH = "#native-login";

/** Build the deep link the web page navigates to once it has a custom token. */
export function buildAuthDeepLink(token: string): string {
  return `${AUTH_SCHEME}://auth?token=${encodeURIComponent(token)}`;
}

/** Extract the custom token from an `openhouseplanner://auth?token=…` URL. */
export function tokenFromAuthUrl(url: string): string | null {
  const m = /^([a-z][a-z0-9+.-]*):\/\/([^/?#]*)([^?#]*)(\?[^#]*)?(#.*)?$/i.exec(url.trim());
  if (!m) return null;
  const [, scheme, host, , search = "", hash = ""] = m;
  if (scheme.toLowerCase() !== AUTH_SCHEME || host.toLowerCase() !== "auth") return null;
  const token =
    new URLSearchParams(search).get("token") ?? new URLSearchParams(hash.slice(1)).get("token");
  return token && token.length > 0 ? token : null;
}

/**
 * Should a clicked anchor leave the app shell (open in the in-app browser)?
 * Anything with target=_blank, or pointing at another origin, does.
 */
export function isExternalLink(href: string, target: string | null, currentOrigin: string): boolean {
  if (!/^https?:\/\//i.test(href)) return false;
  if (target === "_blank") return true;
  try {
    return new URL(href).origin !== currentOrigin;
  } catch {
    return false;
  }
}
