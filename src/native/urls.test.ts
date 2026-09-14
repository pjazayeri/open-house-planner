import { describe, it, expect } from "vitest";
import { buildAuthDeepLink, tokenFromAuthUrl, isExternalLink } from "./urls";

describe("tokenFromAuthUrl", () => {
  it("round-trips a token through the deep link", () => {
    const token = "eyJhbGciOi.abc+def/ghi=";
    expect(tokenFromAuthUrl(buildAuthDeepLink(token))).toBe(token);
  });

  it("accepts the token in the hash as well as the query", () => {
    expect(tokenFromAuthUrl("openhouseplanner://auth#token=abc")).toBe("abc");
  });

  it("rejects other schemes, hosts, and empty tokens", () => {
    expect(tokenFromAuthUrl("https://auth?token=abc")).toBeNull();
    expect(tokenFromAuthUrl("openhouseplanner://other?token=abc")).toBeNull();
    expect(tokenFromAuthUrl("openhouseplanner://auth?token=")).toBeNull();
    expect(tokenFromAuthUrl("not a url")).toBeNull();
  });
});

describe("isExternalLink", () => {
  const origin = "capacitor://localhost";
  it("treats target=_blank http links as external", () => {
    expect(isExternalLink("https://www.redfin.com/x", "_blank", origin)).toBe(true);
  });
  it("treats cross-origin links as external even without target", () => {
    expect(isExternalLink("https://open-house-planner.vercel.app/#share?bin=1", null, origin)).toBe(true);
  });
  it("leaves same-origin and non-http links alone", () => {
    expect(isExternalLink("capacitor://localhost/#planner", null, origin)).toBe(false);
    expect(isExternalLink("mailto:a@b.c", "_blank", origin)).toBe(false);
    expect(isExternalLink("#planner", null, origin)).toBe(false);
  });
});
