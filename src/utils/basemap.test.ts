import { describe, it, expect } from "vitest";
import { BASEMAP_URL, BASEMAP_ATTRIBUTION, BASEMAP_TILE_OPTIONS } from "./basemap";

describe("basemap", () => {
  it("is an https template with z/x/y placeholders and no API key", () => {
    expect(BASEMAP_URL.startsWith("https://")).toBe(true);
    for (const p of ["{z}", "{x}", "{y}"]) expect(BASEMAP_URL).toContain(p);
    expect(BASEMAP_URL).not.toMatch(/key|token/i);
  });
  it("credits the tile provider and OpenStreetMap, as their terms require", () => {
    expect(BASEMAP_ATTRIBUTION).toMatch(/Esri/);
    expect(BASEMAP_ATTRIBUTION).toMatch(/OpenStreetMap/);
  });
  it("supports house-level zoom", () => {
    expect(BASEMAP_TILE_OPTIONS.maxZoom).toBeGreaterThanOrEqual(18);
  });
});
