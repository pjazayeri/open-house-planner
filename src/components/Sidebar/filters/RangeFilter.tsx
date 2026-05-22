import "./filters.css";

export interface RangePreset {
  value: number;
  label: string;
}

interface RangeFilterProps {
  label: string;
  min: number | null;
  max: number | null;
  minPresets: RangePreset[];
  maxPresets: RangePreset[];
  onMinChange: (v: number | null) => void;
  onMaxChange: (v: number | null) => void;
}

/**
 * Min/Max paired select control. Extracted from three near-duplicate
 * inline blocks (Price, Cap Rate, $/sqft) in the sidebar filter pane.
 * Future: replace each preset list with a slider that renders the
 * actual distribution, once we have a histogram source.
 */
export function RangeFilter({
  label,
  min,
  max,
  minPresets,
  maxPresets,
  onMinChange,
  onMaxChange,
}: RangeFilterProps) {
  return (
    <div className="range-filter">
      <div className="filter-eyebrow">{label}</div>
      <div className="range-filter-row">
        <select
          className="range-select"
          value={min ?? ""}
          onChange={(e) => onMinChange(e.target.value !== "" ? Number(e.target.value) : null)}
          aria-label={`${label} minimum`}
        >
          <option value="">No min</option>
          {minPresets.map((p) => (
            <option key={p.value} value={p.value}>{p.label}</option>
          ))}
        </select>
        <span className="range-sep" aria-hidden>–</span>
        <select
          className="range-select"
          value={max ?? ""}
          onChange={(e) => onMaxChange(e.target.value !== "" ? Number(e.target.value) : null)}
          aria-label={`${label} maximum`}
        >
          <option value="">No max</option>
          {maxPresets.map((p) => (
            <option key={p.value} value={p.value}>{p.label}</option>
          ))}
        </select>
      </div>
    </div>
  );
}
