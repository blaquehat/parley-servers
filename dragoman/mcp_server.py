#!/usr/bin/env python3
"""
Dragoman v3 — MCP stdio server for real-time grammar, spelling, and token refinement.

Trigger:  /d: <message>   OR   @d: <message>
Pipeline: 1. Filler token compression (deterministic, zero model cost)
          2. Spell/grammar fix via local LLM — routed through shared/local_liaison.py
             (LM Studio → Ollama → passthrough). Single shared router; no duplication.
Cache:    SQLite — stored in this directory, never in /tmp or system dirs.
Logs:     stderr (IDE map panel) + optional dragoman.log (set DRAGOMAN_DEBUG=1).

All files stay in .parley-servers/dragoman/. No external API keys required.
Compatible: VS Code + GitHub Copilot, Zed, Antigravity, Claude Code, Cursor.
"""

from __future__ import annotations

import hashlib
import json
import os
import sys
import re
import sqlite3
from datetime import datetime
from pathlib import Path
from typing import Optional

# ─── Shared liaison import ─────────────────────────────────────────────────────
# Import the shared LLM router directly as a Python module — zero subprocess
# overhead. All .parley-servers tools share this single connection layer so that
# host/model config only ever needs to be updated in one place (liaison_config.json).
_SHARED_DIR = Path(__file__).parent.parent / "shared"
if str(_SHARED_DIR) not in sys.path:
    sys.path.insert(0, str(_SHARED_DIR))
from local_liaison import fetch_local_with_runner  # noqa: E402

# ─── Paths ─────────────────────────────────────────────────────────────────────
# All runtime files stay inside the dragoman directory — no /tmp, no system dirs.
DRAGOMAN_DIR = Path(__file__).parent.resolve()

CACHE_DB = DRAGOMAN_DIR / "dragoman_cache.db"
LOG_FILE = DRAGOMAN_DIR / "dragoman.log"

# Set DRAGOMAN_DEBUG=1 in MCP env to enable persistent log file.
DEBUG = os.environ.get("DRAGOMAN_DEBUG", "").strip() in ("1", "true", "yes")

# ─── Trigger detection ─────────────────────────────────────────────────────────
# Matches /d:, @d:, or [d] at the start of a message, case-insensitive, with optional whitespace.
_TRIGGER_RE = re.compile(r"^(/d:|@d:|\[d\])\s*", re.IGNORECASE)

# ─── Filler token patterns ─────────────────────────────────────────────────────
# Deterministic removal — no model needed. Strips common padding words that add
# length without adding meaning, compressing the prompt before the grammar pass.
_FILLERS = re.compile(
    r"\b("
    r"please|kindly|could you|can you|would you mind|"
    r"basically|essentially|just|simply|actually|really|"
    r"very|quite|rather|somewhat|indeed|certainly|absolutely|"
    r"feel free to|don't hesitate to|"
    r"I was wondering if|I would like you to|I want you to|"
    r"make sure to|be sure to|go ahead and|"
    r"as you know|as we discussed|as mentioned"
    r")\b",
    re.IGNORECASE,
)

# ─── SQLite cache (dragoman directory only) ────────────────────────────────────
def _ensure_cache() -> None:
    """Create cache table if it doesn't exist."""
    try:
        with sqlite3.connect(str(CACHE_DB)) as conn:
            conn.execute(
                "CREATE TABLE IF NOT EXISTS cache "
                "(id TEXT PRIMARY KEY, val TEXT, created_at TEXT)"
            )
    except Exception:
        pass


def _cache_get(text: str) -> Optional[str]:
    """Return cached refined text, or None on miss."""
    try:
        key = hashlib.md5(text.encode()).hexdigest()
        with sqlite3.connect(str(CACHE_DB)) as conn:
            row = conn.execute(
                "SELECT val FROM cache WHERE id=?", (key,)
            ).fetchone()
            return row[0] if row else None
    except Exception:
        return None


def _cache_set(text: str, refined: str) -> None:
    """Store a grammar-refined result in the local cache."""
    try:
        key = hashlib.md5(text.encode()).hexdigest()
        ts  = datetime.now().isoformat()
        with sqlite3.connect(str(CACHE_DB)) as conn:
            conn.execute(
                "INSERT OR REPLACE INTO cache VALUES (?,?,?)", (key, refined, ts)
            )
    except Exception:
        pass


# ─── Logging ───────────────────────────────────────────────────────────────────
_PID = os.getpid()
_INITIALIZED = False

def _log(msg: str) -> None:
    """
    Write a status line to stderr only.
    """
    now = datetime.now().strftime('%H:%M:%S')
    sys.stderr.write(f"DRAGOMAN: [{now}] {msg}\n")
    sys.stderr.flush()
    
    if DEBUG:
        try:
            with LOG_FILE.open("a") as f:
                f.write(f"[{now}] {msg}\n")
        except Exception:
            pass


# ─── Filler compression (Phase 1 — no model) ──────────────────────────────────
def _strip_fillers(text: str) -> tuple[str, int]:
    """
    Remove filler tokens with regex substitution.
    Returns (cleaned_text, tokens_saved).
    Collapses any double-spaces left behind after removal.
    """
    original_words = len(text.split())
    cleaned = _FILLERS.sub("", text)
    cleaned = re.sub(r"  +", " ", cleaned).strip()
    # Restore sentence starts that lost their capital letter after filler removal.
    cleaned = re.sub(r"(^|[.!?]\s+)([a-z])", lambda m: m.group(1) + m.group(2).upper(), cleaned)
    saved = max(0, original_words - len(cleaned.split()))
    return cleaned, saved


# ─── Grammar fix (Phase 2 — via shared liaison) ───────────────────────────────
def _grammar_fix(text: str) -> tuple[str, str]:
    """
    Run spell and grammar correction through the shared local LLM router.
    Uses shared/local_liaison.py — the single connection point for all
    .parley-servers tools. No connection logic is duplicated here.

    Priority: cache → LM Studio → Ollama → passthrough (never blocks).
    Returns (refined_text, runner_label).
    """
    # Cache check first — never send the same text to the model twice.
    cached = _cache_get(text)
    if cached:
        return cached, "cache"

    grammar_prompt = (
        "You are Dragoman, a professional writing assistant. "
        "Refine the user input for clarity, grammar, and extreme brevity. "
        "CRITICAL RULE: You MUST absolutely preserve all code blocks, variable names, "
        "file paths, URLs, CLI commands, and raw system logs EXACTLY as written. "
        "Do not add filler words like 'basically' or 'just'. "
        "Output ONLY the refined text — nothing else.\n\n"
        f"Text:\n{text}"
    )

    # Log the network handshake so it's visible in the panel.
    _log("PHASE 2: [NETWORK] Requesting grammar fix from Liaison...")
    result, runner = fetch_local_with_runner(grammar_prompt, max_tokens=300)
    _log(f"PHASE 2: [NETWORK] Response received via {runner}.")
    
    # If the network failed and we used passthrough, return the raw text, not the system prompt wrap.
    if runner == "passthrough":
        result = text
        
    _cache_set(text, result)
    return result, runner


# ─── Configurable Thresholds ──────────────────────────────────────────────────
# Minimum words required to trigger Phase 2 (Local LLM grammar fix).
# Prevents tool-call overhead from exceeding token savings on short messages.
MIN_WORDS = 20

# ─── Main refinement pipeline ──────────────────────────────────────────────────
def _refine(raw_text: str) -> dict:
    """
    Run the full two-phase Dragoman pipeline.
    1. Deterministic filler compression.
    2. Local LLM grammar correction (if text meets length threshold).

    Returns a stats dict with the refined text and telemetry.
    """
    # Phase 1: strip filler tokens locally.
    _log("PHASE 1: Running filler compression...")
    compressed, tokens_saved = _strip_fillers(raw_text)

    # Phase 2: grammar fix via local liaison.
    words = compressed.split()
    word_count = len(words)

    if word_count < 2:
        _log("PHASE 2: Skipping (text too short).")
        refined, runner = compressed, "passthrough"
    elif word_count < MIN_WORDS:
        _log(f"PHASE 2: Skipping ({word_count} words < {MIN_WORDS} threshold).")
        refined, runner = compressed, "skipped (short prompt)"
    else:
        refined, runner = _grammar_fix(compressed)

    _log("PIPELINE: Complete.")
    return {
        "text":           refined,
        "runner":         runner,
        "original_words": len(raw_text.split()),
        "final_words":    len(refined.split()),
        "tokens_saved":   tokens_saved,
    }


# ─── MCP JSON-RPC helpers ──────────────────────────────────────────────────────
def _respond(msg_id: Optional[int], result: dict) -> None:
    """Send a JSON-RPC response to stdout."""
    response = {"jsonrpc": "2.0", "id": msg_id, "result": result}
    sys.stdout.write(json.dumps(response) + "\n")
    sys.stdout.flush()


def _error(msg_id: Optional[int], code: int, message: str) -> None:
    """Send a JSON-RPC error response to stdout."""
    error = {"jsonrpc": "2.0", "id": msg_id, "error": {"code": code, "message": message}}
    sys.stdout.write(json.dumps(error) + "\n")
    sys.stdout.flush()


# ─── MCP tool definitions ─────────────────────────────────────────────────────
_TOOLS = [
    {
        "name": "refine",
        "description": "Pre-processes user prompts to compress tokens and fix grammar via the local LLM. Call this when the prompt starts with /d:, @d:, or [d].",
        "inputSchema": {
            "type": "object",
            "properties": {
                "text": {
                    "type": "string",
                    "description": "The text to optimize and spell-check.",
                }
            },
            "required": ["text"],
        },
    }
]


# ─── MCP server loop ───────────────────────────────────────────────────────────
def main() -> None:
    _ensure_cache()
    sys.stderr.write(f"DRAGOMAN: [{datetime.now().strftime('%H:%M:%S')}] Ready\n")
    sys.stderr.flush()

    while True:
        try:
            # Use binary buffer for raw, unbuffered I/O.
            line_bytes = sys.stdin.buffer.readline()
            if not line_bytes:
                break
            
            line = line_bytes.decode("utf-8").strip()
            if not line:
                continue

            try:
                request = json.loads(line)
            except json.JSONDecodeError:
                continue

            method = request.get("method", "")
            msg_id = request.get("id")
            params = request.get("params", {})

            if method not in ("notifications/initialized", "ping"):
                _log(f"← {method}" + (f" [{params.get('name', '')}]" if method == "tools/call" else ""))

            # ── initialize ──────────────────────────────────────────────────
            if method == "initialize":
                _respond(msg_id, {
                    "protocolVersion": "2024-11-05",
                    "serverInfo": {"name": "dragoman", "version": "3.0.0"},
                    "capabilities": {"tools": {}},
                })
                _log("Initialized.")

            # ── initialized notification (no response needed) ────────────────
            elif method == "notifications/initialized":
                pass

            # ── tools/list ──────────────────────────────────────────────────
            elif method == "tools/list":
                _respond(msg_id, {"tools": _TOOLS})

            # ── tools/call ──────────────────────────────────────────────────
            elif method == "tools/call":
                tool_name = params.get("name")
                args      = params.get("arguments", {})
                
                if tool_name == "refine":
                    raw = args.get("text", "").strip()

                    # Strip trigger prefix in case the caller forgot.
                    trigger_match = _TRIGGER_RE.match(raw)
                    if trigger_match:
                        raw = raw[trigger_match.end():].strip()

                    if not raw:
                        _error(msg_id, -32602, "Empty text — nothing to refine.")
                        continue

                    _log(f"Intercepted {len(raw.split())} words — running pipeline.")
                    stats = _refine(raw)

                    # Build the summary banner that appears in the IDE response.
                    runner_label = stats["runner"]
                    saved        = stats["tokens_saved"]
                    orig         = stats["original_words"]
                    final        = stats["final_words"]

                    summary = (
                        f"─────────────────────────────────────────\n"
                        f"🗣  Dragoman — message refined\n"
                        f"    Words : {orig} → {final}"
                        + (f"  (−{saved} filler tokens)" if saved > 0 else "") + "\n"
                        f"    Engine: {runner_label}\n"
                        f"─────────────────────────────────────────\n\n"
                        f"{stats['text']}"
                    )

                    _log(
                        f"Complete — {orig}→{final} words via {runner_label}."
                        + (f" Saved {saved} filler tokens." if saved else "")
                    )

                    _respond(msg_id, {"content": [{"type": "text", "text": summary}]})

                else:
                    _error(msg_id, -32601, f"Unknown tool: {tool_name}")

            # ── ping ────────────────────────────────────────────────────────
            elif method == "ping":
                _respond(msg_id, {})

            # ── catchall — respond only when an id is present ────────────────
            else:
                if msg_id is not None:
                    _respond(msg_id, {})

        except EOFError:
            break  # Normal shutdown.
        except Exception as exc:
            _log(f"Unhandled error: {exc}")
            try:
                if msg_id is not None:
                    _error(msg_id, -32603, str(exc))
            except Exception:
                pass


if __name__ == "__main__":
    main()
