import { next } from "@vercel/functions";

/**
 * CORS preflight for the native iOS app.
 *
 * The Capacitor shell serves the web bundle from `capacitor://localhost`, so
 * its `/api/*` calls are cross-origin. Browsers send an OPTIONS preflight for
 * requests carrying `Authorization` / JSON bodies; the API functions don't
 * handle OPTIONS, so answer it here. The CORS headers on the real responses
 * come from the `headers` block in vercel.json.
 */
const ALLOWED_ORIGINS = new Set(["capacitor://localhost", "ionic://localhost", "http://localhost"]);

export default function middleware(request: Request) {
  if (request.method === "OPTIONS") {
    const origin = request.headers.get("origin") ?? "";
    if (ALLOWED_ORIGINS.has(origin)) {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": origin,
          "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
          "Access-Control-Allow-Headers": "Authorization, Content-Type",
          "Access-Control-Max-Age": "86400",
          Vary: "Origin",
        },
      });
    }
  }
  return next();
}

export const config = { matcher: "/api/:path*" };
