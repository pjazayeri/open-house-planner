// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from "vitest";
import type { TimeSlotGroup, Listing } from "../types";
import { generatePlanHtml } from "./generatePlanHtml";

afterEach(() => vi.unstubAllGlobals());

const FAKE_BREAKDOWN = {} as Listing["capRateBreakdown"];

function listing(over: Partial<Listing> = {}): Listing {
  return {
    id: "L1",
    address: "100 Main St",
    location: "Pacific Heights",
    city: "San Francisco",
    state: "CA",
    zip: "94123",
    price: 1_500_000,
    beds: 3,
    baths: 2,
    sqft: 1400,
    yearBuilt: 2010,
    daysOnMarket: 5,
    pricePerSqft: 1071,
    hoa: null,
    propertyType: "Condo/Co-op",
    openHouseStart: new Date("2026-06-14T18:00:00.000Z"),
    openHouseEnd: new Date("2026-06-14T20:00:00.000Z"),
    url: "https://www.redfin.com/CA/San-Francisco/100-main-st",
    lat: 37.7929,
    lng: -122.4359,
    capRate: 4.2,
    capRateBreakdown: FAKE_BREAKDOWN,
    status: "Active",
    ...over,
  };
}

const GROUP: TimeSlotGroup = {
  label: "Saturday, Jun 14",
  startTime: new Date("2026-06-14T18:00:00.000Z"),
  endTime: new Date("2026-06-14T20:00:00.000Z"),
  listings: [listing()],
};

describe("generatePlanHtml: address link points to Apple Maps on iPhone", () => {
  it("renders the address as an Apple Maps link with lat/lng as daddr", () => {
    vi.stubGlobal("navigator", { userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari/604.1" });
    const html = generatePlanHtml([GROUP], "https://example.com");
    expect(html).toContain('class="card-address card-address--link"');
    expect(html).toMatch(/href="https:\/\/maps\.apple\.com\/\?daddr=37\.7929,-122\.4359/);
    // Pin label uses the human-readable address
    expect(html).toContain("q=100%20Main%20St%2C%20San%20Francisco");
    // The previous bug: address as daddr with ll as map center → Maps opens
    // with an empty destination field. Guard against that exact regression.
    expect(html).not.toMatch(/daddr=100%20Main%20St/);
    expect(html).not.toMatch(/ll=37\.7929/);
  });

  it("falls back to Google Maps on non-iOS UAs", () => {
    vi.stubGlobal("navigator", { userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X) Chrome/120" });
    const html = generatePlanHtml([GROUP], "https://example.com");
    expect(html).toMatch(/href="https:\/\/www\.google\.com\/maps\/dir/);
    expect(html).toContain("destination=37.7929,-122.4359");
  });
});
