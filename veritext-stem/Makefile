.PHONY: check engine-check web-check

check: engine-check web-check

engine-check:
	cd services/engine && uv run ruff check . && uv run ruff format --check . && uv run mypy && uv run pytest -q

web-check:
	pnpm -r lint && pnpm -r typecheck && pnpm -r test
	pnpm --filter web build:preview && pnpm --filter web e2e
