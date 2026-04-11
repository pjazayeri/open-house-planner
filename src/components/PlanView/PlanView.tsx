import { useMemo } from "react";
import type { TimeSlotGroup } from "../../types";
import { generatePlanHtml } from "../../utils/generatePlanHtml";

interface PlanViewProps {
  groups: TimeSlotGroup[];
}

export function PlanView({ groups }: PlanViewProps) {
  const html = useMemo(
    () => generatePlanHtml(groups, window.location.origin),
    [groups]
  );

  return (
    <iframe
      srcDoc={html}
      title="Open House Plan"
      style={{ position: "fixed", inset: 0, width: "100%", height: "100%", border: "none" }}
    />
  );
}
