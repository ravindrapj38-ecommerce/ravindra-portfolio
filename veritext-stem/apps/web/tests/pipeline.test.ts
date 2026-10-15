import { describe, expect, it } from "vitest";
import golden from "../../../fixtures/golden_demo_reports.json";
import { demoProvider, runPipeline, type RewriteProvider } from "@/lib/core";

describe("parity with the Python engine", () => {
  for (const c of golden.cases) {
    it(`matches the engine's report for ${c.id}`, async () => {
      const report = await runPipeline(c.text, demoProvider);
      expect(report).toEqual(c.report);
    });
  }
});

describe("repair loop", () => {
  const TEXT = "The data suggest that strain may shift the G peak by 2.4 cm^-1 [3]. The defects did not alter the peak.";

  it("retries a failing sentence 3 times, then keeps the original", async () => {
    const calls: string[][][] = [];
    const p: RewriteProvider = {
      name: "bad",
      label: "bad",
      async rewrite(req) {
        calls.push(req.feedback);
        return req.sentences.map((s) => s.replace("may shift", "proves to shift").replace("suggest", "show"));
      },
    };
    const r = await runPipeline(TEXT, p);
    expect(r.sentences[0]!.status).toBe("kept_original");
    expect(r.sentences[0]!.attempts).toBe(4);
    expect(r.output).toBe(TEXT);
    expect(calls[1]![0]![0]).toContain("Certainty changed");
  });

  it("keeps originals and warns when the provider throws", async () => {
    const p: RewriteProvider = {
      name: "broken",
      label: "broken",
      async rewrite() {
        throw { code: "not_granted", message: "declined" };
      },
    };
    const r = await runPipeline(TEXT, p);
    expect(r.output).toBe(TEXT);
    expect(r.warnings[0]).toContain("not_granted");
  });
});
