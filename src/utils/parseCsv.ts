import Papa from "papaparse";
import type { RawListing } from "../types";


function parseCsvText(text: string): Promise<RawListing[]> {
  return new Promise((resolve, reject) => {
    Papa.parse<RawListing>(text, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => resolve(results.data),
      error: (err: Error) => reject(err),
    });
  });
}

declare const __LATEST_CSV__: string;

export async function loadCsv(): Promise<RawListing[]> {
  // 1. Cloud Blob (latest uploaded CSV)
  try {
    const r = await fetch("/api/csv");
    if (r.ok) {
      const text = await r.text();
      return parseCsvText(text);
    }
  } catch {
    // fall through
  }

  // 2. Static public CSV bundled with the deploy
  if (typeof __LATEST_CSV__ !== "undefined" && __LATEST_CSV__) {
    try {
      const r = await fetch(`/${__LATEST_CSV__}`);
      if (r.ok) return parseCsvText(await r.text());
    } catch {
      // fall through
    }
  }

  return [];
}

export async function uploadCsvText(text: string): Promise<RawListing[]> {
  return parseCsvText(text);
}
