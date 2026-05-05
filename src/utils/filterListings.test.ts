import { describe, it, expect } from "vitest";
import { filterAndTransform, transformAll, getNeighborhoods, getCities, SF_DISTRICT_MAP } from "./filterListings";
import type { RawListing } from "../types";

const URL_COL = "URL (SEE https://www.redfin.com/buy-a-home/comparative-market-analysis FOR INFO ON PRICING)";

function makeRow(overrides: Partial<RawListing> = {}): RawListing {
  const future = new Date(Date.now() + 24 * 3600_000);
  const month = future.toLocaleString("en-US", { month: "long" });
  const day = future.getDate();
  const year = future.getFullYear();
  const dateStr = `${month}-${day}-${year} 2:00 PM`;
  return {
    STATUS: "Active",
    "NEXT OPEN HOUSE START TIME": dateStr,
    "NEXT OPEN HOUSE END TIME": dateStr,
    LATITUDE: "37.77",
    LONGITUDE: "-122.42",
    PRICE: "1000000",
    BEDS: "2",
    BATHS: "2",
    "SQUARE FEET": "1000",
    "YEAR BUILT": "2010",
    "HOA/MONTH": "",
    "ZIP OR POSTAL CODE": "94115",
    "PROPERTY TYPE": "Condo/Co-op",
    "MLS#": "TEST123",
    ADDRESS: "100 Main St",
    LOCATION: "Pacific Heights",
    CITY: "San Francisco",
    "STATE OR PROVINCE": "CA",
    "DAYS ON MARKET": "5",
    "$/SQUARE FEET": "1000",
    [URL_COL]: "https://redfin.com/test",
    ...overrides,
  } as RawListing;
}

describe("filterAndTransform", () => {
  it("includes active listings with future open houses", () => {
    const result = filterAndTransform([makeRow()]);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("TEST123");
    expect(result[0].price).toBe(1_000_000);
  });

  it("excludes non-Active listings", () => {
    const result = filterAndTransform([makeRow({ STATUS: "Sold" })]);
    expect(result).toHaveLength(0);
  });

  it("excludes listings with no open house time", () => {
    const result = filterAndTransform([makeRow({ "NEXT OPEN HOUSE START TIME": "" })]);
    expect(result).toHaveLength(0);
  });

  it("excludes listings with invalid coordinates", () => {
    const result = filterAndTransform([makeRow({ LATITUDE: "nan", LONGITUDE: "nan" })]);
    expect(result).toHaveLength(0);
  });

  it("falls back to address+city for id when MLS# is missing", () => {
    const result = filterAndTransform([makeRow({ "MLS#": "" })]);
    expect(result[0].id).toBe("100 Main St-San Francisco");
  });

  it("maps SF district codes to neighborhood names", () => {
    const result = filterAndTransform([makeRow({ LOCATION: "SF District 7" })]);
    expect(result[0].location).toBe(SF_DISTRICT_MAP["SF District 7"]);
  });

  it("strips unmapped SF district codes", () => {
    const result = filterAndTransform([makeRow({ LOCATION: "SF District 99" })]);
    expect(result[0].location).toBe("");
  });

  it("attaches a cap rate", () => {
    const result = filterAndTransform([makeRow()]);
    expect(result[0].capRate).toBeGreaterThan(0);
  });
});

describe("transformAll", () => {
  it("includes listings regardless of open house time", () => {
    const result = transformAll([makeRow({ "NEXT OPEN HOUSE START TIME": "", "NEXT OPEN HOUSE END TIME": "" })]);
    expect(result).toHaveLength(1);
    expect(result[0].openHouseStart).toEqual(new Date(0));
  });

  it("still excludes listings with invalid coordinates", () => {
    const result = transformAll([makeRow({ LATITUDE: "" })]);
    expect(result).toHaveLength(0);
  });
});

describe("getNeighborhoods", () => {
  it("returns distinct, sorted neighborhood names", () => {
    const listings = [
      { ...makeRow(), location: "Noe Valley" } as ReturnType<typeof makeRow>,
      { ...makeRow(), location: "Pacific Heights" } as ReturnType<typeof makeRow>,
      { ...makeRow(), location: "Noe Valley" } as ReturnType<typeof makeRow>, // duplicate
    ];
    const result = getNeighborhoods(
      listings.map((r) => ({ ...filterAndTransform([r])[0], location: r.location }))
    );
    expect(result).toEqual(["Noe Valley", "Pacific Heights"]);
  });

  it("filters out generic/empty location values", () => {
    const rows = filterAndTransform([makeRow()]);
    const withBadLocation = rows.map((l) => ({ ...l, location: "not applicable" }));
    expect(getNeighborhoods(withBadLocation)).toHaveLength(0);
  });
});

describe("getCities", () => {
  it("puts San Francisco first when present", () => {
    const rows = filterAndTransform([
      makeRow({ CITY: "Irvine", "ZIP OR POSTAL CODE": "92618" }),
      makeRow({ CITY: "San Francisco", "MLS#": "SF1" }),
    ]);
    const cities = getCities(rows);
    expect(cities[0]).toBe("San Francisco");
  });

  it("returns sorted list without SF when SF is absent", () => {
    const rows = filterAndTransform([
      makeRow({ CITY: "Oakland", "MLS#": "OAK1" }),
      makeRow({ CITY: "Berkeley", "MLS#": "BERK1" }),
    ]);
    expect(getCities(rows)).toEqual(["Berkeley", "Oakland"]);
  });
});
