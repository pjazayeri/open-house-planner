// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { ActiveFiltersSummary } from "./ActiveFiltersSummary";

afterEach(cleanup);

describe("ActiveFiltersSummary", () => {
  it("shows 'Showing X of Y' counts always", () => {
    render(
      <ActiveFiltersSummary totalVisible={47} totalListings={259} activeCount={0} onClearAll={vi.fn()} />
    );
    expect(screen.getByText(/47/).textContent).toContain("47");
    expect(screen.getByText(/of 259/i)).toBeTruthy();
  });

  it("hides the clear-all button when no filters are active", () => {
    render(
      <ActiveFiltersSummary totalVisible={259} totalListings={259} activeCount={0} onClearAll={vi.fn()} />
    );
    expect(screen.queryByText(/Clear all/i)).toBeNull();
  });

  it("singular vs plural filter wording", () => {
    const { rerender } = render(
      <ActiveFiltersSummary totalVisible={10} totalListings={100} activeCount={1} onClearAll={vi.fn()} />
    );
    expect(screen.getByText(/1 filter active/i)).toBeTruthy();
    rerender(
      <ActiveFiltersSummary totalVisible={10} totalListings={100} activeCount={3} onClearAll={vi.fn()} />
    );
    expect(screen.getByText(/3 filters active/i)).toBeTruthy();
  });

  it("clicking Clear all fires onClearAll", () => {
    const onClearAll = vi.fn();
    render(
      <ActiveFiltersSummary totalVisible={10} totalListings={100} activeCount={2} onClearAll={onClearAll} />
    );
    fireEvent.click(screen.getByRole("button", { name: /Clear all/i }));
    expect(onClearAll).toHaveBeenCalledTimes(1);
  });
});
