// AI-use disclosure statements in the wording journals ask for. Generated from what actually
// happened in the run, so the statement is accurate: the tool edited language only, every sentence was
// checked, and the author remains responsible for the content.
import type { Report } from "@/lib/core/types";

export type DisclosureStyle = "icmje" | "nature" | "ieee" | "elsevier";

export const DISCLOSURE_STYLES: { value: DisclosureStyle; label: string; where: string }[] = [
  { value: "icmje", label: "ICMJE (medical journals)", where: "Acknowledgements section, and the cover letter" },
  { value: "nature", label: "Nature Portfolio", where: "Not required for copy-editing; add to Acknowledgements if you wish to disclose" },
  { value: "ieee", label: "IEEE", where: "Acknowledgements section" },
  { value: "elsevier", label: "Elsevier", where: "A separate section directly above the References" },
];

const TOOL = "Veritext STEM";

export function disclosure(style: DisclosureStyle, report: Report, section = "this manuscript"): string {
  const model = report.provider === "demo" ? "a rule-based phrase editor" : "an AI language model (Anthropic Claude)";
  const changed = report.sentences.filter((s) => s.final !== s.original).length;
  const facts =
    `rewording was applied to ${changed} of ${report.sentences.length} sentences; ` +
    `${report.locked.length} equations, numbers, citations and technical terms were locked and left unchanged`;
  switch (style) {
    case "icmje":
      return (
        `The authors used ${TOOL}, which applies ${model}, to improve the readability and language of ${section}. ` +
        `The tool was not used to generate scientific content, analyse data or draw conclusions (${facts}). ` +
        `The authors reviewed and edited the text and take full responsibility for the content of the publication. ` +
        `No AI tool is listed as an author.`
      );
    case "nature":
      return (
        `${TOOL}, which applies ${model}, was used for copy-editing of ${section} to improve readability, style and grammar ` +
        `(${facts}). It was not used to generate text, data, figures or conclusions. ` +
        `The authors reviewed the final text and are accountable for it.`
      );
    case "ieee":
      return (
        `This article was edited for language with ${TOOL} (${model}). The tool was applied to ${section} for editing and ` +
        `grammar enhancement only; ${facts}. All technical content is the authors' own.`
      );
    case "elsevier":
      return (
        `Declaration of generative AI and AI-assisted technologies in the manuscript preparation process\n\n` +
        `During the preparation of this work the author(s) used ${TOOL} (${model}) in order to improve the language and ` +
        `readability of ${section}. After using this tool, the author(s) reviewed and edited the content as needed and ` +
        `take(s) full responsibility for the content of the published article.`
      );
  }
}
