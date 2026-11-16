import { useMemo, useState } from "react";
import { calcBuyVsRent } from "../../utils/mortgageCalc";
import { recalcCapRateWithRent } from "../../utils/capRate";
import { mortgageParamsFrom, type FinanceShareSnapshot } from "../../utils/financeShare";
import { DetailPanel } from "./FinancePage";
import "./FinancePage.css";
import "./SharedFinanceView.css";

/**
 * Public, no-sign-in view of one property's buy-vs-rent analysis, opened from
 * a `#analysis?bin=…` link. Renders the same DetailPanel as the Finance page
 * from a frozen snapshot of the listing + the sharer's assumptions. The
 * panel's own fields (hold, closing, seller costs, inflation, rent) stay
 * editable for exploring, in memory only.
 */
export function SharedFinanceView({ snapshot }: { snapshot: FinanceShareSnapshot }) {
  const { listing, inputs: shared } = snapshot;
  const [holdYears, setHoldYears] = useState(shared.holdYears);
  const [buyerClosingPct, setBuyerClosingPct] = useState(shared.buyerClosingPct);
  const [sellerCostPct, setSellerCostPct] = useState(shared.sellerCostPct);
  const [rentInflationPct, setRentInflationPct] = useState(shared.rentInflationPct);
  const [rentOverride, setRentOverride] = useState<number | null>(snapshot.rentOverride);

  const inputs = useMemo(
    () => ({ ...shared, holdYears, buyerClosingPct, sellerCostPct, rentInflationPct }),
    [shared, holdYears, buyerClosingPct, sellerCostPct, rentInflationPct],
  );
  const result = useMemo(
    () => calcBuyVsRent(listing, mortgageParamsFrom(inputs), rentOverride ?? undefined),
    [listing, inputs, rentOverride],
  );
  const effectiveCapRate = rentOverride !== null
    ? recalcCapRateWithRent(listing.capRateBreakdown, rentOverride, listing.price)
    : listing.capRate;

  const edited =
    holdYears !== shared.holdYears ||
    buyerClosingPct !== shared.buyerClosingPct ||
    sellerCostPct !== shared.sellerCostPct ||
    rentInflationPct !== shared.rentInflationPct ||
    rentOverride !== snapshot.rentOverride;

  function reset() {
    setHoldYears(shared.holdYears);
    setBuyerClosingPct(shared.buyerClosingPct);
    setSellerCostPct(shared.sellerCostPct);
    setRentInflationPct(shared.rentInflationPct);
    setRentOverride(snapshot.rentOverride);
  }

  const sharedOn = snapshot.sharedAt ? new Date(snapshot.sharedAt) : null;
  const assumptions: [string, string][] = [
    ["Down payment", `${shared.downPct}%`],
    ["Mortgage rate", `${shared.ratePct}% · ${shared.termYears}-yr fixed`],
    ["Return on cash if invested", `${shared.oppReturnPct}%/yr`],
    ["Marginal tax rate", `${shared.taxRatePct}%`],
    ["Appreciation", `${shared.appreciationPct}%/yr${shared.includeAppreciation ? "" : " (not counted in monthly cost)"}`],
    ["SALT headroom", `$${shared.saltHeadroomK}k`],
    ["Principal", shared.includePrincipal ? "counted as a cost" : "excluded from cost"],
  ];

  return (
    <div className="fs-page">
      <div className="fs-inner">
        <header className="fs-header">
          <div>
            <h1 className="fs-title">Buy vs rent analysis</h1>
            <p className="fs-sub">
              {sharedOn && !isNaN(sharedOn.getTime())
                ? <>Shared {sharedOn.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}. </>
                : null}
              Figures use the listing price and assumptions below as of that day.
            </p>
          </div>
        </header>

        <dl className="fs-assumptions" aria-label="Assumptions">
          {assumptions.map(([k, v]) => (
            <div key={k} className="fs-assumption">
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>

        <p className="fs-explore">
          You can change hold period, closing and selling costs, inflation and rent below to explore. Nothing is saved.
          {edited && <button className="fs-reset" onClick={reset}>Reset to shared numbers</button>}
        </p>

        <DetailPanel
          listing={listing}
          result={result}
          effectiveCapRate={effectiveCapRate}
          downPct={shared.downPct}
          ratePct={shared.ratePct}
          termYears={shared.termYears}
          oppReturnPct={shared.oppReturnPct}
          taxRatePct={shared.taxRatePct}
          appreciationPct={shared.appreciationPct}
          saltHeadroom={shared.saltHeadroomK}
          includePrincipal={shared.includePrincipal}
          rentOverride={rentOverride}
          onSetRentOverride={setRentOverride}
          rentEstimate={snapshot.rentEstimate}
          fetchingEstimate={false}
          holdYears={holdYears}
          setHoldYears={setHoldYears}
          buyerClosingPct={buyerClosingPct}
          setBuyerClosingPct={setBuyerClosingPct}
          sellerCostPct={sellerCostPct}
          setSellerCostPct={setSellerCostPct}
          rentInflationPct={rentInflationPct}
          setRentInflationPct={setRentInflationPct}
        />

        <footer className="fs-footer">Made with Open House Planner · Estimates only, not financial advice.</footer>
      </div>
    </div>
  );
}
