import { describe, it, expect } from "vitest";
import {
  serializePlan,
  deserializePlan,
  encodePlan,
  decodePlan,
  shiftPlanToFuture,
} from "./serializePlan";
import type { TimeSlotGroup } from "../types";

function makeGroup(offsetHours = 0): TimeSlotGroup {
  const start = new Date(Date.now() + offsetHours * 3600_000);
  const end = new Date(start.getTime() + 2 * 3600_000);
  return {
    label: "Test Group",
    startTime: start,
    endTime: end,
    listings: [
      {
        id: "123",
        address: "100 Main St",
        location: "Downtown",
        city: "San Francisco",
        state: "CA",
        zip: "94102",
        price: 800_000,
        beds: 2,
        baths: 1,
        sqft: 900,
        hoa: null,
        yearBuilt: 2000,
        daysOnMarket: null,
        pricePerSqft: null,
        propertyType: "Condo/Co-op",
        openHouseStart: start,
        openHouseEnd: end,
        url: "https://redfin.com/123",
        lat: 37.77,
        lng: -122.42,
        capRate: 3.5,
        capRateBreakdown: {} as TimeSlotGroup["listings"][0]["capRateBreakdown"],
      },
    ],
  };
}

describe("serializePlan / deserializePlan roundtrip", () => {
  it("preserves all listing fields through roundtrip", () => {
    const original = [makeGroup(2)];
    const serialized = serializePlan(original);
    const restored = deserializePlan(serialized);

    expect(restored).toHaveLength(1);
    const l = restored[0].listings[0];
    expect(l.id).toBe("123");
    expect(l.address).toBe("100 Main St");
    expect(l.price).toBe(800_000);
    expect(l.capRate).toBe(3.5);
    expect(l.lat).toBe(37.77);
    expect(l.lng).toBe(-122.42);
  });

  it("preserves dates as Date objects after roundtrip", () => {
    const original = [makeGroup(2)];
    const start = original[0].startTime;
    const restored = deserializePlan(serializePlan(original));
    expect(restored[0].startTime).toBeInstanceOf(Date);
    expect(restored[0].startTime.getTime()).toBe(start.getTime());
  });

  it("handles multiple groups", () => {
    const original = [makeGroup(2), makeGroup(4)];
    const restored = deserializePlan(serializePlan(original));
    expect(restored).toHaveLength(2);
  });

  it("handles empty plan", () => {
    const restored = deserializePlan(serializePlan([]));
    expect(restored).toHaveLength(0);
  });
});

describe("encodePlan / decodePlan", () => {
  it("roundtrips through URL encoding", () => {
    const original = [makeGroup(2)];
    const encoded = encodePlan(original);
    const decoded = decodePlan(encoded);
    expect(decoded).not.toBeNull();
    expect(decoded![0].listings[0].id).toBe("123");
  });

  it("returns null for garbage input", () => {
    expect(decodePlan("not valid json %")).toBeNull();
    expect(decodePlan("")).toBeNull();
  });
});

describe("shiftPlanToFuture", () => {
  it("does not shift a plan already in the future", () => {
    const plan = [makeGroup(48)]; // 48h from now
    const shifted = shiftPlanToFuture(plan);
    expect(shifted[0].startTime.getTime()).toBe(plan[0].startTime.getTime());
  });

  it("shifts a past plan to the future by whole weeks", () => {
    const msPerWeek = 7 * 24 * 3600_000;
    // Use 2 weeks + 1 hour ago so Math.ceil gives 3 (not exactly 2)
    const pastStart = new Date(Date.now() - 2 * msPerWeek - 3_600_000);
    const pastEnd = new Date(pastStart.getTime() + 2 * 3600_000);
    const plan: TimeSlotGroup[] = [{
      label: "Past",
      startTime: pastStart,
      endTime: pastEnd,
      listings: [],
    }];
    const shifted = shiftPlanToFuture(plan);
    expect(shifted[0].startTime.getTime()).toBeGreaterThan(Date.now());
    const delta = shifted[0].startTime.getTime() - pastStart.getTime();
    expect(delta % msPerWeek).toBe(0);
  });

  it("preserves relative spacing between groups", () => {
    const msPerWeek = 7 * 24 * 3600_000;
    const base = new Date(Date.now() - 3 * msPerWeek);
    const group1 = { label: "A", startTime: base, endTime: new Date(base.getTime() + 3600_000), listings: [] };
    const group2 = { label: "B", startTime: new Date(base.getTime() + 24 * 3600_000), endTime: new Date(base.getTime() + 26 * 3600_000), listings: [] };
    const shifted = shiftPlanToFuture([group1, group2]);
    const originalGap = group2.startTime.getTime() - group1.startTime.getTime();
    const shiftedGap = shifted[1].startTime.getTime() - shifted[0].startTime.getTime();
    expect(shiftedGap).toBe(originalGap);
  });

  it("handles empty plan", () => {
    expect(shiftPlanToFuture([])).toEqual([]);
  });
});
