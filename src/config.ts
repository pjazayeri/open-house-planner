// Injected at build time by vite.config.ts using raw fs (no dotenv-expand),
// so $ characters in values are never mangled.
declare const __JSONBIN_API_KEY__: string;
declare const __JSONBIN_BIN_ID__: string;

export const JSONBIN_API_KEY: string = __JSONBIN_API_KEY__;
export const JSONBIN_BIN_ID: string = __JSONBIN_BIN_ID__;
