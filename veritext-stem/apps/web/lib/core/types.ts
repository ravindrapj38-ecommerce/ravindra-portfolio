// Types mirror the engine's Pydantic models (services/engine/veritext_engine/pipeline/run.py).

export type Format = "text" | "markdown" | "latex";
export type Discipline = "physics" | "chemistry" | "biology" | "cs_ml" | "engineering" | "maths";
export type Register = "journal" | "thesis" | "lab_report" | "explainer";
export type Status = "verified" | "kept_original" | "needs_review";

export interface Issue {
  code: string;
  severity: "hard" | "soft";
  message: string;
}

export interface DiffOp {
  op: "equal" | "delete" | "insert";
  text: string;
}

export interface LintHit {
  phrase: string;
  text: string;
  start: number;
  end: number;
  suggestion: string;
}

export interface SentenceResult {
  id: number;
  block: number;
  original: string;
  final: string;
  status: Status;
  attempts: number;
  issues: Issue[];
  diff: DiffOp[];
}

export interface LockedItem {
  key: string;
  kind: string;
  label: string;
  text: string;
}

export interface Report {
  format: Format;
  discipline: Discipline;
  register: Register;
  provider: string;
  provider_label: string;
  output: string;
  sentences: SentenceResult[];
  counts: Record<Status, number>;
  fidelity_score: number;
  rewritten_share: number;
  locked: LockedItem[];
  lint_input: LintHit[];
  lint_output: LintHit[];
  round_trip_ok: boolean;
  warnings: string[];
}

export interface RewriteInput {
  text: string;
  format: Format | "auto";
  discipline: Discipline;
  register: Register;
}

export interface LockRule {
  id: string;
  kind: string;
  pattern: string;
  flags?: string;
  filter?: string;
  formats?: string[];
}

export interface SharedData {
  lexicons: Record<string, string[] | string>;
  lockPatterns: LockRule[];
  aiPhrases: { phrase: string; suggestion: string; match?: string }[];
  demoSubstitutions: string[][];
  sample: string;
  prompts: { rewrite: string; repair: string };
  styles: { registers: Record<Register, string>; disciplines: Record<Discipline, string> };
}

export const DISCIPLINES: { value: Discipline; label: string }[] = [
  { value: "physics", label: "Physics" },
  { value: "chemistry", label: "Chemistry" },
  { value: "biology", label: "Biology" },
  { value: "cs_ml", label: "CS / ML" },
  { value: "engineering", label: "Engineering" },
  { value: "maths", label: "Mathematics" },
];

export const REGISTERS: { value: Register; label: string }[] = [
  { value: "journal", label: "Journal article" },
  { value: "thesis", label: "Thesis" },
  { value: "lab_report", label: "Lab report" },
  { value: "explainer", label: "Explainer" },
];
