import { describe, it, expect } from "vitest";
import { CSV_ACCEPT, isIOSDevice, csvInstructions } from "./csvUpload";

describe("CSV upload helpers", () => {
  it("accept list covers the extension and MIME spellings iOS Files uses", () => {
    expect(CSV_ACCEPT.split(",")).toEqual(expect.arrayContaining([".csv", "text/csv", "text/comma-separated-values"]));
  });
  it("detects iPhone, iPad, and iPadOS-as-Mac", () => {
    expect(isIOSDevice("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)")).toBe(true);
    expect(isIOSDevice("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", 5)).toBe(true);
    expect(isIOSDevice("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", 0)).toBe(false);
    expect(isIOSDevice("Mozilla/5.0 (Windows NT 10.0)")).toBe(false);
  });
  it("gives phone-specific steps on iOS", () => {
    expect(csvInstructions(true).join(" ")).toMatch(/Files/);
    expect(csvInstructions(false)).toHaveLength(2);
  });
});
