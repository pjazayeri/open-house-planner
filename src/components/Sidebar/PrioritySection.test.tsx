// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

import { PrioritySection } from "./Sidebar";
import type { Listing, TimeSlotGroup as TimeSlotGroupType } from "../../types";

afterEach(() => cleanup());

function makeListing(over: Partial<Listing> & { id: string; address?: string; url?: string }): Listing {
  return {
    id: over.id,
    address: over.address ?? "100 Main St",
    location: "Pacific Heights",
    city: "San Francisco",
    state: "CA",
    zip: "94115",
    price: 1_000_000,
    beds: 2,
    baths: 2,
    sqft: 1000,
    yearBuilt: 2010,
    daysOnMarket: 10,
    pricePerSqft: 1000,
    hoa: null,
    propertyType: "Condo/Co-op",
    openHouseStart: new Date("2026-05-16T18:00:00Z"),
    openHouseEnd: new Date("2026-05-16T20:00:00Z"),
    url: over.url ?? "https://www.redfin.com/CA/San-Francisco/100-Main-St/home/1",
    lat: 37.79,
    lng: -122.43,
    capRate: 3.5,
    capRateBreakdown: {} as Listing["capRateBreakdown"],
    status: "Active",
    ...over,
  };
}

const SLOT: TimeSlotGroupType = {
  label: "Saturday",
  startTime: new Date("2026-05-16T18:00:00Z"),
  endTime: new Date("2026-05-16T20:00:00Z"),
  listings: [
    makeListing({ id: "L1", address: "2121 Laguna St #25" }),
    makeListing({ id: "L2", address: "100 Pine St" }),
  ],
};

function renderSection(props: Partial<Parameters<typeof PrioritySection>[0]> = {}) {
  return render(
    <PrioritySection
      priorityOrder={["L1", "L2"]}
      timeSlotGroups={[SLOT]}
      initialCollapsed={false}
      hoveredId={null}
      onSelect={vi.fn()}
      onHover={vi.fn()}
      onTogglePriority={vi.fn()}
      onReorderPriority={vi.fn()}
      {...props}
    />
  );
}

describe("PrioritySection — thumbnail + hover sync", () => {
  it("renders a thumbnail per priority row with the correct lazy-fetch URL", () => {
    renderSection();
    const t1 = screen.getByTestId("priority-thumb-L1") as HTMLImageElement;
    const t2 = screen.getByTestId("priority-thumb-L2") as HTMLImageElement;
    expect(t1.src).toContain("/api/thumbnail/L1");
    expect(t1.src).toContain("url=");
    expect(t2.src).toContain("/api/thumbnail/L2");
  });

  it("hovering a row calls onHover(id); leaving calls onHover(null) (drives map marker highlight)", () => {
    const onHover = vi.fn();
    renderSection({ onHover });
    const row = screen.getByTestId("priority-item-L1");
    fireEvent.mouseEnter(row);
    expect(onHover).toHaveBeenLastCalledWith("L1");
    fireEvent.mouseLeave(row);
    expect(onHover).toHaveBeenLastCalledWith(null);
  });

  it("applies the --hovered class to the row matching hoveredId", () => {
    renderSection({ hoveredId: "L2" });
    expect(screen.getByTestId("priority-item-L1").className).not.toMatch(/--hovered/);
    expect(screen.getByTestId("priority-item-L2").className).toMatch(/--hovered/);
  });

  it("clicking the row body still fires onSelect (hover wiring doesn't swallow clicks)", () => {
    const onSelect = vi.fn();
    renderSection({ onSelect });
    const row = screen.getByTestId("priority-item-L1");
    // The clickable address button is inside the row.
    const button = row.querySelector("button.priority-item-main")!;
    fireEvent.click(button);
    expect(onSelect).toHaveBeenCalledWith("L1");
  });

  it("renders nothing when no priorities match a time-slot listing", () => {
    const { container } = renderSection({ priorityOrder: ["DOES_NOT_EXIST"] });
    expect(container.firstChild).toBeNull();
  });
});
