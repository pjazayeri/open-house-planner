import Papa from "papaparse";
import type { RawListing } from "../types";

const STORAGE_KEY = "redfin-csv";

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

  // 2. localStorage (previously uploaded via file picker)
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) return parseCsvText(stored);

  return [];
}

export async function uploadCsvText(text: string): Promise<RawListing[]> {
  localStorage.setItem(STORAGE_KEY, text);
  return parseCsvText(text);
}
