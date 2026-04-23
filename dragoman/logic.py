#!/usr/bin/env python3
import sys
import os
import re
from pathlib import Path

# Add shared dir to path for local_liaison
DRAGOMAN_DIR = Path(__file__).parent.resolve()
sys.path.append(str(DRAGOMAN_DIR.parent / "shared"))

try:
    from local_liaison import fetch_local_with_runner
except ImportError:
    def fetch_local_with_runner(text, **kwargs):
        return text, "passthrough"

# Logic from mcp_server.py
FILLER_RE = re.compile(r'\b(actually|basically|literally|honestly|to be honest|you know|sort of|kind of|really|just|I mean|I think)\b', re.IGNORECASE)

def refine(text):
    # 1. Filler Removal
    clean = FILLER_RE.sub('', text)
    clean = re.sub(r'\s+', ' ', clean).strip()
    
    # 2. Grammar/Token Opt via Liaison
    # Liaison handles LM-Studio / Ollama locally.
    refined, runner = fetch_local_with_runner(
        clean,
        system_prompt="You are Dragoman, a professional writing assistant. Refine the user input for clarity, grammar, and extreme brevity. Preserve all technical commands.",
        temperature=0.1
    )
    
    # 3. Banner
    orig_count = len(text.split())
    new_count  = len(refined.split())
    
    banner = (
        "─────────────────────────────────────────\n"
        f"🗣  Dragoman — message refined\n"
        f"    Words : {orig_count} → {new_count}\n"
        f"    Engine: {runner}\n"
        "─────────────────────────────────────────\n\n"
    )
    return banner + refined

if __name__ == "__main__":
    if len(sys.argv) > 1:
        print(refine(sys.argv[1]))
    else:
        print("No input provided.")
