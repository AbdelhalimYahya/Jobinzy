import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Mock the storage module so the test never touches chrome.storage.
const clearAllDataMock = vi.fn();
vi.mock("../../lib/storage", () => ({
  clearAllData: (...args: unknown[]) => clearAllDataMock(...args),
}));

import { ClearDataControl } from "./ClearDataControl";

describe("ClearDataControl (12.5)", () => {
  beforeEach(() => {
    clearAllDataMock.mockReset();
    clearAllDataMock.mockResolvedValue(undefined);
  });

  it("requires a confirmation step before wiping anything", async () => {
    const onCleared = vi.fn();
    const user = userEvent.setup();
    render(<ClearDataControl onCleared={onCleared} />);

    // First click only arms the confirmation — nothing is cleared yet.
    await user.click(screen.getByRole("button", { name: "Clear all my data" }));
    expect(clearAllDataMock).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "Yes, delete everything" })
    ).toBeInTheDocument();

    // Confirming executes the wipe and reports completion.
    await user.click(screen.getByRole("button", { name: "Yes, delete everything" }));
    expect(clearAllDataMock).toHaveBeenCalledTimes(1);
    expect(onCleared).toHaveBeenCalledTimes(1);
  });

  it("cancel aborts without clearing", async () => {
    const onCleared = vi.fn();
    const user = userEvent.setup();
    render(<ClearDataControl onCleared={onCleared} />);

    await user.click(screen.getByRole("button", { name: "Clear all my data" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(clearAllDataMock).not.toHaveBeenCalled();
    expect(onCleared).not.toHaveBeenCalled();
    // Back to the idle state.
    expect(
      screen.getByRole("button", { name: "Clear all my data" })
    ).toBeInTheDocument();
  });

  it("surfaces a failure instead of claiming success", async () => {
    clearAllDataMock.mockRejectedValueOnce(new Error("storage unavailable"));
    const onCleared = vi.fn();
    const user = userEvent.setup();
    render(<ClearDataControl onCleared={onCleared} />);

    await user.click(screen.getByRole("button", { name: "Clear all my data" }));
    await user.click(screen.getByRole("button", { name: "Yes, delete everything" }));
    expect(await screen.findByText(/storage unavailable/)).toBeInTheDocument();
    expect(onCleared).not.toHaveBeenCalled();
  });
});
