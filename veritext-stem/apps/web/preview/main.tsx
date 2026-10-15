// Single-file preview build (published as a claude.ai artifact). Runs the TypeScript core in the browser.
// Rewrites go to Claude through the viewer's own Claude account (the artifact `sample` capability) when the
// page is opened inside Claude; otherwise the offline demo rewriter is used. Same lock and sentence checks.
import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import Workbench, { type EngineOption } from "@/components/Workbench";
import { claudeSampleProvider, demoProvider, runPipeline, shared, type RewriteProvider, type SampleFn } from "@/lib/core";

declare global {
  interface Window {
    claude?: { use(name: string): Promise<unknown> };
  }
}

const option = (id: string, label: string, provider: RewriteProvider): EngineOption => ({
  id,
  label,
  description: provider.label,
  run: (input, onProgress) =>
    runPipeline(input.text, provider, {
      discipline: input.discipline,
      register: input.register,
      format: input.format === "auto" ? null : input.format,
      onProgress,
    }),
});

const demo = option("demo", "Demo rewriter (offline)", demoProvider);

function App() {
  const [engines, setEngines] = useState<EngineOption[]>([demo]);
  const [claudeState, setClaudeState] = useState<"checking" | "ready" | "absent">("checking");

  useEffect(() => {
    let live = true;
    const use = window.claude?.use;
    if (!use) {
      setClaudeState("absent");
      return;
    }
    window.claude!
      .use("sample")
      .then((sample) => {
        if (!live) return;
        if (sample) {
          setEngines([option("claude", "Claude", claudeSampleProvider(sample as SampleFn)), demo]);
          setClaudeState("ready");
        } else setClaudeState("absent");
      })
      .catch(() => live && setClaudeState("absent"));
    return () => {
      live = false;
    };
  }, []);

  const notice =
    claudeState === "ready" ? (
      <p className="vx-note vx-note-info m-0">
        Rewrites use Claude through your own Claude account, so you will be asked to allow it the first time. Switch
        the rewriter to the offline demo for phrase-level edits without Claude.
      </p>
    ) : claudeState === "absent" ? (
      <p className="vx-note vx-note-warn m-0">
        Claude is not available in this view, so the offline demo rewriter is used: phrase-level edits only, with the
        same lock and sentence checks.
      </p>
    ) : null;

  return <Workbench engines={engines} initialText={shared.sample} notice={notice} />;
}

createRoot(document.getElementById("root")!).render(<App />);
