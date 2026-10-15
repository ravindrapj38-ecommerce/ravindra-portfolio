import { describe, expect, it } from "vitest";
import protectCases from "../../../fixtures/protect_cases.json";
import { protect, restore, segment, detectFormat, shared } from "@/lib/core";
import type { Format } from "@/lib/core";

describe("lock and restore (shared fixtures)", () => {
  for (const c of protectCases.cases) {
    it(c.id, () => {
      const p = protect(c.input, c.format as Format);
      expect(restore(p.text, p.table)).toBe(c.input);
      const values = Object.values(p.table);
      for (const item of c.locked) expect(values).toContain(item);
      for (const phrase of c.not_locked) expect(p.text).toContain(phrase);
      expect(segment(p.text, p.table).map((s) => s.text).join("")).toBe(p.text);
    });
  }
});

describe("restore(protect(x)) is the identity", () => {
  const atoms = [
    ..."abcXYZ019 .,;:()[]{}$\\^_-+=%°±×/\n\t`#*|~'\"⟦⟧µΩ",
    "\\cite{a}", "$x$", "$$y$$", "10^3 K", "H2O", "BRCA1", "https://a.b/c", "10.1000/x", "```\nz\n```",
    "\\begin{equation}a\\end{equation}", "Fig. 2", "(Smith, 2020)", "[12]", "⟦M1⟧", "e.g. ", "\\section{A}",
  ];
  // Deterministic pseudo-random generator so failures reproduce.
  let seed = 42;
  const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  it("holds for 1500 random STEM-like strings in every format", () => {
    for (let n = 0; n < 1500; n++) {
      const len = Math.floor(rand() * 60);
      const text = Array.from({ length: len }, () => atoms[Math.floor(rand() * atoms.length)]).join("");
      for (const fmt of ["text", "markdown", "latex"] as const) {
        const p = protect(text, fmt);
        expect(restore(p.text, p.table)).toBe(text);
        expect(segment(p.text, p.table).map((s) => s.text).join("")).toBe(p.text);
      }
    }
  });

  it("holds for the sample", () => {
    const p = protect(shared.sample, detectFormat(shared.sample));
    expect(restore(p.text, p.table)).toBe(shared.sample);
  });
});
