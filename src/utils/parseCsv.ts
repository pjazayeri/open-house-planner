import Papa from "papaparse";
import type { RawListing } from "../types";

const CSV_PATH = `${import.meta.env.BASE_URL}redfin-favorites_2026-03-08-12-25-26.csv`;
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
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) return parseCsvText(stored);

  const response = await fetch(CSV_PATH);
  const text = await response.text();
  return parseCsvText(text);
}

export async function uploadCsvText(text: string): Promise<RawListing[]> {
  localStorage.setItem(STORAGE_KEY, text);
  return parseCsvText(text);
}
