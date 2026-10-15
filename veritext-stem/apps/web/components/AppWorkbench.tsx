"use client";

// Next.js wiring: rewrites go to the FastAPI engine through /api/rewrite. If the engine cannot be
// reached, the page says so and offers the in-browser demo rewriter, which runs the same checks.
import { useEffect, useMemo, useState } from "react";
import Workbench, { type EngineOption } from "@/components/Workbench";
import { demoProvider, runPipeline } from "@/lib/core";
import type { Report } from "@/lib/core/types";

interface Meta {
  provider: string;
  provider_label: string;
}

const browserDemo: EngineOption = {
  id: "browser-demo",
  label: "In-browser demo rewriter",
  description: "Phrase-level edits only, no AI model; same lock and sentence checks as the engine.",
  run: (input, onProgress) =>
    runPipeline(input.text, demoProvider, {
      discipline: input.discipline,
      register: input.register,
      format: input.format === "auto" ? null : input.format,
      onProgress,
    }),
};

export default function AppWorkbench({ sample }: { sample: string }) {
  const [meta, setMeta] = useState<Meta | null | "offline">(null);

  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json())
      .then((h: { engine?: Meta & { status: string } }) => setMeta(h.engine?.provider ? h.engine : "offline"))
      .catch(() => setMeta("offline"));
  }, []);

  const engines = useMemo<EngineOption[]>(() => {
    const server: EngineOption = {
      id: "engine",
      label: meta && meta !== "offline" ? meta.provider_label : "Veritext engine",
      description: "The FastAPI engine",
      async run(input) {
        const res = await fetch("/api/rewrite", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(input),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { detail?: unknown };
          throw new Error(
            typeof body.detail === "string" ? body.detail : `The engine returned an error (HTTP ${res.status}).`,
          );
        }
        return (await res.json()) as Report;
      },
    };
    return meta === "offline" ? [browserDemo] : [server, browserDemo];
  }, [meta]);

  const notice =
    meta === "offline" ? (
      <p className="vx-note vx-note-warn m-0">
        The rewrite engine is not reachable, so this page is using the in-browser demo rewriter. Start the engine
        with <code className="vx-mono">uv run uvicorn veritext_engine.main:app</code> in{" "}
        <code className="vx-mono">services/engine</code> to use it.
      </p>
    ) : meta && meta.provider === "demo" ? (
      <p className="vx-note vx-note-info m-0">
        No AI model is connected, so rewrites are limited to phrase-level edits. Set{" "}
        <code className="vx-mono">ANTHROPIC_API_KEY</code> for the engine to get full Claude rewrites.
      </p>
    ) : null;

  return <Workbench engines={engines} initialText={sample} notice={notice} canDownload />;
}
