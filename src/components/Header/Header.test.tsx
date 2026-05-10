// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";

import { Header } from "./Header";

afterEach(() => {
  // Portal content lives on document.body and isn't auto-removed between tests.
  cleanup();
  document.body.innerHTML = "";
});

const baseProps = {
  page: "planner" as const,
  onNavigate: vi.fn(),
  cities: ["San Francisco"],
  selectedCity: "San Francisco",
  onCityChange: vi.fn(),
  timeSlotGroups: [],
  totalListings: 0,
  hiddenCount: 0,
  onRestoreHidden: vi.fn(),
  syncStatus: "ok" as const,
  saveFailed: false,
  authMode: "signed-in" as const,
  user: { displayName: "Test", email: "t@example.com", photoURL: null },
  onSignOut: vi.fn().mockResolvedValue(undefined),
  onShowSummary: vi.fn(),
  onUploadCsv: vi.fn().mockResolvedValue(0),
};

describe("Header share-plan dropdown (regression: dropdown invisible on mobile)", () => {
  it("renders the dropdown in document.body, NOT inside .header-nav", async () => {
    // The original bug: the dropdown lived inside .header-nav, which has
    // `overflow-x: auto` on mobile. Per CSS spec that forces overflow-y to a
    // non-visible value, clipping the dropdown out of sight. Rendering via
    // portal to <body> guarantees the dropdown can never be clipped by an
    // ancestor's overflow.
    const onSharePlan = vi.fn().mockResolvedValue({
      planUrl: "https://example.com/#share?bin=abc",
      mapUrl: "https://example.com/#map?bin=abc",
    });

    const { container } = render(<Header {...baseProps} onSharePlan={onSharePlan} />);
    fireEvent.click(screen.getByRole("button", { name: /Share Plan/i }));

    const dropdown = await screen.findByTestId("share-plan-dropdown");
    expect(dropdown).toBeTruthy();

    // Critical structural assertion: the dropdown must NOT be a descendant
    // of any element inside the rendered Header tree (which includes
    // .header-nav). Portal targets document.body, so the dropdown is a
    // sibling of `container`, not inside it.
    expect(container.contains(dropdown)).toBe(false);
    expect(document.body.contains(dropdown)).toBe(true);

    // And it must use position:fixed so it isn't trapped by any ancestor.
    expect(dropdown.className).toMatch(/share-plan-dropdown--portal/);
  });

  it("renders both share links (Full plan and Map only) when shareLinks resolve", async () => {
    const onSharePlan = vi.fn().mockResolvedValue({
      planUrl: "https://example.com/#share?bin=abc",
      mapUrl: "https://example.com/#map?bin=abc",
    });
    render(<Header {...baseProps} onSharePlan={onSharePlan} />);
    fireEvent.click(screen.getByRole("button", { name: /Share Plan/i }));

    await waitFor(() => screen.getByTestId("share-plan-dropdown"));
    const links = screen.getAllByText("Open ↗");
    expect(links).toHaveLength(2);
    expect((links[0] as HTMLAnchorElement).href).toContain("#share?bin=abc");
    expect((links[1] as HTMLAnchorElement).href).toContain("#map?bin=abc");
  });

  it("does not render the share button on non-share pages", () => {
    render(<Header {...baseProps} page="data" onSharePlan={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /Share Plan/i })).toBeNull();
  });
});
