// Cross-device sync via JSONBin.io (free tier).
//
// Setup (one time):
//  1. Create a free account at https://jsonbin.io
//  2. API Keys → copy your Master Key
//  3. Bins → New Bin → paste {"hiddenIds":[]} → Create Bin
//  4. Copy the Bin ID from the bin's URL or details panel
//  5. Fill in both values below and push — all devices will sync automatically
//
// Leave both empty to fall back to localStorage (single-device only).
export const JSONBIN_API_KEY = "";
export const JSONBIN_BIN_ID = "";
