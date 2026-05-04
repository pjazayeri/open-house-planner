import { useState, useEffect } from "react";
import {
  onAuthStateChanged,
  signInWithPopup,
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
    await signInWithPopup(auth, googleProvider);
    // onAuthStateChanged handles the rest
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
