import { App as CapApp } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { signInWithCustomToken, type Auth } from "firebase/auth";
import { API_BASE } from "../utils/apiBase";
import { NATIVE_LOGIN_HASH, tokenFromAuthUrl } from "./urls";

/**
 * Google sign-in for the native shell.
 *
 * Google blocks OAuth inside embedded web views, so instead of running the
 * Firebase popup/redirect flow in the WKWebView we:
 *   1. open the production site at `/#native-login` in an in-app Safari sheet
 *      (SFSafariViewController — a real browser context Google accepts),
 *   2. let the web app sign in normally, ask `POST /api/sync` for a
 *      Firebase custom token, and navigate to `openhouseplanner://auth?token=…`,
 *   3. catch that deep link here and finish with `signInWithCustomToken`.
 *
 * No Firebase console / GoogleService-Info.plist setup needed.
 */
export function nativeLoginUrl(): string {
  return `${API_BASE}/${NATIVE_LOGIN_HASH}`;
}

export async function signInViaWebHandoff(auth: Auth): Promise<void> {
  const token = await new Promise<string>((resolve, reject) => {
    let settled = false;
    const finish = () => {
      settled = true;
      void urlSub.then((h) => h.remove());
      void closedSub.then((h) => h.remove());
    };

    const urlSub = CapApp.addListener("appUrlOpen", ({ url }) => {
      const t = tokenFromAuthUrl(url);
      if (!t || settled) return;
      finish();
      void Browser.close().catch(() => {});
      resolve(t);
    });

    const closedSub = Browser.addListener("browserFinished", () => {
      // The user swiped the sheet away. Give an in-flight appUrlOpen a beat
      // to land before treating it as a cancel.
      setTimeout(() => {
        if (settled) return;
        finish();
        reject(Object.assign(new Error("Sign-in cancelled"), { code: "auth/popup-closed-by-user" }));
      }, 800);
    });

    void Browser.open({ url: nativeLoginUrl(), presentationStyle: "popover" }).catch((e) => {
      finish();
      reject(e);
    });
  });

  await signInWithCustomToken(auth, token);
}
