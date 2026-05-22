// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { Chip } from "./Chip";

afterEach(cleanup);

describe("Chip", () => {
  it("renders children and fires onClick", () => {
    const onClick = vi.fn();
    render(<Chip onClick={onClick}>Active</Chip>);
    fireEvent.click(screen.getByRole("button", { name: /Active/i }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("applies the --selected modifier and reports aria-pressed=true when selected", () => {
    render(<Chip selected onClick={vi.fn()}>Liked</Chip>);
    const btn = screen.getByRole("button", { name: /Liked/i });
    expect(btn.className).toMatch(/chip--selected/);
    expect(btn.getAttribute("aria-pressed")).toBe("true");
  });

  it("aria-pressed=false when unselected (state is unambiguous to assistive tech)", () => {
    render(<Chip onClick={vi.fn()}>Liked</Chip>);
    expect(screen.getByRole("button").getAttribute("aria-pressed")).toBe("false");
  });

  it("omits aria-pressed entirely when there's no onClick (purely decorative)", () => {
    render(<Chip>Display only</Chip>);
    expect(screen.getByRole("button").hasAttribute("aria-pressed")).toBe(false);
  });

  it("renders a count badge when `count` is provided", () => {
    render(<Chip count={90}>Active</Chip>);
    expect(screen.getByText("90")).toBeTruthy();
  });
  it("renders a count of 0 explicitly (not hidden via falsy check)", () => {
    render(<Chip count={0}>Sold</Chip>);
    expect(screen.getByText("0")).toBeTruthy();
  });

  it("renders the dot only when withDot is true and styles it with accent color", () => {
    const { container, rerender } = render(<Chip>No dot</Chip>);
    expect(container.querySelector(".chip-dot")).toBeNull();
    rerender(<Chip withDot accent="#ff0000">With dot</Chip>);
    const dot = container.querySelector(".chip-dot") as HTMLSpanElement;
    expect(dot).toBeTruthy();
    expect(dot.style.background).toMatch(/rgb\(255, 0, 0\)|#ff0000/i);
  });

  it("clear variant applies the --clear modifier", () => {
    render(<Chip variant="clear">Clear</Chip>);
    expect(screen.getByRole("button").className).toMatch(/chip--clear/);
  });

  it("disabled chips don't fire onClick", () => {
    const onClick = vi.fn();
    render(<Chip disabled onClick={onClick}>Disabled</Chip>);
    fireEvent.click(screen.getByRole("button"));
    expect(onClick).not.toHaveBeenCalled();
  });
});
