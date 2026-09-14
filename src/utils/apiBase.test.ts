import { describe, it, expect } from "vitest";
import { apiUrl, API_BASE } from "./apiBase";

describe("apiUrl", () => {
  it("is relative on the web (no native platform, no env override)", () => {
    expect(API_BASE).toBe("");
    expect(apiUrl("/api/sync")).toBe("/api/sync");
  });

  it("prefixes site-relative paths with the base", () => {
    expect(apiUrl("/api/sync", "https://x.test")).toBe("https://x.test/api/sync");
    expect(apiUrl("api/sync", "https://x.test")).toBe("https://x.test/api/sync");
  });

  it("passes absolute URLs through untouched", () => {
    expect(apiUrl("https://blob.example/csv.csv", "https://x.test")).toBe("https://blob.example/csv.csv");
  });
});
