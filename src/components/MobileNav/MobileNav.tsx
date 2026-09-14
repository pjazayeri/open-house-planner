import type { ReactElement } from "react";
import type { Page } from "../../App";
import "./MobileNav.css";

interface MobileNavProps {
  page: Page;
  onNavigate: (page: Page) => void;
}

const stroke = { fill: "none", stroke: "currentColor", strokeWidth: 1.9, strokeLinecap: "round", strokeLinejoin: "round" } as const;

function HomeIcon() {
  return <svg viewBox="0 0 24 24" {...stroke}><path d="M3 11.5 12 4l9 7.5" /><path d="M5.5 10.5V20h13v-9.5" /><path d="M10 20v-5h4v5" /></svg>;
}
function ClockIcon() {
  return <svg viewBox="0 0 24 24" {...stroke}><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></svg>;
}
function TableIcon() {
  return <svg viewBox="0 0 24 24" {...stroke}><rect x="3.5" y="5" width="17" height="14" rx="2" /><path d="M3.5 10h17M9.5 10v9" /></svg>;
}
function DollarIcon() {
  return <svg viewBox="0 0 24 24" {...stroke}><circle cx="12" cy="12" r="8.5" /><path d="M14.6 9.4c-.4-1-1.4-1.5-2.6-1.5-1.5 0-2.6.8-2.6 1.9 0 2.6 5.4 1.3 5.4 4.1 0 1.2-1.2 2-2.8 2-1.4 0-2.5-.6-2.9-1.7" /><path d="M12 6v1.9M12 16v2" /></svg>;
}
function ChartIcon() {
  return <svg viewBox="0 0 24 24" {...stroke}><path d="M4 20h16" /><path d="M7 16v-5M12 16V7M17 16v-3" /></svg>;
}

const TABS: { page: Page; label: string; matches: Page[]; Icon: () => ReactElement }[] = [
  { page: "home", label: "Browse", matches: ["home"], Icon: HomeIcon },
  { page: "planner", label: "Open Houses", matches: ["planner", "priority"], Icon: ClockIcon },
  { page: "data", label: "Data", matches: ["data"], Icon: TableIcon },
  { page: "finance", label: "Finance", matches: ["finance"], Icon: DollarIcon },
  { page: "analytics", label: "Analytics", matches: ["analytics"], Icon: ChartIcon },
];

/** iOS-style bottom tab bar. Rendered on every page; hidden on desktop via CSS. */
export function MobileNav({ page, onNavigate }: MobileNavProps) {
  return (
    <nav className="mobile-nav" aria-label="Pages">
      {TABS.map(({ page: p, label, matches, Icon }) => {
        const active = matches.includes(page);
        return (
          <button
            key={p}
            className={`mobile-nav-btn${active ? " active" : ""}`}
            onClick={() => onNavigate(p)}
            aria-current={active ? "page" : undefined}
          >
            <Icon />
            <span>{label}</span>
          </button>
        );
      })}
    </nav>
  );
}
