// Cross-device sync via JSONBin.io (free tier).
//
// Credentials are injected at build time from environment variables — never
// hardcoded here. See setup instructions in CLAUDE.md.
//
// Local dev:  add VITE_JSONBIN_API_KEY and VITE_JSONBIN_BIN_ID to .env.local
// Production: set as GitHub repository secrets (already configured)
export const JSONBIN_API_KEY = import.meta.env.VITE_JSONBIN_API_KEY ?? "";
export const JSONBIN_BIN_ID = import.meta.env.VITE_JSONBIN_BIN_ID ?? "";
