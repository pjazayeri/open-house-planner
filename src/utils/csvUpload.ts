/**
 * File-picker `accept` for Redfin CSV exports. iOS Safari saves the export to
 * Files as `.csv` but the Files picker matches on MIME types, and different
 * apps stamp CSVs differently — so list every common spelling.
 */
export const CSV_ACCEPT = ".csv,text/csv,text/comma-separated-values,application/csv,application/vnd.ms-excel";

/** iPhone/iPad (incl. iPadOS 13+ which reports as a Mac with touch). */
export function isIOSDevice(userAgent: string, maxTouchPoints = 0): boolean {
  if (/iPhone|iPad|iPod/i.test(userAgent)) return true;
  return /Macintosh/i.test(userAgent) && maxTouchPoints > 1;
}

/** Step-by-step instructions for getting the Redfin CSV onto this device. */
export function csvInstructions(ios: boolean): string[] {
  return ios
    ? [
        "In Safari, open Redfin → Favorites and tap Download all (CSV).",
        "Safari saves it to Files → Downloads (tap the ⬇ icon to see it).",
        "Come back here, tap Upload CSV and pick the file from Files.",
      ]
    : [
        "Open your Redfin favorites page and click Download all (CSV).",
        "Click Upload CSV and choose the downloaded file.",
      ];
}
