import { describe, expect, it } from "vitest";
import { exampleReport } from "@/lib/example";

describe("landing page example", () => {
  it("shows four verified rewrites and one rejected hedge change", async () => {
    const r = await exampleReport();
    expect(r.sentences.map((s) => s.status)).toEqual(["verified", "kept_original", "verified", "verified", "verified"]);
    expect(r.sentences.filter((s) => s.final !== s.original)).toHaveLength(4);
    const rejected = r.sentences[1]!;
    expect(rejected.final).toBe(rejected.original);
    expect(rejected.issues.some((i) => i.code.includes("hedge") || /certainty/i.test(i.message))).toBe(true);
    expect(r.fidelity_score).toBe(100);
    expect(r.locked.length).toBeGreaterThanOrEqual(8);
    for (const item of r.locked) expect(r.output).toContain(item.text);
  });
});
