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

import { mergeNearby, clusterByGrid as cbg } from "./clusterMarkers";

describe("mergeNearby", () => {
  it("merges bubbles from adjacent cells whose centres are close", () => {
    // Two pairs straddling a cell boundary at x=56: centroids ~54 and ~58 → 4px apart.
    const pts = [
      { id: "a", x: 52, y: 10 }, { id: "b", x: 55, y: 10 },
      { id: "c", x: 57, y: 10 }, { id: "d", x: 60, y: 10 },
    ];
    const first = cbg(pts, 56);
    expect(first.clusters).toHaveLength(2);
    const { clusters } = mergeNearby(pts, first, 44);
    expect(clusters).toHaveLength(1);
    expect(clusters[0].ids.sort()).toEqual(["a", "b", "c", "d"]);
  });

  it("absorbs an unpinned single sitting under a bubble but keeps pinned ones", () => {
    const pts = [
      { id: "a", x: 10, y: 10 }, { id: "b", x: 12, y: 12 },
      { id: "s", x: 70, y: 12 },              // next cell, 59px away → stays single
      { id: "u", x: 20, y: 20 },              // same cell, already clustered
      { id: "p", x: 14, y: 14, pinned: true }, // under the bubble but pinned
    ];
    const first = cbg(pts, 56);
    const { clusters, singles } = mergeNearby(pts, first, 44);
    expect(singles.sort()).toEqual(["p", "s"]);
    expect(clusters[0].ids.sort()).toEqual(["a", "b", "u"]);
  });

  it("leaves far-apart bubbles alone", () => {
    const pts = [{ id: "a", x: 0, y: 0 }, { id: "b", x: 5, y: 5 }, { id: "c", x: 300, y: 300 }, { id: "d", x: 305, y: 305 }];
    const { clusters } = mergeNearby(pts, cbg(pts, 56), 44);
    expect(clusters).toHaveLength(2);
  });
});
