// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { RangeFilter } from "./RangeFilter";

afterEach(cleanup);

const PRESETS = [
  { value: 500_000, label: "$500K" },
  { value: 1_000_000, label: "$1M" },
];

describe("RangeFilter", () => {
  it("renders the label as an eyebrow and No-min / No-max placeholder options", () => {
    render(
      <RangeFilter
        label="Price"
        min={null}
        max={null}
        minPresets={PRESETS}
        maxPresets={PRESETS}
        onMinChange={vi.fn()}
        onMaxChange={vi.fn()}
      />
    );
    expect(screen.getByText("Price")).toBeTruthy();
    expect(screen.getByRole("combobox", { name: /Price minimum/i })).toBeTruthy();
    expect(screen.getByRole("combobox", { name: /Price maximum/i })).toBeTruthy();
  });

  it("changing the min select fires onMinChange with the parsed number", () => {
    const onMin = vi.fn();
    render(
      <RangeFilter
        label="Price"
        min={null}
        max={null}
        minPresets={PRESETS}
        maxPresets={PRESETS}
        onMinChange={onMin}
        onMaxChange={vi.fn()}
      />
    );
    fireEvent.change(screen.getByRole("combobox", { name: /minimum/i }), { target: { value: "500000" } });
    expect(onMin).toHaveBeenCalledWith(500_000);
  });

  it("clearing the min (back to placeholder) fires onMinChange(null)", () => {
    const onMin = vi.fn();
    render(
      <RangeFilter
        label="Price"
        min={500_000}
        max={null}
        minPresets={PRESETS}
        maxPresets={PRESETS}
        onMinChange={onMin}
        onMaxChange={vi.fn()}
      />
    );
    fireEvent.change(screen.getByRole("combobox", { name: /minimum/i }), { target: { value: "" } });
    expect(onMin).toHaveBeenCalledWith(null);
  });

  it("reflects current min/max via the controlled value", () => {
    render(
      <RangeFilter
        label="Price"
        min={500_000}
        max={1_000_000}
        minPresets={PRESETS}
        maxPresets={PRESETS}
        onMinChange={vi.fn()}
        onMaxChange={vi.fn()}
      />
    );
    expect((screen.getByRole("combobox", { name: /minimum/i }) as HTMLSelectElement).value).toBe("500000");
    expect((screen.getByRole("combobox", { name: /maximum/i }) as HTMLSelectElement).value).toBe("1000000");
  });
});
