import { useEffect, useState, useCallback } from "react";
import { apiUrl } from "../../utils/apiBase";
import { getAuthHeaders } from "../../utils/cloudSync";
import { buildAuthDeepLink } from "../../native/urls";
import { clearNativeLoginHandoff } from "../../native/handoffFlag";
import "./AuthScreen.css";

/**
 * Shown (in the in-app Safari sheet) once the user is signed in: fetches a
 * Firebase custom token for this user and bounces to the app's URL scheme.
 */
export function NativeLoginHandoff() {
  const [state, setState] = useState<"working" | "ready" | "error">("working");
  const [link, setLink] = useState<string | null>(null);

  const run = useCallback(async () => {
    setState("working");
    try {
      const headers = await getAuthHeaders();
      // POST /api/sync mints a Firebase custom token for the caller's own uid.
      const r = await fetch(apiUrl("/api/sync"), { method: "POST", headers });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const { token } = (await r.json()) as { token: string };
      const deepLink = buildAuthDeepLink(token);
      setLink(deepLink);
      setState("ready");
      clearNativeLoginHandoff();
      window.location.href = deepLink;
    } catch (e) {
      console.error("[native-login] handoff failed:", e);
      setState("error");
    }
  }, []);

  useEffect(() => {
    void run();
  }, [run]);

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="auth-icon">&#127968;</div>
        <h1 className="auth-title">Signed in</h1>
        {state === "working" && <p className="auth-subtitle">Returning you to the app…</p>}
        {state === "ready" && (
          <>
            <p className="auth-subtitle">If the app didn't open automatically, tap below.</p>
            <div className="auth-actions">
              <a className="auth-btn auth-btn--google" href={link ?? "#"}>
                <span>Open the Open House app</span>
              </a>
            </div>
          </>
        )}
        {state === "error" && (
          <>
            <p className="auth-error">Couldn't hand your session to the app.</p>
            <div className="auth-actions">
              <button className="auth-btn auth-btn--guest" onClick={() => void run()}>
                <span className="auth-btn-main">Try again</span>
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
