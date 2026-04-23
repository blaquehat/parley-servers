# Dragoman v3

> *"A dragoman is a translator, interpreter, and guide — the voice between two worlds."*

Dragoman is the message refinement layer that intercepts user prompts before they reach
the cloud model. It corrects spelling, fixes grammar, and strips filler tokens locally —
saving tokens and sharpening signal quality without changing your meaning.

---

## How to Use It

Prefix any message with `/d:`, `@d:`, or `[d]`:

```
/d: can you please just basically fix the authentication hook so it actually works
[d] find the custom themes but only the ones in docroot
```

Dragoman processes it locally and returns the refined version. The model receives that
clean text and responds to it — you never had to think about it.

```
/d:   →  Fix the authentication hook so it works.
[d]   →  Find custom themes in docroot.
```

**Triggers:**
- `/d:`: Default trigger.
- `@d:`: Use if `/` conflicts with IDE slash-commands.
- `[d]`: Convenient for bracket-heavy workflows or shorthand.

---

## How It Works

Two phases run every time a `/d:` or `@d:` message is received:

| Phase | What | How |
|-------|------|-----|
| 1 — Filler compression | Strips padding words (`please`, `just`, `basically`, `can you`, etc.) | Deterministic regex — zero model cost, instant |
| 2 — Grammar fix | Corrects spelling and grammatical errors | Local LLM via liaison (LM Studio → Ollama → mock passthrough) |

Phase 1 always runs first, so the grammar model receives pre-compressed input — saving
tokens on the liaison call itself.

---

## Local LLM Chain

Dragoman reads `../shared/liaison_config.json` for host and model settings.

| Priority | Backend | Default host |
|----------|---------|--------------|
| 1 | LM Studio | `http://vesalius.local:1234` |
| 2 | Ollama | `http://vesalius.local:11434` |
| 3 | Mock passthrough | Returns text as-is — IDE never blocks |

No cloud API key is ever required. When the home office (vesalius.local) is offline,
mock passthrough keeps the pipeline open without blocking the session.

---

## Files in This Directory

```
.parley-servers/dragoman/
├── mcp_server.py        ← The server (this is the only file that runs)
├── INTENT.md            ← Architectural decisions and version history
├── README.md            ← This file
├── dragoman_cache.db    ← SQLite cache (auto-created at first run)
└── dragoman.log         ← Troubleshooting log (only created when DRAGOMAN_DEBUG=1)
```

All runtime artifacts stay in this directory. Nothing is written to `/tmp`, system
paths, or any other location.

---

## MCP Registration

Dragoman is registered as a `stdio` MCP server in all three IDE configs:

**VS Code** (`.vscode/mcp.json`):
```json
"dragoman": {
  "type": "stdio",
  "command": "/usr/bin/env",
  "args": ["python3", "${workspaceFolder}/.parley-servers/dragoman/mcp_server.py"]
}
```

**Antigravity** (`~/.gemini/antigravity/mcp_config.json`):
```json
"dragoman": {
  "command": "/usr/bin/env",
  "args": ["python3", "/absolute/path/to/.parley-servers/dragoman/mcp_server.py"]
}
```

**Zed** (`.zed/settings.json`):
```json
"dragoman": {
  "command": "/usr/bin/env",
  "args": ["python3", "/absolute/path/to/.parley-servers/dragoman/mcp_server.py"]
}
```

**Cursor** and **Claude Code**: Use `.cursorrules` and `CLAUDE.md` respectively to
instruct the model to detect `/d:` and call the `refine` tool.

---

## Debugging

Set `DRAGOMAN_DEBUG=1` in the MCP server environment to enable persistent file logging:

```json
"dragoman": {
  "command": "/usr/bin/env",
  "args": ["python3", "/path/to/mcp_server.py"],
  "env": { "DRAGOMAN_DEBUG": "1" }
}
```

With `DRAGOMAN_DEBUG=1`:
- Every event is written to `dragoman.log` (timestamped, in this directory).
- Stderr continues to log normally (IDE map panel / output panel).

Without `DRAGOMAN_DEBUG`:
- Only stderr is used. No log file is written.
- This is the recommended default.

---

## IDE Map / Output Panel

Dragoman writes status messages to `stderr` — the channel that IDE output panels read.
What you will see during a refinement:

```
🗣  Dragoman: [10:52:38] Ready — use /d: or @d: to refine a message.
🗣  Dragoman: [10:52:38] Initialized by IDE.
🗣  Dragoman: [10:52:38] Intercepted 13 words — running pipeline.
🗣  Dragoman: [10:52:40] Complete — 13→7 words via lm-studio. Saved 6 filler tokens.
```

If you see `mock` instead of `lm-studio` or `ollama`, vesalius.local is unreachable —
Dragoman is in passthrough mode. Text still flows; grammar fix is skipped.

---

## Cache

Dragoman caches grammar-fix results in `dragoman_cache.db` (SQLite, in this directory).
The same input text is never sent to the local LLM twice. Cache is keyed by MD5 hash
of the post-compression text.

To clear the cache:
```bash
rm .parley-servers/dragoman/dragoman_cache.db
```

---
