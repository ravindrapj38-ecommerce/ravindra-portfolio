import { describe, expect, it } from "vitest";
import checkCases from "../../../fixtures/check_cases.json";
import { checkSentence, hedgeClass, lint, wordDiff } from "@/lib/core";

describe("sentence checks (shared fixtures)", () => {
  for (const c of checkCases.cases) {
    it(c.id, () => {
      const hard = [...new Set(checkSentence(c.original, c.rewritten).filter((i) => i.severity === "hard").map((i) => i.code))];
      expect(hard.sort()).toEqual([...c.fail].sort());
    });
  }

  it("classifies hedging", () => {
    expect(hedgeClass("X may cause Y")).toBe("hedged");
    expect(hedgeClass("This proves X")).toBe("boosted");
    expect(hedgeClass("X causes Y")).toBe("neutral");
  });

  it("word diff reconstructs both sides", () => {
    const a = "The film was measured at 300 K.";
    const b = "We measured the film at 300 K.";
    const ops = wordDiff(a, b);
    expect(ops.filter((o) => o.op !== "insert").map((o) => o.text).join("")).toBe(a);
    expect(ops.filter((o) => o.op !== "delete").map((o) => o.text).join("")).toBe(b);
  });

  it("flags overused phrases", () => {
    const hits = lint("It is worth noting that we delve into this. Furthermore, it underscores the point.");
    expect(hits.map((h) => h.phrase)).toEqual(["it is worth noting that", "delve", "furthermore", "underscore"]);
  });
});
