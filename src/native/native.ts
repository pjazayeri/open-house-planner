import { Capacitor } from "@capacitor/core";
import { App as CapApp } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { StatusBar, Style } from "@capacitor/status-bar";
import { SplashScreen } from "@capacitor/splash-screen";
import { isExternalLink } from "./urls";

/** True when running inside the Capacitor iOS/Android shell. */
export const isNative: boolean = Capacitor.isNativePlatform();

/** Open a URL outside the app shell: in-app Safari sheet on native, new tab on web. */
export async function openExternal(url: string): Promise<void> {
  if (!isNative) {
    window.open(url, "_blank", "noopener,noreferrer");
    return;
  }
  await Browser.open({ url, presentationStyle: "popover" });
}

/** Keep the iOS status bar text readable against the current theme. */
export async function applyNativeTheme(theme: "dark" | "light"): Promise<void> {
  if (!isNative) return;
  try {
    await StatusBar.setStyle({ style: theme === "dark" ? Style.Dark : Style.Light });
  } catch {
    /* status bar plugin unavailable (e.g. tests) */
  }
}

/**
 * One-time native bootstrap, called from main.tsx before React mounts.
 * - Tags <html> with `native` / `native-ios` so CSS can add safe-area padding.
 * - Routes external links through the in-app browser instead of kicking the
 *   user out to Safari (Capacitor's default for target=_blank).
 * - Wires the Android back button to hash history.
 * - Hides the splash screen once the bundle has loaded.
 */
export function initNative(): void {
  if (!isNative) return;
  const root = document.documentElement;
  root.classList.add("native", `native-${Capacitor.getPlatform()}`);

  document.addEventListener(
    "click",
    (e) => {
      const target = e.target as HTMLElement | null;
      const anchor = target?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!anchor) return;
      if (!isExternalLink(anchor.href, anchor.getAttribute("target"), window.location.origin)) return;
      e.preventDefault();
      void openExternal(anchor.href);
    },
    true
  );

  void CapApp.addListener("backButton", ({ canGoBack }) => {
    if (canGoBack) window.history.back();
    else void CapApp.exitApp();
  });

  void SplashScreen.hide();
}
