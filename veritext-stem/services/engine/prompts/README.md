# Prompts

Every LLM prompt the engine (or the browser preview) uses lives here; no inline prompt strings in code.
Layout: `<name>/v<N>.md` (YAML front matter + body) and `<name>/eval.yaml` (at least one case).
Changing a prompt's behaviour means adding a new version file, not editing one in place.
`apps/web` reads these files at build time (`pnpm sync-prompts`), so both engines send the same text.
