#!/usr/bin/env bash
#
# Build the web bundle, sync it into the Capacitor iOS project, archive, and
# upload to TestFlight — one shot, no Xcode GUI.
#
# Prereqs (one-time, all already true on this Mac):
#   * Xcode + command line tools.
#   * App Store Connect API key on disk:  ~/.appstoreconnect/private_keys/AuthKey_<KEYID>.p8
#   * ~/.appstoreconnect/asc-api.env with ASC_API_KEY_ID / ASC_API_ISSUER_ID / ASC_API_KEY_PATH
#     (non-secret identifiers; the .p8 is the secret). Sourced below, never printed.
#   * .env.local pulled from Vercel (`vercel env pull .env.local`) so the Vite
#     build can read the VITE_FIREBASE_* client config.
#   * An app record for the bundle ID in App Store Connect (My Apps → + → New App).
#     Without it the upload fails with "Error Downloading App Information".
#
# Signing is fully automatic: `-allowProvisioningUpdates` with the API key lets
# xcodebuild register the bundle ID, create an Apple Distribution certificate and
# an App Store provisioning profile on the fly.
#
# Usage:
#   scripts/ios-testflight.sh                # build + archive + upload
#   scripts/ios-testflight.sh --archive-only # skip the upload (offline iteration)
#   scripts/ios-testflight.sh --skip-web     # reuse the current dist/ (native-only change)
#   scripts/ios-testflight.sh --upload-only  # re-export + upload the most recent archive (no rebuild)
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TEAM_ID="K4M9VUR5D5"
SCHEME="App"
PROJECT="$ROOT/ios/App/App.xcodeproj"

ARCHIVE_ONLY=0
SKIP_WEB=0
UPLOAD_ONLY=0
for arg in "$@"; do
  case "$arg" in
    --archive-only) ARCHIVE_ONLY=1;;
    --skip-web)     SKIP_WEB=1;;
    --upload-only)  UPLOAD_ONLY=1;;
    -h|--help)      sed -n '2,27p' "$0"; exit 0;;
    *) echo "unknown arg: $arg" >&2; exit 1;;
  esac
done

# --- App Store Connect API identifiers (never echoed) ---
ASC_ENV="$HOME/.appstoreconnect/asc-api.env"
if [ -f "$ASC_ENV" ]; then
  set -a; . "$ASC_ENV"; set +a
fi
: "${ASC_API_KEY_ID:?need ASC_API_KEY_ID (see header)}"
: "${ASC_API_ISSUER_ID:?need ASC_API_ISSUER_ID (see header)}"
KEY_PATH="${ASC_API_KEY_PATH:-$HOME/.appstoreconnect/private_keys/AuthKey_${ASC_API_KEY_ID}.p8}"
KEY_PATH="${KEY_PATH/#\~/$HOME}"
[ -f "$KEY_PATH" ] || { echo "API key not found at $KEY_PATH" >&2; exit 1; }

AUTH_FLAGS=(-allowProvisioningUpdates
            -authenticationKeyPath "$KEY_PATH"
            -authenticationKeyID "$ASC_API_KEY_ID"
            -authenticationKeyIssuerID "$ASC_API_ISSUER_ID")

cd "$ROOT"
set -o pipefail

if [ "$UPLOAD_ONLY" -eq 1 ]; then
  OUT="$(ls -td "$ROOT"/build/testflight/*/ 2>/dev/null | head -1)"
  OUT="${OUT%/}"
  [ -n "$OUT" ] && [ -d "$OUT/OpenHouse.xcarchive" ] || { echo "no previous archive under build/testflight/" >&2; exit 1; }
  ARCHIVE="$OUT/OpenHouse.xcarchive"
  BUILD_NUMBER="$(cat "$ROOT/build/testflight/last-build-number" 2>/dev/null || echo '?')"
  echo "▶ reusing archive $ARCHIVE (build $BUILD_NUMBER)"
else
  # --- 1. web bundle → ios/App/App/public ---
  if [ "$SKIP_WEB" -eq 0 ]; then
    echo "▶ building web bundle"
    npm run build:ios
  fi
  echo "▶ cap sync ios"
  npx cap sync ios

  # --- 2. archive ---
  BUILD_NUMBER="$(date +%s)"            # epoch → monotonically increasing, matches the life-apps pipeline
  MARKETING_VERSION="$(node -p "require('./package.json').version" | sed 's/^0\.0\.0$/1.0.0/')"
  OUT="$ROOT/build/testflight/$(date +%Y%m%d-%H%M%S)"
  mkdir -p "$OUT"
  ARCHIVE="$OUT/OpenHouse.xcarchive"

  echo "▶ archiving  (version $MARKETING_VERSION, build $BUILD_NUMBER)"
  xcodebuild \
    -project "$PROJECT" -scheme "$SCHEME" \
    -configuration Release \
    -destination 'generic/platform=iOS' \
    -archivePath "$ARCHIVE" \
    "${AUTH_FLAGS[@]}" \
    DEVELOPMENT_TEAM="$TEAM_ID" \
    CURRENT_PROJECT_VERSION="$BUILD_NUMBER" \
    MARKETING_VERSION="$MARKETING_VERSION" \
    archive 2>&1 | tee "$OUT/archive.log" | grep -E "error:|warning: .*signing|\*\* ARCHIVE" || true
  grep -q "ARCHIVE SUCCEEDED" "$OUT/archive.log" || { echo "archive failed — see $OUT/archive.log" >&2; exit 1; }
  echo "$BUILD_NUMBER" > "$ROOT/build/testflight/last-build-number"
fi

# --- 3. export (+ upload) ---
DEST="upload"; [ "$ARCHIVE_ONLY" -eq 1 ] && DEST="export"
cat > "$OUT/ExportOptions.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>method</key><string>app-store-connect</string>
    <key>destination</key><string>$DEST</string>
    <key>signingStyle</key><string>automatic</string>
    <key>teamID</key><string>$TEAM_ID</string>
    <key>uploadSymbols</key><true/>
    <key>manageAppVersionAndBuildNumber</key><false/>
</dict>
</plist>
PLIST

EXPORT_DIR="$OUT/export-$(date +%H%M%S)"
echo "▶ export ($DEST)"
xcodebuild -exportArchive \
  -archivePath "$ARCHIVE" \
  -exportPath "$EXPORT_DIR" \
  -exportOptionsPlist "$OUT/ExportOptions.plist" \
  "${AUTH_FLAGS[@]}" 2>&1 | tee "$OUT/export.log" | grep -E "error:|Upload|EXPORT" || true
grep -q "EXPORT SUCCEEDED" "$OUT/export.log" || { echo "export/upload failed — see $OUT/export.log" >&2; exit 1; }

if [ "$ARCHIVE_ONLY" -eq 1 ]; then
  echo "✓ archived + exported to $EXPORT_DIR (upload skipped)"
else
  echo "✓ build $BUILD_NUMBER uploaded. TestFlight processing usually takes 5–15 min;"
  echo "  then it appears under the app's Internal Testing group in the TestFlight app."
fi
