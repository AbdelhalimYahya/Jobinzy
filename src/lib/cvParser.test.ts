import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the AI client before importing cvParser so structureCv uses the stub.
const generateMock = vi.fn();
vi.mock("./aiClient", () => ({
  generate: (...args: unknown[]) => generateMock(...args),
  trimPrompt: (p: string) => p,
  MAX_PROMPT_CHARS: 12000,
  DEFAULT_MAX_TOKENS: 600,
}));

import { structureCv } from "./cvParser";
import type { AISettings } from "./types";

const settings: AISettings = {
  provider: "nvidia-free",
  baseUrl: "https://integrate.api.nvidia.com/v1",
  apiKey: "nvkey",
  model: "meta/llama-3.1-8b-instruct",
};

describe("structureCv (2.4)", () => {
  beforeEach(() => {
    generateMock.mockReset();
  });

  it("parses a well-formed JSON response", async () => {
    generateMock.mockResolvedValue(
      '{"education":["Cairo University"],"experience":["SWE at Acme"],"skills":["TypeScript"]}'
    );
    const result = await structureCv("cv text", settings);
    expect(result.education).toEqual(["Cairo University"]);
    expect(result.experience).toEqual(["SWE at Acme"]);
    expect(result.skills).toEqual(["TypeScript"]);
  });

  it("tolerates markdown-fenced responses", async () => {
    generateMock.mockResolvedValue(
      '```json\n{"education":[],"experience":[],"skills":["Python"]}\n```'
    );
    const result = await structureCv("cv", settings);
    expect(result.skills).toEqual(["Python"]);
  });

  it("returns empty arrays on a deliberately malformed response (does not throw)", async () => {
    generateMock.mockResolvedValue("sorry, I cannot do that");
    const result = await structureCv("cv", settings);
    expect(result).toEqual({ education: [], experience: [], skills: [] });
  });

  it("returns empty arrays when the AI call rejects (does not throw)", async () => {
    generateMock.mockRejectedValue(new Error("network down"));
    const result = await structureCv("cv", settings);
    expect(result).toEqual({ education: [], experience: [], skills: [] });
  });
});
