import type { IncomingMessage, ServerResponse } from "node:http";
import { put } from "@vercel/blob";

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (req.method !== "POST") {
    res.writeHead(405);
    res.end("Method not allowed");
    return;
  }

  const html = await new Promise<string>((resolve, reject) => {
    let data = "";
    req.on("data", (chunk: Buffer) => { data += chunk.toString(); });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });

  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  const blob = await put(`plans/${id}.html`, html, {
    access: "public",
    contentType: "text/html; charset=utf-8",
    addRandomSuffix: false,
  });

  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ url: blob.url }));
}
