// TEMPORARY spike — delete after running. Resolves the one open question in
// the "free open-house data source" research: does Redfin's regional gis-csv
// endpoint work from a Vercel datacenter IP, or does CloudFront/Redfin bot-block
// it? (Our thumbnail scraper only proves it works from a residential IP.)
//
// No secrets, no user input — fetches a single hardcoded SF URL and reports the
// status. Safe to expose; removed with a normal commit (no history rewrite).
import type { IncomingMessage, ServerResponse } from "node:http";

const REDFIN_URL =
  "https://www.redfin.com/stingray/api/gis-csv?al=1&market=sanfrancisco&num_homes=350&ord=redfin-recommended-asc&page_number=1&region_id=17151&region_type=6&sf=1,2,3,5,6,7&status=9&uipt=1,2,3,4,5,6,7,8&v=8";

export default async function handler(_req: IncomingMessage, res: ServerResponse) {
  const started = Date.now();
  try {
    const r = await fetch(REDFIN_URL, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        Accept: "text/csv,*/*",
      },
    });
    const body = await r.text();
    const lines = body.split("\n").filter(Boolean);
    const header = lines[0] ?? "";
    const ohIdx = header.split(",").findIndex((c) => c.toUpperCase().includes("OPEN HOUSE START"));
    let withOH = 0;
    if (ohIdx >= 0) {
      for (const line of lines.slice(1)) {
        // naive split is fine for a yes/no row count
        const cell = line.split(",")[ohIdx] ?? "";
        if (cell.trim()) withOH++;
      }
    }
    const looksLikeCsv = header.toUpperCase().includes("ADDRESS");
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify(
        {
          verdict: r.status === 200 && looksLikeCsv ? "WORKS_FROM_VERCEL" : "BLOCKED_OR_UNEXPECTED",
          httpStatus: r.status,
          contentType: r.headers.get("content-type"),
          bytes: body.length,
          looksLikeCsv,
          rows: Math.max(lines.length - 1, 0),
          rowsWithOpenHouse: withOH,
          cfPop: r.headers.get("x-amz-cf-pop"),
          server: r.headers.get("server"),
          bodyHead: looksLikeCsv ? undefined : body.slice(0, 300),
          ms: Date.now() - started,
        },
        null,
        2
      )
    );
  } catch (e) {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ verdict: "FETCH_THREW", error: String(e), ms: Date.now() - started }, null, 2));
  }
}
