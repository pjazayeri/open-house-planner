// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

afterEach(cleanup);
import { CatalogList } from "./CatalogList";
import { listingAddressKey } from "../../utils/catalog";
import type { Listing } from "../../types";

const listing = (over: Partial<Listing>): Listing => ({
  id: "1", address: "1 Main St", location: "Nob Hill", city: "San Francisco", state: "CA", zip: "94109",
  price: 1_000_000, beds: 2, baths: 1, sqft: 900, yearBuilt: 1990, daysOnMarket: 3, pricePerSqft: 1111, hoa: 500,
  propertyType: "Condo/Co-op", openHouseStart: new Date("2026-09-20T13:00:00"), openHouseEnd: new Date("2026-09-20T15:00:00"),
  url: "https://www.redfin.com/x", lat: 0, lng: 0, capRate: 2.5,
  capRateBreakdown: {} as Listing["capRateBreakdown"], ...over,
});

const base = {
  signedIn: true, loading: false, error: null, updatedAt: null, onLoad: vi.fn(),
  userAddressKeys: new Set<string>(), favoriteIds: new Set<string>(), onToggleFavorite: vi.fn(),
};

describe("CatalogList", () => {
  it("asks guests to sign in", () => {
    render(<CatalogList {...base} signedIn={false} listings={null} />);
    expect(screen.getByText(/Sign in to browse the catalog/)).toBeTruthy();
    expect(base.onLoad).not.toHaveBeenCalled();
  });

  it("loads lazily when signed in and nothing is loaded yet", () => {
    const onLoad = vi.fn();
    render(<CatalogList {...base} onLoad={onLoad} listings={null} />);
    expect(onLoad).toHaveBeenCalledTimes(1);
  });

  it("renders cards, marks the user's own listings, and toggles hearts by address key", () => {
    const a = listing({ id: "1", address: "1 Main St" });
    const b = listing({ id: "2", address: "2 Oak Ave" });
    const onToggleFavorite = vi.fn();
    render(
      <CatalogList
        {...base}
        listings={[a, b]}
        userAddressKeys={new Set([listingAddressKey(b)])}
        favoriteIds={new Set([listingAddressKey(a)])}
        onToggleFavorite={onToggleFavorite}
      />
    );
    expect(screen.getByText("1 Main St")).toBeTruthy();
    expect(screen.getByText(/in my list/)).toBeTruthy();
    const hearts = screen.getAllByRole("button", { name: /my listings/i });
    expect(hearts).toHaveLength(2);
    expect(hearts[0].getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(hearts[1]);
    expect(onToggleFavorite).toHaveBeenCalledWith(listingAddressKey(b));
  });

  it("filters by search text", () => {
    render(<CatalogList {...base} listings={[listing({ id: "1", address: "1 Main St" }), listing({ id: "2", address: "2 Oak Ave" })]} />);
    fireEvent.change(screen.getByLabelText("Search catalog"), { target: { value: "oak" } });
    expect(screen.queryByText("1 Main St")).toBeNull();
    expect(screen.getByText("2 Oak Ave")).toBeTruthy();
  });
});
