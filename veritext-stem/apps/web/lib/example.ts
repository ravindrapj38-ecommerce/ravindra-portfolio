// The worked example on the landing page. It is a real run of the pipeline on the sample paragraph
// with scripted rewrites, including one bad rewrite (a hedge turned into a firm claim) so visitors
// see a rejection as the checks actually report it. tests/example.test.ts pins the outcome.
import { runPipeline, shared, type RewriteProvider } from "@/lib/core";
import type { Report } from "@/lib/core/types";

const EDITS: [RegExp, string][] = [
  [/^It is worth noting that the thermal conductivity of the graphene films was measured using/, "We measured the thermal conductivity of the graphene films with"],
  // Deliberately wrong: "suggest … may decrease" becomes "prove … decreases".
  [/^We delve into the results, which suggest that the conductivity may decrease to/, "The results prove that the conductivity decreases to"],
  [/^Furthermore, a large number of samples exhibited/, "Many samples also showed"],
  [/, and in order to rule out laser heating, the incident power was kept below/, "; to rule out laser heating, we kept the incident power below"],
  [/, and the code used for the fit is available at/, "; the fitting code is available at"],
];

const scripted: RewriteProvider = {
  name: "example",
  label: "Example run",
  async rewrite(req) {
    return req.sentences.map((s) => EDITS.reduce((out, [from, to]) => out.replace(from, to), s));
  },
};

export const exampleReport = (): Promise<Report> => runPipeline(shared.sample, scripted, { discipline: "physics", register: "journal" });
