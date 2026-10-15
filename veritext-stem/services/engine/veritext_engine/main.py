"""FastAPI app: ``POST /v1/rewrite``, ``GET /v1/sample``, ``GET /v1/meta``, ``GET /healthz``."""

from __future__ import annotations

from typing import Literal

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ConfigDict, Field

from veritext_engine import __version__
from veritext_engine.config import get_settings
from veritext_engine.pipeline.providers import RewriteProvider, make_provider
from veritext_engine.pipeline.run import Discipline, Register, Report, run_pipeline
from veritext_engine.shared import sample_text


class RewriteBody(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    text: str = Field(min_length=1)
    format: Literal["auto", "text", "markdown", "latex"] = "auto"
    discipline: Discipline = "physics"
    register_: Register = Field(default="journal", alias="register")


def create_app(provider: RewriteProvider | None = None) -> FastAPI:
    settings = get_settings()
    app = FastAPI(title="Veritext STEM engine", version=__version__)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[o.strip() for o in settings.cors_origins.split(",") if o.strip()],
        allow_methods=["GET", "POST"],
        allow_headers=["content-type"],
    )
    state: dict[str, RewriteProvider] = {}

    def get_provider() -> RewriteProvider:
        if "p" not in state:
            state["p"] = provider or make_provider(settings)
        return state["p"]

    @app.get("/healthz")
    def healthz() -> dict[str, str]:
        return {"status": "ok", "version": __version__}

    @app.get("/v1/meta")
    def meta() -> dict[str, str]:
        p = get_provider()
        return {"provider": p.name, "provider_label": p.label, "version": __version__}

    @app.get("/v1/sample")
    def sample() -> dict[str, str]:
        return {"text": sample_text(), "format": "markdown", "discipline": "physics", "register": "journal"}

    @app.post("/v1/rewrite", response_model=Report, response_model_by_alias=True)
    def rewrite(body: RewriteBody) -> Report:
        if len(body.text) > settings.max_input_chars:
            raise HTTPException(413, f"Text is longer than {settings.max_input_chars} characters.")
        return run_pipeline(
            body.text,
            get_provider(),
            discipline=body.discipline,
            register=body.register_,
            fmt=None if body.format == "auto" else body.format,
            max_attempts=settings.max_repair_attempts,
        )

    return app


app = create_app()
