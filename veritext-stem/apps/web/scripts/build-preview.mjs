// Builds dist/preview/index.html: one self-contained page (inline JS + CSS) for the artifact preview.
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const web = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(web, "dist", "preview");
mkdirSync(out, { recursive: true });

const js = await build({
  entryPoints: [join(web, "preview", "main.tsx")],
  bundle: true,
  minify: true,
  format: "iife",
  target: "es2022",
  jsx: "automatic",
  write: false,
  alias: { "@": web },
  define: { "process.env.NODE_ENV": '"production"' },
  legalComments: "none",
});
const cssFile = join(out, "app.css");
execFileSync(join(web, "node_modules", ".bin", "tailwindcss"), ["-i", join(web, "app", "globals.css"), "-o", cssFile, "--minify"], {
  cwd: web,
  stdio: "inherit",
});
const css = readFileSync(cssFile, "utf8");
const script = js.outputFiles[0].text.replaceAll("</script", "<\\/script");

const html = `<title>Veritext STEM</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;500;600&family=Source+Serif+4:opsz,wght@8..60,600&display=swap">
<style>${css}</style>
<div id="root"></div>
<script>${script}</script>
`;
writeFileSync(join(out, "index.html"), html);
console.log(`wrote dist/preview/index.html (${Math.round(html.length / 1024)} KB)`);
