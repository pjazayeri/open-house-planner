// @vitest-environment happy-dom
import { describe, it, expect, vi } from "vitest";
import { navigationUrl } from "./mapsUrl";

describe("navigationUrl (regression: address must open Apple Maps on iOS)", () => {
  it("returns an Apple Maps universal link on iOS", () => {
    vi.stubGlobal("navigator", { userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari/604.1" });
    const url = navigationUrl(37.7929, -122.4359, "100 Main St", "San Francisco");
    expect(url).toMatch(/^https:\/\/maps\.apple\.com\//);
    expect(url).toContain("daddr=100%20Main%20St");
    expect(url).toContain("ll=37.7929,-122.4359");
    vi.unstubAllGlobals();
  });

  it("returns a Google Maps URL on desktop / non-iOS", () => {
    vi.stubGlobal("navigator", { userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/120 Safari/537" });
    const url = navigationUrl(37.7929, -122.4359, "100 Main St", "San Francisco");
    expect(url).toMatch(/^https:\/\/www\.google\.com\/maps\/dir/);
    expect(url).toContain("destination=100%20Main%20St");
    vi.unstubAllGlobals();
  });

  it("URL-encodes special characters in the address", () => {
    vi.stubGlobal("navigator", { userAgent: "X" });
    const url = navigationUrl(0, 0, "200 Oak Ave #4B", "Foo & Bar");
    expect(url).toContain(encodeURIComponent("200 Oak Ave #4B, Foo & Bar"));
    vi.unstubAllGlobals();
  });
});
