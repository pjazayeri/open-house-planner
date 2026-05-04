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

export type AuthMode = "loading" | "signed-in" | "guest" | "signed-out";

interface AuthResult {
  user: User | null;
  mode: AuthMode;
  signInWithGoogle: () => Promise<void>;
  continueAsGuest: () => void;
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
          const res = await fetch("/api/user", {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (res.ok) {
            const data = (await res.json()) as { binId: string };
            setAuthContext(() => u.getIdToken(), data.binId);
          } else {
            // /api/user not configured — auth without per-user bin
            setAuthContext(() => u.getIdToken(), "");
          }
        } catch {
          // Network error or not configured; app still works (falls back to env bin)
        }
        setUser(u);
        setMode("signed-in");
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
    sessionStorage.setItem("guest-mode", "1");
    setGuestMode();
    setMode("guest");
  };

  const signOut = async () => {
    if (auth.currentUser) {
      await firebaseSignOut(auth);
    }
    sessionStorage.removeItem("guest-mode");
    clearAuthContext();
    setUser(null);
    setMode("signed-out");
  };

  return { user, mode, signInWithGoogle, continueAsGuest, signOut };
}
