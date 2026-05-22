import "./filters.css";

interface ActiveFiltersSummaryProps {
  totalVisible: number;
  totalListings: number;
  activeCount: number;
  onClearAll: () => void;
}

/**
 * "Showing 47 of 259 · 3 filters · Clear all" — sits at the top of the
 * filter pane so the user can see at a glance whether anything's narrowing
 * the list, and reset with one click. Hidden entirely when no filters
 * are active (collapsed prop in the parent decides whether to render).
 */
export function ActiveFiltersSummary({
  totalVisible,
  totalListings,
  activeCount,
  onClearAll,
}: ActiveFiltersSummaryProps) {
  return (
    <div className="active-filters-summary" role="status">
      <span className="afs-count">
        Showing <strong>{totalVisible}</strong> of {totalListings}
      </span>
      {activeCount > 0 && (
        <>
          <span className="afs-sep">·</span>
          <span className="afs-active">{activeCount} filter{activeCount === 1 ? "" : "s"} active</span>
          <button className="afs-clear" onClick={onClearAll}>Clear all</button>
        </>
      )}
    </div>
  );
}
