import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
// @ts-expect-error plain JS build script without types
import { renderShared } from "../scripts/sync-shared.mjs";

it("lib/core/generated/shared.ts is in sync with veritext-stem/shared and prompts (run pnpm sync-shared)", () => {
  const current = readFileSync(join(import.meta.dirname, "..", "lib", "core", "generated", "shared.ts"), "utf8");
  expect(current).toBe(renderShared());
});
