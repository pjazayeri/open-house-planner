import type { CSSProperties, ReactNode } from "react";
import "./filters.css";

interface ChipProps {
  /** Active/selected state. Triggers the solid-fill style so the selection
   *  reads clearly at a distance — fixes the old "barely-selected" issue
   *  where light-tint text on near-identical chips made the active state
   *  invisible. */
  selected?: boolean;
  /** Optional count appended in parentheses (e.g. `Active (90)`). */
  count?: number;
  /** Optional accent color — drives the dot (for zones) and the selected
   *  fill (for status chips that want their own semantic color). */
  accent?: string;
  /** Render a small colored dot before the label (zone-style). */
  withDot?: boolean;
  /** "Clear" treatment — neutral border, dangerous on hover. */
  variant?: "default" | "clear";
  disabled?: boolean;
  onClick?: () => void;
  title?: string;
  children: ReactNode;
}

export function Chip({
  selected = false,
  count,
  accent,
  withDot = false,
  variant = "default",
  disabled = false,
  onClick,
  title,
  children,
}: ChipProps) {
  const style: CSSProperties = accent ? ({ "--chip-accent": accent } as CSSProperties) : {};
  return (
    <button
      type="button"
      className={
        "chip" +
        (selected ? " chip--selected" : "") +
        (variant === "clear" ? " chip--clear" : "") +
        (accent ? " chip--accent" : "")
      }
      style={style}
      aria-pressed={onClick ? selected : undefined}
      onClick={onClick}
      disabled={disabled}
      title={title}
    >
      {withDot && <span className="chip-dot" style={accent ? { background: accent } : undefined} />}
      <span className="chip-label">{children}</span>
      {count !== undefined && <span className="chip-count">{count}</span>}
    </button>
  );
}
