import { useState, useEffect } from "react";
import {
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signOut as firebaseSignOut,
  type User,
} from "firebase/auth";
import { auth, googleProvider } from "../lib/firebase";
import { setAuthContext, setGuestMode, clearAuthContext } from "../utils/cloudSync";

export type AuthMode = "loading" | "signed-in" | "guest" | "demo" | "signed-out";

/** True when the app should run fully in-memory with no cloud reads/writes:
 *  guest mode AND demo mode behave identically from the cloud's perspective. */
export function isLocalOnly(mode: AuthMode): boolean {
  return mode === "guest" || mode === "demo";
}

interface AuthResult {
  user: User | null;
  mode: AuthMode;
  signInWithGoogle: () => Promise<void>;
  continueAsGuest: () => void;
  continueAsDemo: () => void;
  signOut: () => Promise<void>;
}

export function useAuth(): AuthResult {
  const [user, setUser] = useState<User | null>(null);
  const [mode, setMode] = useState<AuthMode>("loading");

  useEffect(() => {
    // Handle the result from signInWithRedirect (mobile fallback).
    // Must be called before onAuthStateChanged so the user state is set correctly.
    getRedirectResult(auth).catch((e: unknown) => {
      const code = (e as { code?: string }).code;
      // Ignore "missing state" errors from a previous abandoned redirect attempt
      if (code !== "auth/missing-or-invalid-nonce" && code !== "auth/cancelled-popup-request") {
        console.error("[useAuth] getRedirectResult error:", e);
      }
    });

    return onAuthStateChanged(auth, async (u) => {
      if (u) {
        // Clear guest mode — user is now authenticated
        sessionStorage.removeItem("guest-mode");
        try {
          const token = await u.getIdToken();

          // Fast path: returning users have their binId cached in localStorage.
          // Skip /api/user entirely and unblock the UI immediately.
          const cacheKey = "auth-bin-cache";
          const cached = localStorage.getItem(cacheKey);
          let binId = "";
          if (cached) {
            try {
              const { uid, binId: cachedBinId } = JSON.parse(cached) as { uid: string; binId: string };
              if (uid === u.uid && cachedBinId) binId = cachedBinId;
            } catch { /* ignore bad cache */ }
          }

          if (binId) {
            // Cache hit — set auth context immediately so the app loads without waiting
            setAuthContext(() => u.getIdToken(), binId);
            // Refresh cache in background (catches bin reassignments, no await)
            fetch("/api/user", { headers: { Authorization: `Bearer ${token}` } })
              .then(r => r.ok ? r.json() : null)
              .then((data: { binId: string } | null) => {
                if (data?.binId) localStorage.setItem(cacheKey, JSON.stringify({ uid: u.uid, binId: data.binId }));
              })
              .catch(() => {});
          } else {
            // First login (or cache miss) — must fetch binId before proceeding
            const res = await fetch("/api/user", { headers: { Authorization: `Bearer ${token}` } });
            if (res.ok) {
              const data = (await res.json()) as { binId: string };
              binId = data.binId;
              localStorage.setItem(cacheKey, JSON.stringify({ uid: u.uid, binId }));
              setAuthContext(() => u.getIdToken(), binId);
            } else {
              setAuthContext(() => u.getIdToken(), "");
            }
          }
        } catch {
          // Network error fetching binId — set token without binId so cloudFetch
          // skips cleanly rather than firing an unauthenticated request.
          try { setAuthContext(() => u.getIdToken(), ""); } catch { /* token unavailable */ }
        }
        setUser(u);
        setMode("signed-in");
      } else if (sessionStorage.getItem("demo-mode")) {
        setGuestMode();
        setMode("demo");
      } else if (sessionStorage.getItem("guest-mode")) {
        setGuestMode();
        setMode("guest");
      } else {
        setMode("signed-out");
      }
    });
  }, []);

  const signInWithGoogle = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
      // onAuthStateChanged handles the rest
    } catch (e: unknown) {
      const code = (e as { code?: string }).code;
      if (code === "auth/popup-blocked") {
        // Mobile browsers often block popups — fall back to redirect flow
        await signInWithRedirect(auth, googleProvider);
        return;
      }
      throw e;
    }
  };

  const continueAsGuest = () => {
    sessionStorage.removeItem("demo-mode");
    sessionStorage.setItem("guest-mode", "1");
    setGuestMode();
    setMode("guest");
  };

  const continueAsDemo = () => {
    sessionStorage.removeItem("guest-mode");
    sessionStorage.setItem("demo-mode", "1");
    setGuestMode(); // same in-memory behavior as guest
    setMode("demo");
  };

  const signOut = async () => {
    if (auth.currentUser) {
      await firebaseSignOut(auth);
    }
    sessionStorage.removeItem("guest-mode");
    sessionStorage.removeItem("demo-mode");
    localStorage.removeItem("auth-bin-cache");
    clearAuthContext();
    setUser(null);
    setMode("signed-out");
  };

  return { user, mode, signInWithGoogle, continueAsGuest, continueAsDemo, signOut };
}
