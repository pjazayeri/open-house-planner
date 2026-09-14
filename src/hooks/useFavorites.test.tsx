// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useFavorites, toggleKey } from "./useFavorites";

describe("toggleKey", () => {
  it("adds then removes without mutating the input", () => {
    const a = new Set<string>();
    const b = toggleKey(a, "x|sf");
    expect(b.has("x|sf")).toBe(true);
    expect(a.size).toBe(0);
    expect(toggleKey(b, "x|sf").size).toBe(0);
  });
});

describe("useFavorites (guest — in-memory)", () => {
  it("toggles favorites and reports membership", () => {
    const { result } = renderHook(() => useFavorites("guest"));
    expect(result.current.favoriteIds.size).toBe(0);
    act(() => result.current.toggleFavorite("1 main st|san francisco"));
    expect(result.current.isFavorite("1 main st|san francisco")).toBe(true);
    act(() => result.current.toggleFavorite("1 main st|san francisco"));
    expect(result.current.favoriteIds.size).toBe(0);
    expect(result.current.saveFailed).toBe(false);
  });
});
