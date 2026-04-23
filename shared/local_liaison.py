#!/usr/bin/env python3
"""
local_liaison.py — Shared local LLM router for all .parley-servers MCP tools.

Importable API (preferred — zero subprocess overhead):
    from local_liaison import fetch_local, fetch_local_with_runner
    result = fetch_local("your prompt here", max_tokens=300)
    result, runner = fetch_local_with_runner("your prompt", max_tokens=300)

CLI API (kept for standalone testing only):
    python3 local_liaison.py --prompt "your prompt" --max-tokens 300

Configuration:  liaison_config.json (same directory as this file)
Fallback chain: LM Studio → Ollama → passthrough (never blocks the caller)

Cache policy: Each caller manages its own cache. This module does NOT cache
              internally — it is a pure transport layer. Callers that want
              caching should maintain their own SQLite db in their own directory.
"""

from __future__ import annotations

import argparse
import json
import os
import urllib.request
from pathlib import Path
from typing import Optional, Tuple

# ─── Configuration ─────────────────────────────────────────────────────────────
_CONFIG_PATH = Path(__file__).parent / "liaison_config.json"


def _load_config() -> dict:
    """Load liaison_config.json from the shared directory."""
    try:
        return json.loads(_CONFIG_PATH.read_text())
    except Exception:
        return {}


# Loaded once at import time. All callers share the same config snapshot.
CONFIG: dict = _load_config()


# ─── Runners ───────────────────────────────────────────────────────────────────
def _run_lm_studio(base_url: str, prompt: str, max_tokens: int) -> str:
    """
    Call LM Studio's OpenAI-compatible chat completions endpoint.
    Raises on network error or non-200 response.
    """
    api_key = CONFIG.get("lms", {}).get("API_KEY", "lm-studio")
    model   = CONFIG.get("lms", {}).get("MODEL", "local-model")
    payload = json.dumps({
        "model":       model,
        "messages":    [{"role": "user", "content": prompt}],
        "temperature": 0.1,
        "max_tokens":  max_tokens,
    }).encode()
    req = urllib.request.Request(
        f"{base_url}/v1/chat/completions",
        data    = payload,
        headers = {
            "Content-Type":  "application/json",
            "Authorization": f"Bearer {api_key}",
        },
    )
    with urllib.request.urlopen(req, timeout=20) as resp:
        return json.loads(resp.read())["choices"][0]["message"]["content"].strip()


def _run_ollama(host: str, model: str, prompt: str, max_tokens: int) -> str:
    """
    Call Ollama's generate endpoint with a specific model.
    Raises on network error or non-200 response.
    """
    payload = json.dumps({
        "model":   model,
        "prompt":  prompt,
        "stream":  False,
        "options": {"num_predict": max_tokens},
    }).encode()
    req = urllib.request.Request(
        f"{host}/api/generate",
        data    = payload,
        headers = {"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=20) as resp:
        return json.loads(resp.read()).get("response", "").strip()


# ─── Public API ────────────────────────────────────────────────────────────────
def fetch_local(prompt: str, max_tokens: int = 300) -> str:
    """
    Send a prompt to the local LLM chain. Returns the model response string.
    Falls back silently through the chain — never raises, never blocks.

    Chain priority:
      1. LM Studio  (http://vesalius.local:1234)
      2. Ollama     (http://vesalius.local:11434)
      3. Passthrough — returns the original prompt unchanged.

    Args:
        prompt:     The text to send to the model.
        max_tokens: Maximum tokens to generate (default 300).

    Returns:
        The model's response string, or the original prompt on full fallback.
    """
    result, _ = fetch_local_with_runner(prompt, max_tokens)
    return result


def fetch_local_with_runner(prompt: str, max_tokens: int = 300) -> Tuple[str, str]:
    """
    Same as fetch_local(), but also returns the runner label for telemetry.
    Includes retry logic and increased timeout for local model loading.
    Supports a fallback chain for Ollama models.

    Returns:
        (response_text, runner_label) where runner_label is one of:
        "lm-studio" | "ollama" | "passthrough"
    """
    lms_host     = CONFIG.get("lms",    {}).get("HOST", "http://vesalius.local:1234")
    ollama_host  = CONFIG.get("ollama", {}).get("HOST", "http://vesalius.local:11434")
    # Support both single 'MODEL' and list 'MODELS'
    ollama_models = CONFIG.get("ollama", {}).get("MODELS", [])
    if not ollama_models:
        single = CONFIG.get("ollama", {}).get("MODEL")
        if single:
            ollama_models = [single]
        else:
            ollama_models = ["llama3"] # default fallback
    
    attempts = 2   # Retry logic per model

    # 1. Try LM Studio
    if lms_host:
        for i in range(attempts):
            try:
                if i > 0:
                    import sys
                    sys.stderr.write(f"LIAISON: Retrying LM Studio (attempt {i+1})...\n")
                return _run_lm_studio(lms_host, prompt, max_tokens), "lm-studio"
            except Exception as e:
                import sys
                sys.stderr.write(f"LIAISON: LM Studio attempt {i+1} failed: {e}\n")
                pass

    # 2. Fallback: Ollama Chain
    if ollama_host:
        for model in ollama_models:
            for i in range(attempts):
                try:
                    if i > 0 or len(ollama_models) > 1:
                        import sys
                        sys.stderr.write(f"LIAISON: Trying Ollama [{model}] (attempt {i+1})...\n")
                    return _run_ollama(ollama_host, model, prompt, max_tokens), "ollama"
                except Exception as e:
                    import sys
                    sys.stderr.write(f"LIAISON: Ollama [{model}] attempt {i+1} failed: {e}\n")
                    pass

    # Full fallback: passthrough
    return prompt, "passthrough"


# ─── CLI (for standalone testing only) ────────────────────────────────────────
def main() -> None:
    parser = argparse.ArgumentParser(description="Local Liaison — shared LLM router")
    parser.add_argument("--prompt",     required=True, help="Prompt to send")
    parser.add_argument("--max-tokens", type=int, default=300, help="Max tokens")
    args = parser.parse_args()

    result, runner = fetch_local_with_runner(args.prompt, args.max_tokens)
    print(json.dumps({"success": True, "runner": runner, "data": result}))


if __name__ == "__main__":
    main()
