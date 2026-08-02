import { describe, it, expect, beforeEach } from "vitest";
import { installChromeMock } from "../../test/chromeMock";
import { collectCandidates, isInteractive } from "./scan";
import { extractContext } from "./context";
import { classifyByRules, looksOpenEnded } from "./classifyRules";
import { isFileOrLinkField } from "./classifyFileLink";
import type { FieldContext } from "../types";

installChromeMock();

describe("collectCandidates (5.1)", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("collects input, textarea, select, combobox, and shadow-root fields", () => {
    const host = document.createElement("div");
    const shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = `<input id="shadow-input" />`;
    document.body.innerHTML = `
      <input id="a" />
      <textarea id="b"></textarea>
      <select id="c"><option>1</option></select>
      <div role="textbox" id="d"></div>
      <div role="combobox" id="e"></div>
    `;
    document.body.appendChild(host);

    const ids = collectCandidates(document).map((el) => el.id).sort();
    expect(ids).toContain("a");
    expect(ids).toContain("b");
    expect(ids).toContain("c");
    expect(ids).toContain("d");
    expect(ids).toContain("e");
    expect(ids).toContain("shadow-input");
  });

  it("isInteractive excludes hidden/disabled/hidden-type fields (5.9)", () => {
    document.body.innerHTML = `
      <input id="ok" />
      <input id="h" type="hidden" />
      <input id="dis" disabled />
      <input id="hidden-attr" hidden />
    `;
    const ok = document.getElementById("ok") as HTMLElement;
    expect(isInteractive(ok)).toBe(true);
    expect(isInteractive(document.getElementById("h") as HTMLElement)).toBe(false);
    expect(isInteractive(document.getElementById("dis") as HTMLElement)).toBe(false);
    expect(isInteractive(document.getElementById("hidden-attr") as HTMLElement)).toBe(false);
  });
});

describe("extractContext (5.2)", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("resolves a <label for> association", () => {
    document.body.innerHTML = `
      <label for="name">Full Name</label>
      <input id="name" />
    `;
    const ctx = extractContext(document.getElementById("name") as HTMLElement);
    expect(ctx.labelText).toBe("Full Name");
  });

  it("uses aria-labelledby and aria-label", () => {
    document.body.innerHTML = `
      <span id="lbl">Email</span>
      <input id="e1" aria-labelledby="lbl" />
      <input id="e2" aria-label="Phone" />
    `;
    expect(extractContext(document.getElementById("e1") as HTMLElement).labelText).toBe("Email");
    expect(extractContext(document.getElementById("e2") as HTMLElement).ariaLabel).toBe("Phone");
  });

  it("falls back to nearest preceding text sibling", () => {
    document.body.innerHTML = `<div>Question text here</div><input id="q" />`;
    const ctx = extractContext(document.getElementById("q") as HTMLElement);
    expect(ctx.nearbyText).toContain("Question text here");
  });

  it("captures placeholder, name, id", () => {
    document.body.innerHTML = `<input id="pid" name="pname" placeholder="Enter here" />`;
    const ctx = extractContext(document.getElementById("pid") as HTMLElement);
    expect(ctx.placeholder).toBe("Enter here");
    expect(ctx.name).toBe("pname");
    expect(ctx.id).toBe("pid");
  });
});

describe("classifyByRules (5.3)", () => {
  function ctxFrom(label: string): FieldContext {
    return { labelText: label };
  }

  const englishCases: [string, string][] = [
    ["Full Name", "fullName"],
    ["First Name", "firstName"],
    ["Last Name", "lastName"],
    ["Email Address", "email"],
    ["Phone Number", "phone"],
    ["Mobile", "phone"],
    ["National ID", "nationalId"],
    ["ID Number", "nationalId"],
    ["Address", "address"],
    ["LinkedIn URL", "linkedin"],
    ["GitHub Profile", "github"],
    ["Portfolio Link", "portfolio"],
    ["Google Drive link", "drive"],
    ["Your Website", "otherLink"],
  ];

  const arabicCases: [string, string][] = [
    ["الاسم الكامل", "fullName"],
    ["البريد الإلكتروني", "email"],
    ["رقم الهاتف", "phone"],
    ["الرقم القومي", "nationalId"],
    ["العنوان", "address"],
    ["لينكد إن", "linkedin"],
  ];

  it("resolves documented English examples", () => {
    for (const [label, expected] of englishCases) {
      expect(classifyByRules(ctxFrom(label))).toBe(expected);
    }
  });

  it("resolves documented Arabic examples", () => {
    for (const [label, expected] of arabicCases) {
      expect(classifyByRules(ctxFrom(label))).toBe(expected);
    }
  });

  it("returns null for an open-ended question", () => {
    expect(classifyByRules(ctxFrom("Why do you want this role?"))).toBeNull();
  });
});

describe("looksOpenEnded (5.4 gate)", () => {
  it("detects EN and AR open-ended questions", () => {
    expect(looksOpenEnded({ labelText: "Tell us about yourself" })).toBe(true);
    expect(looksOpenEnded({ labelText: "لماذا تريد هذه الوظيفة" })).toBe(true);
    expect(looksOpenEnded({ labelText: "Full Name" })).toBe(false);
  });
});

describe("isFileOrLinkField (5.5)", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("flags a real input[type=file]", () => {
    document.body.innerHTML = `<input type="file" id="f" />`;
    const el = document.getElementById("f") as HTMLElement;
    expect(isFileOrLinkField(el, {})).toBe(true);
  });

  it("flags a text field near 'Please attach your CV'", () => {
    expect(isFileOrLinkField(document.createElement("input"), { nearbyText: "Please attach your CV" })).toBe(true);
  });

  it("flags Arabic upload phrasing", () => {
    expect(isFileOrLinkField(document.createElement("input"), { labelText: "أرفق سيرتك الذاتية" })).toBe(true);
  });

  it("does not flag a plain name field", () => {
    expect(isFileOrLinkField(document.createElement("input"), { labelText: "Full Name" })).toBe(false);
  });
});
