// @vitest-environment happy-dom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import { AuthScreen, DEMO_BIN_ID } from "./AuthScreen";

describe("AuthScreen demo button (regression: 'demo doesn't pull up share plan')", () => {
  it("opens the share plan URL with the exact bin-id format the SPA hash router expects", () => {
    const openSpy = vi.spyOn(window, "open").mockReturnValue(null);
    try {
      render(<AuthScreen onSignIn={vi.fn()} onGuest={vi.fn()} />);
      fireEvent.click(screen.getByText(/View Demo/i));

      expect(openSpy).toHaveBeenCalledTimes(1);
      const [url] = openSpy.mock.calls[0];
      // App.tsx's hash router only matches '#share?bin=...' — any other shape
      // (e.g. '?id=', '#demo=', a different prefix) routes to the auth gate
      // instead of the share view, which is exactly the "doesn't pull up
      // share plan" symptom.
      expect(url).toBe(`/#share?bin=${DEMO_BIN_ID}`);
    } finally {
      openSpy.mockRestore();
    }
  });

  it("DEMO_BIN_ID is a non-empty string (otherwise the button is hidden entirely)", () => {
    expect(typeof DEMO_BIN_ID).toBe("string");
    expect(DEMO_BIN_ID.length).toBeGreaterThan(0);
  });
});
