// @vitest-environment happy-dom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { CsvUploadPrompt } from "./CsvUploadPrompt";
import { CSV_ACCEPT } from "../utils/csvUpload";

afterEach(cleanup);

describe("CsvUploadPrompt", () => {
  it("accepts every CSV MIME spelling and shows phone steps on iPhone", () => {
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)");
    const { container } = render(<CsvUploadPrompt onUpload={async () => 0} />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input.getAttribute("accept")).toBe(CSV_ACCEPT);
    expect(screen.getByLabelText("How to get the CSV").textContent).toMatch(/Files/);
  });

  it("shows the desktop steps elsewhere and the catalog skip when offered", () => {
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue("Mozilla/5.0 (Windows NT 10.0)");
    render(<CsvUploadPrompt onUpload={async () => 0} onSkip={() => {}} />);
    expect(screen.getByLabelText("How to get the CSV").querySelectorAll("li")).toHaveLength(2);
    expect(screen.getByText(/Browse the catalog instead/)).toBeTruthy();
  });
});
