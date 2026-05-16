import { describe, it, expect } from "vitest";
import { computeMarkerSpec } from "./mapMarker";

describe("computeMarkerSpec — regression: duplicate '1' markers", () => {
  // Before the fix, priority listings overrode the marker number with
  // their priority rank (1, 2, …). That collided with non-priority
  // listings' visitOrder (also 1, 2, …), producing two markers labeled
  // "1" on the map. Now every marker shows its global tour stop
  // (`visitOrder`); priority is conveyed by `isPriority` (color + star).
  it("uses visitOrder for the number even when the listing is priority", () => {
    const spec = computeMarkerSpec(5, 0, true);
    expect(spec.num).toBe(5);
    expect(spec.isPriority).toBe(true);
  });

  it("uses visitOrder for the number for non-priority listings", () => {
    const spec = computeMarkerSpec(7, 0, false);
    expect(spec.num).toBe(7);
    expect(spec.isPriority).toBe(false);
  });

  it("falls back to coordIdx + 1 (1-based) when visitOrder is undefined", () => {
    expect(computeMarkerSpec(undefined, 0, false).num).toBe(1);
    expect(computeMarkerSpec(undefined, 4, false).num).toBe(5);
  });

  it("a priority listing and a non-priority listing with different visitOrders no longer collide", () => {
    // Priority listing — visitOrder 3
    const p = computeMarkerSpec(3, 2, true);
    // Non-priority listing — visitOrder 1
    const n = computeMarkerSpec(1, 0, false);
    expect(p.num).not.toBe(n.num);
  });

  it("uses priority rank in priority-only mode when requested", () => {
    const spec = computeMarkerSpec(5, 4, true, 2, true);
    expect(spec.num).toBe(2);
    expect(spec.isPriority).toBe(true);
  });

  it("ignores priority-rank mode for non-priority listings", () => {
    const spec = computeMarkerSpec(5, 4, false, 2, true);
    expect(spec.num).toBe(5);
    expect(spec.isPriority).toBe(false);
  });
});
