import { describe, it, expect } from "vitest";
import { timeAgo, describeRefresh } from "./catalog";

const now = new Date("2026-09-14T12:00:00Z");

describe("timeAgo", () => {
  it("formats seconds, minutes, hours, days", () => {
    expect(timeAgo(new Date("2026-09-14T11:59:40Z"), now)).toBe("just now");
    expect(timeAgo(new Date("2026-09-14T11:56:00Z"), now)).toBe("4 min ago");
    expect(timeAgo(new Date("2026-09-14T09:00:00Z"), now)).toBe("3h ago");
    expect(timeAgo(new Date("2026-09-11T12:00:00Z"), now)).toBe("3d ago");
    expect(timeAgo(null, now)).toBe("");
  });
});

describe("describeRefresh", () => {
  const base = { refreshed: true, updatedAt: now, changes: { matched: 3, status: 0, price: 0, openHouse: 0 } };
  it("reports nothing changed after a real pull", () => {
    expect(describeRefresh(base)).toBe("Listings refreshed — nothing changed");
  });
  it("lists the change counts", () => {
    expect(describeRefresh({ ...base, changes: { matched: 3, status: 1, price: 2, openHouse: 0 } }))
      .toBe("Refreshed: 1 status change, 2 price changes");
  });
  it("says already up to date when the pull was skipped", () => {
    expect(describeRefresh({ ...base, refreshed: false })).toMatch(/^Already up to date/);
  });
});
