import { describe, it, expect } from "vitest";
import { normalizeQuestion } from "./answerBank";

describe("normalizeQuestion (7.2)", () => {
  it("lowercases and trims", () => {
    expect(normalizeQuestion("  Why Do You Want This Role  ")).toBe(
      "why do you want this role"
    );
  });

  it("strips trailing English question mark", () => {
    expect(normalizeQuestion("Why do you want this role?")).toBe(
      "why do you want this role"
    );
  });

  it("strips trailing Arabic question mark", () => {
    expect(normalizeQuestion("لماذا تريد هذه الوظيفة؟")).toBe(
      "لماذا تريد هذه الوظيفة"
    );
  });

  it("normalizes English variants identically", () => {
    expect(normalizeQuestion("Why do you want this role?")).toBe(
      normalizeQuestion("why do you want this role")
    );
  });

  it("normalizes Arabic variants identically", () => {
    expect(normalizeQuestion("لماذا تريد هذه الوظيفة؟")).toBe(
      normalizeQuestion("لماذا تريد هذه الوظيفة")
    );
  });

  it("collapses repeated whitespace", () => {
    expect(normalizeQuestion("Tell   us   about   yourself  ")).toBe(
      "tell us about yourself"
    );
  });
});
