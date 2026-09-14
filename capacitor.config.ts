import type { CapacitorConfig } from "@capacitor/cli";

// Native iOS shell for the Open House Planner web app. The web bundle (dist/)
// ships inside the app; API calls go to the production Vercel deployment
// (see src/utils/apiBase.ts). Build + ship: scripts/ios-testflight.sh
const config: CapacitorConfig = {
  appId: "com.jazayeri.lifeapps.openhouse",
  appName: "Open House",
  webDir: "dist",
  backgroundColor: "#0f172a",
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
