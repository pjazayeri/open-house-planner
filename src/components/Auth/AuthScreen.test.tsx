// @vitest-environment happy-dom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

import { AuthScreen } from "./AuthScreen";

describe("AuthScreen demo button (regression: was opening a shared-plan window)", () => {
  it("clicking View Demo invokes onDemo() — NOT window.open / share-plan URL", () => {
    const openSpy = vi.spyOn(window, "open").mockReturnValue(null);
    const onDemo = vi.fn();
    try {
      render(<AuthScreen onSignIn={vi.fn()} onGuest={vi.fn()} onDemo={onDemo} />);
      fireEvent.click(screen.getByText(/View Demo/i));
      expect(onDemo).toHaveBeenCalledTimes(1);
      // The old behavior was window.open(`/#share?bin=…`, "_blank"). It must
      // not fire under any code path — demo mode is in-app now.
      expect(openSpy).not.toHaveBeenCalled();
    } finally {
      openSpy.mockRestore();
      cleanup();
    }
  });

  it("clicking Continue as Guest invokes onGuest() and not onDemo()", () => {
    const onGuest = vi.fn();
    const onDemo = vi.fn();
    render(<AuthScreen onSignIn={vi.fn()} onGuest={onGuest} onDemo={onDemo} />);
    fireEvent.click(screen.getByText(/Continue as Guest/i));
    expect(onGuest).toHaveBeenCalledTimes(1);
    expect(onDemo).not.toHaveBeenCalled();
    cleanup();
  });
});
