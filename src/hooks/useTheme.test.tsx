// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { act, renderHook } from "@testing-library/react";

import { useTheme } from "./useTheme";

// Minimal Storage shim — happy-dom's localStorage doesn't expose .clear() in
// all versions, and we want explicit control anyway.
function makeStorage(initial: Record<string, string> = {}): Storage {
  const data: Record<string, string> = { ...initial };
  return {
    get length() { return Object.keys(data).length; },
    clear: () => { for (const k of Object.keys(data)) delete data[k]; },
    getItem: (k: string) => (k in data ? data[k] : null),
    key: (i: number) => Object.keys(data)[i] ?? null,
    removeItem: (k: string) => { delete data[k]; },
    setItem: (k: string, v: string) => { data[k] = String(v); },
  };
}

function mockMatchMedia(prefersLight: boolean) {
  const mql = (query: string) =>
    ({
      matches: query.includes("light") ? prefersLight : !prefersLight,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
      onchange: null,
    }) as MediaQueryList;
  Object.defineProperty(window, "matchMedia", { value: mql, configurable: true, writable: true });
}

beforeEach(() => {
  Object.defineProperty(window, "localStorage", {
    value: makeStorage(),
    configurable: true,
    writable: true,
  });
  document.documentElement.removeAttribute("data-theme");
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useTheme", () => {
  it("defaults to dark when localStorage is empty and prefers-color-scheme is dark", () => {
    mockMatchMedia(false);
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("defaults to light when localStorage is empty and prefers-color-scheme is light", () => {
    mockMatchMedia(true);
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe("light");
    expect(document.documentElement.dataset.theme).toBe("light");
  });

  it("honors a stored theme over the OS preference", () => {
    mockMatchMedia(true); // OS says light…
    window.localStorage.setItem("theme", "dark"); // …user chose dark
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe("dark");
  });

  it("toggleTheme flips the theme, writes data-theme, and persists to localStorage", () => {
    mockMatchMedia(false);
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe("dark");

    act(() => result.current.toggleTheme());
    expect(result.current.theme).toBe("light");
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(window.localStorage.getItem("theme")).toBe("light");

    act(() => result.current.toggleTheme());
    expect(result.current.theme).toBe("dark");
    expect(window.localStorage.getItem("theme")).toBe("dark");
  });

  it("setTheme can be called directly", () => {
    mockMatchMedia(false);
    const { result } = renderHook(() => useTheme());
    act(() => result.current.setTheme("light"));
    expect(result.current.theme).toBe("light");
    expect(document.documentElement.dataset.theme).toBe("light");
  });
});
