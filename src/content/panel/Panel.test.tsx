import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, within, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { act } from "react";
import { installChromeMock, resetChromeStore } from "../../test/chromeMock";
import { setAISettings, setProfile } from "../../lib/storage";
import type { AISettings, DetectedField, Profile } from "../../lib/types";
import { Panel } from "./Panel";

installChromeMock();

// Mock the AI layer so the panel can never fire a real network call.
// The factory only closes over the mocks (lazily evaluated), matching the
// pattern already used in AnswerBankView.test.tsx.
const resolveAnswerMock = vi.fn();
const regenerateMock = vi.fn();
vi.mock("../../lib/answerGen", () => ({
  resolveAnswer: (...args: unknown[]) => resolveAnswerMock(...args),
  regenerateWithInstruction: (...args: unknown[]) => regenerateMock(...args),
}));

/** Builds real DOM elements + DetectedFields for the panel to act on. */
function buildFormFields(): DetectedField[] {
  document.body.innerHTML = `
    <form>
      <label for="name">Full Name</label><input id="name" name="name" />
      <label for="why">Why do you want this role?</label><textarea id="why" name="why"></textarea>
      <input type="file" id="cv" name="cv" />
    </form>
  `;
  return [
    {
      elementRef: document.getElementById("name") as HTMLElement,
      kind: "profile",
      matchedProfileKey: "fullName",
      questionText: "Full Name",
      confidence: "high",
    },
    {
      elementRef: document.getElementById("why") as HTMLElement,
      kind: "open-ended",
      questionText: "Why do you want this role?",
      confidence: "ai",
    },
    {
      elementRef: document.getElementById("cv") as HTMLElement,
      kind: "file-or-link",
      questionText: "Attach your CV",
      note: "This form wants your CV file",
      confidence: "high",
    },
  ];
}

async function seedProfile(): Promise<void> {
  const profile: Profile = {
    fullName: "Sara Ahmed",
    email: "sara@example.com",
    phone: "+201234567890",
    nationalId: "29901010123456",
    address: "Cairo",
    links: [{ label: "LinkedIn", url: "https://linkedin.com/in/sara" }],
    cvText: "Software engineer with 5 years of experience.",
    structuredCv: { education: [], experience: [], skills: ["TypeScript"] },
    onboardingQA: [],
    defaultStyle: "professional, concise",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const settings: AISettings = {
    provider: "byo",
    baseUrl: "https://api.openai.com/v1",
    apiKey: "sk-test",
    model: "gpt-4o-mini",
  };
  await setProfile(profile);
  await setAISettings(settings);
}

describe("Panel (Phase 8)", () => {
  beforeEach(async () => {
    resetChromeStore();
    await seedProfile();
    resolveAnswerMock.mockReset();
    regenerateMock.mockReset();
    resolveAnswerMock.mockResolvedValue({ answer: "Because my skills fit the role.", fromBank: false });
  });

  it("8.1: renders one row per non-file field with status chip + confidence", async () => {
    const fields = buildFormFields();
    render(<Panel fields={fields} onClose={() => {}} />);

    // Two main-list rows (name + why); the file row lives in its own section.
    await screen.findByText("Auto-filled");
    await screen.findByText("AI-generated");
    const rows = screen.getAllByRole("listitem");
    expect(rows).toHaveLength(2);

    // Confidence indicators from 5.8 are visible.
    expect(screen.getByText("high")).toBeInTheDocument();
    expect(screen.getByText("AI")).toBeInTheDocument();

    // Answers are resolved (profile from storage, open-ended via AI).
    expect(screen.getByText("Sara Ahmed")).toBeInTheDocument();
    expect(screen.getByText("Because my skills fit the role.")).toBeInTheDocument();
  });

  it("8.2: toggling skip on one row doesn't affect another; edit is per-row", async () => {
    const fields = buildFormFields();
    render(<Panel fields={fields} onClose={() => {}} />);
    await screen.findByText("AI-generated");
    const user = userEvent.setup();

    const rows = screen.getAllByRole("listitem");
    // Skip the name row — the why row's Accept stays pressed.
    await user.click(within(rows[0]).getByRole("button", { name: "Skip" }));
    expect(within(rows[0]).getByRole("button", { name: "Skip" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(within(rows[1]).getByRole("button", { name: "Accept" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );

    // Edit only the why row; name row's answer is untouched.
    await user.click(within(rows[1]).getByRole("button", { name: "Edit" }));
    const textarea = within(rows[1]).getByRole("textbox");
    await user.clear(textarea);
    await user.type(textarea, "My own words");
    await user.click(within(rows[1]).getByRole("button", { name: "Save" }));
    expect(await within(rows[1]).findByText("My own words")).toBeInTheDocument();
    expect(screen.getByText("Sara Ahmed")).toBeInTheDocument();
  });

  it("7.4/8.2: rewrite flow regenerates with the instruction", async () => {
    regenerateMock.mockResolvedValue("Much shorter answer.");
    const fields = buildFormFields();
    render(<Panel fields={fields} onClose={() => {}} />);
    await screen.findByText("AI-generated");
    const user = userEvent.setup();

    const rows = screen.getAllByRole("listitem");
    await user.click(within(rows[1]).getByRole("button", { name: "Rewrite" }));
    const instruction = within(rows[1]).getByRole("textbox");
    await user.type(instruction, "make this much shorter");
    await user.click(within(rows[1]).getByRole("button", { name: "Generate" }));

    expect(regenerateMock).toHaveBeenCalledWith(
      expect.anything(),
      "make this much shorter",
      expect.anything(),
      expect.anything()
    );
    expect(await within(rows[1]).findByText("Much shorter answer.")).toBeInTheDocument();
  });

  it("7.3: bank-served answers show the reused indicator + Rewrite control", async () => {
    resolveAnswerMock.mockResolvedValue({ answer: "Saved bank answer", fromBank: true });
    const fields = buildFormFields();
    render(<Panel fields={fields} onClose={() => {}} />);

    expect(await screen.findByText(/From answer bank/)).toBeInTheDocument();
    expect(screen.getByText(/reused/)).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Rewrite" }).length).toBeGreaterThan(0);
  });

  it("8.3: file/link section shows guidance; 'Show me' scrolls and highlights", async () => {
    const scrollSpy = vi.fn();
    Element.prototype.scrollIntoView = scrollSpy;
    const fields = buildFormFields();
    render(<Panel fields={fields} onClose={() => {}} />);

    expect(screen.getByText("File & link fields")).toBeInTheDocument();
    expect(screen.getByText(/wants your CV file/)).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Show me" }));
    expect(scrollSpy).toHaveBeenCalled();
    const cv = document.getElementById("cv") as HTMLElement;
    expect(cv.style.outline).toContain("2px solid");
  });

  it("8.4: Fill form writes accepted values into the real DOM", async () => {
    const fields = buildFormFields();
    render(<Panel fields={fields} onClose={() => {}} />);
    await screen.findByText("AI-generated");
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Fill form" }));

    expect((document.getElementById("name") as HTMLInputElement).value).toBe("Sara Ahmed");
    expect((document.getElementById("why") as HTMLTextAreaElement).value).toBe(
      "Because my skills fit the role."
    );
    // 9.6 post-fill verification passed — no mismatch warning.
    expect(screen.queryByText(/didn't keep this value/)).not.toBeInTheDocument();
  });

  it("8.5: editing after fill re-fills just that field; Close calls onClose", async () => {
    const onClose = vi.fn();
    const fields = buildFormFields();
    render(<Panel fields={fields} onClose={onClose} />);
    await screen.findByText("AI-generated");
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Fill form" }));
    expect((document.getElementById("why") as HTMLTextAreaElement).value).toBe(
      "Because my skills fit the role."
    );

    // Edit the why row after filling → only that field is re-filled.
    const rows = screen.getAllByRole("listitem");
    await user.click(within(rows[1]).getByRole("button", { name: "Edit" }));
    const textarea = within(rows[1]).getByRole("textbox");
    await user.clear(textarea);
    await user.type(textarea, "New answer after fill");
    await user.click(within(rows[1]).getByRole("button", { name: "Save" }));
    expect((document.getElementById("why") as HTMLTextAreaElement).value).toBe(
      "New answer after fill"
    );
    // Name row untouched.
    expect((document.getElementById("name") as HTMLInputElement).value).toBe("Sara Ahmed");

    // Close removes the whole injected UI.
    await user.click(screen.getByRole("button", { name: "Close panel" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("8.6: collapse hides the body and expand restores it", async () => {
    const fields = buildFormFields();
    render(<Panel fields={fields} onClose={() => {}} />);
    const user = userEvent.setup();

    expect(screen.getByRole("button", { name: "Fill form" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Collapse panel" }));
    expect(screen.queryByRole("button", { name: "Fill form" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Expand panel" }));
    expect(screen.getByRole("button", { name: "Fill form" })).toBeInTheDocument();
  });

  it("8.6: dragging the header repositions the panel", async () => {
    const fields = buildFormFields();
    render(<Panel fields={fields} onClose={() => {}} />);

    const header = document.querySelector(".jbz-panel-header") as HTMLElement;
    // jsdom getBoundingClientRect returns zeros → dx/dy = initial coords.
    // Use mouse events: jsdom doesn't dispatch React pointer handlers, and
    // the component wires both pointer and mouse drag paths (8.6).
    fireEvent.mouseDown(header, { clientX: 100, clientY: 100, bubbles: true });
    fireEvent.mouseMove(header, { clientX: 250, clientY: 150, bubbles: true });
    fireEvent.mouseUp(header, { bubbles: true });

    const panel = document.querySelector(".jbz-panel") as HTMLElement;
    expect(panel.style.left).toBe("150px");
    expect(panel.style.top).toBe("50px");
  });

  it("8.7: Escape closes the panel", async () => {
    const onClose = vi.fn();
    const fields = buildFormFields();
    render(<Panel fields={fields} onClose={onClose} />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("8.8: one field loading doesn't block other rows", async () => {
    let resolvePending!: (v: { answer: string; fromBank: boolean }) => void;
    resolveAnswerMock.mockImplementationOnce(
      () =>
        new Promise((res) => {
          resolvePending = res;
        })
    );
    const fields = buildFormFields();
    render(<Panel fields={fields} onClose={() => {}} />);
    const user = userEvent.setup();

    // Name row (profile) resolves; the why row stays in a loading state.
    await screen.findByText("Auto-filled");
    expect(screen.getByText("Generating…")).toBeInTheDocument();

    // Other rows remain usable while one is generating.
    const rows = screen.getAllByRole("listitem");
    await user.click(within(rows[0]).getByRole("button", { name: "Skip" }));
    expect(within(rows[0]).getByRole("button", { name: "Skip" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );

    // Resolve the pending generation → the row updates.
    await act(async () => {
      resolvePending({ answer: "Done at last", fromBank: false });
    });
    expect(await screen.findByText("AI-generated")).toBeInTheDocument();
    expect(screen.getByText("Done at last")).toBeInTheDocument();
  });

  it("6.7: a failing field shows an error + Retry without breaking the rest", async () => {
    resolveAnswerMock.mockRejectedValueOnce(new Error("AI request failed (401): bad key"));
    const fields = buildFormFields();
    render(<Panel fields={fields} onClose={() => {}} />);
    const user = userEvent.setup();

    // The profile row still resolves fine.
    await screen.findByText("Auto-filled");
    expect(await screen.findByText("Error")).toBeInTheDocument();
    expect(screen.getByText(/bad key/)).toBeInTheDocument();

    // Retry with the provider now working recovers the field.
    resolveAnswerMock.mockResolvedValue({ answer: "Recovered", fromBank: false });
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("Recovered")).toBeInTheDocument();
    expect(screen.queryByText("Error")).not.toBeInTheDocument();
  });
});
