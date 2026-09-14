import type { CapacitorConfig } from "@capacitor/cli";

// Native iOS shell for the Open House Planner web app. By default the shell
// loads the production site (see `server` below); API calls resolve via
// src/utils/apiBase.ts. Build + ship: scripts/ios-testflight.sh
const config: CapacitorConfig = {
  appId: "com.jazayeri.lifeapps.openhouse",
  appName: "Open House",
  webDir: "dist",
  backgroundColor: "#0f172a",
  // Load the live production site instead of the bundled dist/. Every web
  // deploy (git push → Vercel) reaches the installed app on next launch, so
  // UI iteration never needs a new TestFlight build. dist/ is still bundled as
  // the fallback shell. Set CAP_BUNDLED=1 when building to ship offline assets.
  ...(process.env.CAP_BUNDLED
    ? {}
    : { server: { url: "https://open-house-planner.vercel.app", cleartext: false } }),
  ios: {
    contentInset: "never",
    preferredContentMode: "mobile",
    allowsLinkPreview: false,
    // Keep the two-finger zoom / text-size behaviour of a native app.
    limitsNavigationsToAppBoundDomains: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 600,
      launchAutoHide: true,
      launchFadeOutDuration: 250,
      backgroundColor: "#0f172a",
      showSpinner: false,
    },
    StatusBar: {
      style: "DARK",
      overlaysWebView: true,
    },
    Keyboard: {
      resize: "native",
      resizeOnFullScreen: true,
    },
  },
};

export default config;
