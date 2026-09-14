import { NATIVE_LOGIN_HASH } from "./urls";

// Session flag for the native sign-in handoff (see NativeLoginHandoff.tsx).
// Set at import time — before React mounts — so it survives App.tsx rewriting
// the hash and the Firebase redirect round-trip.
const FLAG = "native-login";

export function markNativeLoginHandoffFromHash(): void {
  try {
    if (typeof window !== "undefined" && window.location.hash.startsWith(NATIVE_LOGIN_HASH)) {
      sessionStorage.setItem(FLAG, "1");
    }
  } catch {
    /* sessionStorage unavailable */
  }
}

/** True when this page was opened by the native app to perform sign-in. */
export function isNativeLoginHandoff(): boolean {
  try {
    return sessionStorage.getItem(FLAG) === "1";
  } catch {
    return false;
  }
}

export function clearNativeLoginHandoff(): void {
  try {
    sessionStorage.removeItem(FLAG);
  } catch {
    /* ignore */
  }
}

markNativeLoginHandoffFromHash();
