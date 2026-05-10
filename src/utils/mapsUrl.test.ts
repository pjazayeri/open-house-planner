// @vitest-environment happy-dom
import { describe, it, expect, vi } from "vitest";
import { navigationUrl } from "./mapsUrl";

describe("navigationUrl (regression: address must open Apple Maps on iOS)", () => {
  it("uses lat/lng as the destination on iOS (Apple Maps ignores daddr=<address> when ll is also present)", () => {
    vi.stubGlobal("navigator", { userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari/604.1" });
    const url = navigationUrl(37.7929, -122.4359, "100 Main St", "San Francisco");
    expect(url).toMatch(/^https:\/\/maps\.apple\.com\//);
    expect(url).toContain("daddr=37.7929,-122.4359");
    // Address label as `q` so Apple Maps shows the human-readable name on the pin.
    expect(url).toContain("q=100%20Main%20St%2C%20San%20Francisco");
    vi.unstubAllGlobals();
  });

  it("uses lat/lng as destination on desktop / non-iOS (Google Maps)", () => {
    vi.stubGlobal("navigator", { userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/120 Safari/537" });
    const url = navigationUrl(37.7929, -122.4359, "100 Main St", "San Francisco");
    expect(url).toMatch(/^https:\/\/www\.google\.com\/maps\/dir/);
    expect(url).toContain("destination=37.7929,-122.4359");
    vi.unstubAllGlobals();
  });

  it("URL-encodes special characters in the address label", () => {
    vi.stubGlobal("navigator", { userAgent: "iPhone" });
    const url = navigationUrl(0, 0, "200 Oak Ave #4B", "Foo & Bar");
    expect(url).toContain(encodeURIComponent("200 Oak Ave #4B, Foo & Bar"));
    vi.unstubAllGlobals();
  });
});
