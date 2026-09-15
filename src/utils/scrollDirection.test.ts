import { describe, it, expect } from "vitest";
import { nextScrollState } from "./scrollDirection";

describe("nextScrollState", () => {
  it("is 'top' near the top regardless of direction", () => {
    expect(nextScrollState(40, 0, "down")).toBe("top");
    expect(nextScrollState(0, 5, "top")).toBe("top");
  });
  it("flips to down/up on real movement and ignores jitter", () => {
    expect(nextScrollState(100, 120, "up")).toBe("down");
    expect(nextScrollState(120, 100, "down")).toBe("up");
    expect(nextScrollState(100, 103, "down")).toBe("down");
    expect(nextScrollState(100, 98, "up")).toBe("up");
  });
  it("leaving the top counts as scrolling down even for a small delta", () => {
    expect(nextScrollState(4, 12, "top")).toBe("down");
    expect(nextScrollState(4, 10, "top")).toBe("down");
  });
});
