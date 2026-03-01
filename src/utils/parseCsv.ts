import Papa from "papaparse";
import type { RawListing } from "../types";

const CSV_PATH = `${import.meta.env.BASE_URL}redfin-favorites_2026-03-01-07-44-38.csv`;

export async function loadCsv(): Promise<RawListing[]> {
  const response = await fetch(CSV_PATH);
  const text = await response.text();

  return new Promise((resolve, reject) => {
    Papa.parse<RawListing>(text, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => resolve(results.data),
      error: (err: Error) => reject(err),
    });
  });
}
