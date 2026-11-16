// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { SharedFinanceView } from "./SharedFinanceView";
import { DetailPanel } from "./FinancePage";
import { buildFinanceShare, mortgageParamsFrom, parseFinanceShare } from "../../utils/financeShare";
import { calcBuyVsRent } from "../../utils/mortgageCalc";
import { makeListing, INPUTS } from "../../utils/financeShare.fixtures";

afterEach(() => cleanup());

function snapshot(rentOverride: number | null = 6980) {
  const est = { rent: 6980, low: 5880, high: 8080, comparables: 15, fetchedAt: "2026-11-15T00:00:00.000Z" };
  const snap = buildFinanceShare(makeListing(), INPUTS, rentOverride, est, new Date("2026-11-16T12:00:00Z"));
  return parseFinanceShare(JSON.parse(JSON.stringify(snap)))!;
}

const money = (n: number) => "$" + Math.round(Math.abs(n)).toLocaleString("en-US");

describe("SharedFinanceView", () => {
  it("shows the sharer's assumptions and reproduces their numbers", () => {
    const snap = snapshot();
    render(<SharedFinanceView snapshot={snap} />);

    expect(screen.getByText("1835 Franklin St #802")).toBeTruthy();
    expect(screen.getByText("100%")).toBeTruthy();
    expect(screen.getByText("7.11% · 30-yr fixed")).toBeTruthy();
    expect(screen.getByText(/Shared Nov 16, 2026/)).toBeTruthy();

    const expected = calcBuyVsRent(snap.listing, mortgageParamsFrom(INPUTS), 6980);
    expect(screen.getByText(`${money(expected.netMonthlyOwnershipCost)} / mo`)).toBeTruthy();
    expect((screen.getByTitle("Override estimated rent") as HTMLInputElement).value).toBe("6980");
  });

  it("has no share button and lets the viewer explore + reset", () => {
    render(<SharedFinanceView snapshot={snapshot()} />);
    expect(screen.queryByText(/Share this analysis/)).toBeNull();
    expect(screen.queryByText("Reset to shared numbers")).toBeNull();

    fireEvent.change(screen.getByTitle("Override estimated rent"), { target: { value: "5000" } });
    fireEvent.click(screen.getByText("Reset to shared numbers"));
    expect((screen.getByTitle("Override estimated rent") as HTMLInputElement).value).toBe("6980");
    expect(screen.queryByText("Reset to shared numbers")).toBeNull();
  });
});

describe("DetailPanel share link", () => {
  function renderPanel(create: () => Promise<string>) {
    const listing = makeListing();
    const result = calcBuyVsRent(listing, mortgageParamsFrom(INPUTS));
    return render(
      <DetailPanel
        listing={listing} result={result} effectiveCapRate={listing.capRate}
        downPct={100} ratePct={7.11} termYears={30} oppReturnPct={4} taxRatePct={32}
        appreciationPct={3} saltHeadroom={10} includePrincipal
        rentOverride={null} onSetRentOverride={vi.fn()} rentEstimate={null} fetchingEstimate={false}
        holdYears={28} setHoldYears={vi.fn()} buyerClosingPct={0.25} setBuyerClosingPct={vi.fn()}
        sellerCostPct={6} setSellerCostPct={vi.fn()} rentInflationPct={3} setRentInflationPct={vi.fn()}
        share={{ key: "k", create }}
      />,
    );
  }

  it("creates the link, shows it and copies it", async () => {
    const url = "https://open-house-planner.vercel.app/#analysis?bin=abc";
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    const create = vi.fn().mockResolvedValue(url);

    renderPanel(create);
    fireEvent.click(screen.getByText(/Share this analysis/));

    await waitFor(() => expect((screen.getByLabelText("Share link") as HTMLInputElement).value).toBe(url));
    expect(create).toHaveBeenCalledOnce();
    expect(writeText).toHaveBeenCalledWith(url);
    expect(screen.getByText("Copied")).toBeTruthy();
  });

  it("shows an error and keeps the button when creation fails", async () => {
    renderPanel(vi.fn().mockRejectedValue(new Error("503")));
    fireEvent.click(screen.getByText(/Share this analysis/));
    await waitFor(() => expect(screen.getByText(/Couldn’t create link/)).toBeTruthy());
    expect(screen.getByText(/Share this analysis/)).toBeTruthy();
  });
});
