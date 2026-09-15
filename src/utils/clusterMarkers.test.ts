import { describe, it, expect } from "vitest";
import { clusterByGrid } from "./clusterMarkers";

describe("clusterByGrid", () => {
  it("groups points sharing a grid cell and leaves isolated points single", () => {
    const { clusters, singles } = clusterByGrid([
      { id: "a", x: 10, y: 10 }, { id: "b", x: 30, y: 40 }, // same 56px cell
      { id: "c", x: 300, y: 300 },
    ], 56);
    expect(clusters).toHaveLength(1);
    expect(clusters[0].ids.sort()).toEqual(["a", "b"]);
    expect(singles).toEqual(["c"]);
  });

  it("never clusters pinned points", () => {
    const { clusters, singles } = clusterByGrid([
      { id: "p", x: 10, y: 10, pinned: true }, { id: "q", x: 12, y: 12 }, { id: "r", x: 14, y: 14 },
    ]);
    expect(singles).toContain("p");
    expect(clusters[0].ids.sort()).toEqual(["q", "r"]);
  });

  it("treats unprojectable points as singles", () => {
    const { clusters, singles } = clusterByGrid([{ id: "n", x: NaN, y: 0 }, { id: "m", x: 1, y: 1 }]);
    expect(clusters).toHaveLength(0);
    expect(singles.sort()).toEqual(["m", "n"]);
  });
});

import { stopRangeLabel } from "./clusterMarkers";

describe("stopRangeLabel", () => {
  it("shows a min–max range for tour stops in a cluster", () => {
    expect(stopRangeLabel([7, 3, 5])).toBe("3–7");
    expect(stopRangeLabel([4])).toBe("4");
    expect(stopRangeLabel([])).toBe("");
  });
});
