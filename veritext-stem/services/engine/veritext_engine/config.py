"""All tunables, including model IDs (see CLAUDE.md: never hard-code a model ID elsewhere)."""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict

_DEFAULT_SHARED = Path(__file__).resolve().parents[3] / "shared"
_DEFAULT_PROMPTS = Path(__file__).resolve().parents[1] / "prompts"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="VERITEXT_", env_file=".env", extra="ignore")

    # Which rewrite provider to use. "auto" = Anthropic when ANTHROPIC_API_KEY is set, else the demo rewriter.
    provider: Literal["auto", "anthropic", "demo"] = "auto"
    model_rewrite: str = "claude-opus-5-5"
    model_judge: str = "claude-sonnet-5-5"
    model_classify: str = "claude-haiku-5-5"
    max_repair_attempts: int = 3
    max_input_chars: int = 60_000
    shared_dir: Path = _DEFAULT_SHARED
    prompts_dir: Path = _DEFAULT_PROMPTS
    cors_origins: str = "http://localhost:3000"
    log_format: Literal["json", "console"] = "json"


@lru_cache
def get_settings() -> Settings:
    return Settings()
