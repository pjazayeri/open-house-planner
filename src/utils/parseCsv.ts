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

export async function loadCsv(csvUrl?: string, authHeaders?: Record<string, string>): Promise<RawListing[]> {
  // 1. User's own CSV from cloud (served via /api/csv with auth headers)
  if (csvUrl) {
    try {
      const r = await fetch(csvUrl, authHeaders ? { headers: authHeaders } : undefined);
      if (r.ok) return parseCsvText(await r.text());
    } catch {
      // fall through
    }
  }

  // 2. Local dev only: fall back to bundled static CSV so the dev server works out of the box
  if (import.meta.env.DEV && typeof __LATEST_CSV__ !== "undefined" && __LATEST_CSV__) {
    try {
      const r = await fetch(`/${__LATEST_CSV__}`);
      if (r.ok) return parseCsvText(await r.text());
    } catch {
      // fall through
    }
  }

  // No CSV found — caller should show an upload prompt
  return [];
}

export async function uploadCsvText(text: string): Promise<RawListing[]> {
  return parseCsvText(text);
}
