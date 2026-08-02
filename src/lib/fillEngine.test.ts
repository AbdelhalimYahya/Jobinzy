import { describe, it, expect, vi, beforeEach } from "vitest";
import type { DetectedField } from "./types";
import {
  fillComboBox,
  fillField,
  fillFields,
  fillSelect,
  flashHighlight,
  scrollIntoViewIfNeeded,
  setNativeValue,
  verifyFilled,
} from "./fillEngine";

function makeField(el: HTMLElement): DetectedField {
  return { elementRef: el, kind: "open-ended", questionText: "Q", confidence: "high" };
}

function makeSelectField(sel: HTMLSelectElement): DetectedField {
  return { elementRef: sel, kind: "profile", matchedProfileKey: "otherLink", questionText: "Q", confidence: "high" };
}

describe("fillEngine core (Phase 8, expanded in Phase 9)", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  it("9.1: fills an input via the native setter and dispatches input+change", () => {
    const el = document.createElement("input");
    document.body.appendChild(el);
    const inputSpy = vi.fn();
    const changeSpy = vi.fn();
    el.addEventListener("input", inputSpy);
    el.addEventListener("change", changeSpy);

    const result = fillField(makeField(el), "Sara Ahmed");

    expect(result.ok).toBe(true);
    expect(el.value).toBe("Sara Ahmed");
    expect(inputSpy).toHaveBeenCalled();
    expect(changeSpy).toHaveBeenCalled();
  });

  it("9.1: fills a textarea and the events bubble", () => {
    const el = document.createElement("textarea");
    document.body.appendChild(el);
    const bubbledInput = vi.fn();
    document.body.addEventListener("input", bubbledInput);

    fillField(makeField(el), "Long paragraph answer");

    expect(el.value).toBe("Long paragraph answer");
    expect(bubbledInput).toHaveBeenCalled();
  });

  it("9.1: setNativeValue uses the prototype setter (React-controlled inputs)", () => {
    const el = document.createElement("input");
    document.body.appendChild(el);
    const protoSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value"
    )?.set;
    expect(protoSetter).toBeTypeOf("function");
    setNativeValue(el, "via-setter");
    expect(el.value).toBe("via-setter");
  });

  it("9.2: fillSelect picks an exact match first", () => {
    const sel = document.createElement("select");
    ["Option One", "Option Two"].forEach((t) => {
      const o = document.createElement("option");
      o.value = t;
      o.textContent = t;
      sel.appendChild(o);
    });
    document.body.appendChild(sel);

    const result = fillSelect(sel, "Option Two");
    expect(result.ok).toBe(true);
    expect(sel.value).toBe("Option Two");
  });

  it("9.2: fillSelect falls back to a case-insensitive substring match", () => {
    const sel = document.createElement("select");
    ["Option One", "Option Two"].forEach((t) => {
      const o = document.createElement("option");
      o.value = t;
      o.textContent = t;
      sel.appendChild(o);
    });
    document.body.appendChild(sel);

    const result = fillSelect(sel, "option one");
    expect(result.ok).toBe(true);
    expect(sel.value).toBe("Option One");
  });

  it("9.2: fillSelect with no match leaves the field untouched and reports back", () => {
    const sel = document.createElement("select");
    ["Option One", "Option Two"].forEach((t) => {
      const o = document.createElement("option");
      o.value = t;
      o.textContent = t;
      sel.appendChild(o);
    });
    document.body.appendChild(sel);
    // User had already picked an option — a failed match must not change it.
    sel.value = "Option Two";

    const result = fillSelect(sel, "Zebra");
    expect(result.ok).toBe(false);
    expect(result.message).toContain("No matching option");
    expect(sel.value).toBe("Option Two");
  });

  it("9.2: fillField routes a select through fillSelect", () => {
    const sel = document.createElement("select");
    const o = document.createElement("option");
    o.value = "yes";
    o.textContent = "Yes";
    sel.appendChild(o);
    document.body.appendChild(sel);

    const result = fillField(makeField(sel), "Yes");
    expect(result.ok).toBe(true);
    expect(sel.value).toBe("yes");
  });

  it("9.4: flashHighlight applies then removes the highlight", () => {
    vi.useFakeTimers();
    try {
      const el = document.createElement("input");
      flashHighlight(el);
      expect(el.style.outline).toContain("2px solid");
      vi.advanceTimersByTime(600);
      expect(el.style.outline).toBe("");
    } finally {
      vi.useRealTimers();
    }
  });

  it("9.4: scrollIntoViewIfNeeded scrolls when the element is out of view", () => {
    const scrollSpy = vi.fn();
    Element.prototype.scrollIntoView = scrollSpy;
    const el = document.createElement("input");
    // jsdom getBoundingClientRect returns zeros → height 0 → not "visible".
    scrollIntoViewIfNeeded(el);
    expect(scrollSpy).toHaveBeenCalled();
  });

  it("9.6: verifyFilled catches a page that resets the value after fill", () => {
    const el = document.createElement("input");
    el.value = "expected";
    expect(verifyFilled(el, "expected")).toBe(true);

    // Simulate the page clearing the field right after our fill.
    el.value = "";
    expect(verifyFilled(el, "expected")).toBe(false);
  });

  it("9.5: fillFields never touches a skipped entry, even with a value", async () => {
    const el = document.createElement("input");
    document.body.appendChild(el);

    const results = await fillFields([
      { field: makeField(el), value: "should-not-write", skip: true },
    ]);

    expect(results).toEqual([]);
    expect(el.value).toBe("");
  });

  it("9.5/9.6: fillFields fills accepted entries and reports mismatch on page reset", async () => {
    const name = document.createElement("input");
    document.body.appendChild(name);
    // The page immediately clears this field (simulating a reset script).
    const resettable = document.createElement("input");
    document.body.appendChild(resettable);
    resettable.addEventListener("change", () => {
      resettable.value = "";
    });

    const results = await fillFields([
      { field: makeField(name), value: "Sara", skip: false },
      { field: makeField(resettable), value: "doomed", skip: false },
    ]);

    const nameResult = results.find((r) => r.field.elementRef === name)!;
    expect(nameResult.ok).toBe(true);
    expect(nameResult.mismatch).toBe(false);
    expect(name.value).toBe("Sara");

    const resetResult = results.find((r) => r.field.elementRef === resettable)!;
    expect(resetResult.ok).toBe(true);
    expect(resetResult.mismatch).toBe(true);
    expect(resettable.value).toBe("");
  });

  it("9.5/9.6: fillFields routes selects and reports no-match failures", async () => {
    const sel = document.createElement("select");
    ["Option One", "Option Two"].forEach((t) => {
      const o = document.createElement("option");
      o.value = t;
      o.textContent = t;
      sel.appendChild(o);
    });
    document.body.appendChild(sel);

    const okResults = await fillFields([
      { field: makeSelectField(sel), value: "Option One", skip: false },
    ]);
    expect(okResults[0].ok).toBe(true);
    expect(sel.value).toBe("Option One");

    const failResults = await fillFields([
      { field: makeSelectField(sel), value: "Zebra", skip: false },
    ]);
    expect(failResults[0].ok).toBe(false);
    expect(failResults[0].message).toContain("No matching option");
  });

  it("9.3: fillComboBox selects a matching rendered option", async () => {
    const box = document.createElement("input");
    box.setAttribute("role", "combobox");
    document.body.appendChild(box);
    const opt = document.createElement("li");
    opt.setAttribute("role", "option");
    opt.textContent = "Cairo";
    document.body.appendChild(opt);

    const result = await fillComboBox(box, "Cairo", { waitMs: 100 });
    expect(result.ok).toBe(true);
  });

  it("9.3: fillComboBox reports manual completion when nothing matches", async () => {
    const box = document.createElement("input");
    box.setAttribute("role", "combobox");
    document.body.appendChild(box);

    const result = await fillComboBox(box, "NoSuchCity", { waitMs: 0 });
    expect(result.ok).toBe(false);
    expect(result.message).toContain("manually");
  });

  it("9.3: fillFields routes combobox fields through the async best-effort path", async () => {
    const box = document.createElement("input");
    box.setAttribute("role", "combobox");
    document.body.appendChild(box);
    const opt = document.createElement("li");
    opt.setAttribute("role", "option");
    opt.textContent = "Alexandria";
    document.body.appendChild(opt);

    const results = await fillFields([
      { field: makeField(box), value: "Alexandria", skip: false },
    ]);
    expect(results[0].ok).toBe(true);
  });
});
