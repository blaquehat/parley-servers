# Intent: Dragoman (The Scholarly Interpreter)

## The "Why"

Dragoman is the message refinement layer that runs before every user prompt reaches
the cloud model. Its job is to reduce wasted tokens without altering meaning — fixing
typos, correcting grammar, and stripping conversational filler — so that the model
receives the clearest possible version of what was intended.

It exists because every word sent to a cloud LLM costs tokens. Cleaner prompts mean
cheaper sessions, fewer model hallucinations from ambiguous phrasing, and a consistent
signal quality regardless of how fast the developer is typing.

---

## Philosophical Stance

- **Message fidelity first.** Dragoman never changes meaning. It fixes, it compresses,
  it cleans — it does not rephrase, summarize, or reinterpret.
- **Local-first processing.** Both phases (filler compression and grammar fix) run
  entirely on the home-office server (vesalius.local). No cloud API keys are needed.
  If vesalius is offline, a mock passthrough keeps the IDE from blocking.
- **Self-contained.** Every runtime artifact — cache DB, optional log file — lives
  inside `.parley-servers/dragoman/`. Nothing is written to /tmp or system paths.
- **Token stewardship.** The goal is conservative token usage while keeping replies
  complete and meaningful.

---

## Two-Phase Pipeline

| Phase | What it does | How |
|-------|--------------|-----|
| 1. Filler compression | Strips padding words (`please`, `basically`, `just`, etc.) | Deterministic regex — zero model cost |
| 2. Grammar fix | Corrects spelling and grammatical errors | Local LLM via liaison (LM Studio → Ollama → mock) |

Phase 1 always runs first so the grammar model receives a pre-compressed input,
saving tokens on the liaison call itself.

---

## Trigger Protocol

The user prefixes any message with `/d:` or `@d:` to invoke Dragoman:

```
/d: can you please just basically fix the authentication hook
```

The IDE agent detects the prefix, calls the `refine` MCP tool, receives the cleaned
text, and uses it as the actual prompt. The raw prefix never reaches the model.

Both triggers (`/d:` and `@d:`) work identically. `@d:` is provided as an alias for
IDEs where `/` commands may conflict with built-in slash-command menus.

---

## Versioning & Decisions

- **v1.x**: Original "Scholarly Refine" implementation. Subprocess-based liaison call.
  Known issues: orphaned processes, unreliable `[d]` prefix detection, no persistent
  cache in project directory.
- **v2.x**: Extracted liaison into `shared/local_liaison.py`. Added `[d]` and
  `/askassist` protocol detection. Still subprocess-based. Issues persisted with
  trigger reliability and cache file location.
- **v3.0.0** *(current)*: Clean-room rebuild.
  - Liaison logic inlined — no subprocess overhead.
  - Trigger changed from `[d]` to `/d:` / `@d:` for cross-IDE compatibility.
  - Cache DB (`dragoman_cache.db`) and log (`dragoman.log`) co-located in
    `.parley-servers/dragoman/` per policy.
  - `askYou_ai` deprecated and backed up to `.git-backup/parley-servers/askYou_ai/`.
  - Tool renamed from `scholarly_refine` to `refine` — cleaner, less ceremonial.
  - Mock runner upgraded: passthrough preserves text rather than annotating it.
  - All agent instruction files updated to use `/d:` protocol.
- **v3.0.1**: Corrected architecture error from v3.0.0.
  - v3.0.0 had inlined LM Studio and Ollama runner logic inside `mcp_server.py`,
    duplicating what already exists in `shared/local_liaison.py`. This violated the
    DRY contract that `shared/` is the single connection layer for all parley-servers.
  - Fixed by importing `fetch_local_with_runner()` from the shared module via
    `sys.path` injection — zero subprocess overhead, single source of truth restored.
  - Also fixed `shared/local_liaison.py`: removed its internal `/tmp` cache
    (callers manage their own), added `fetch_local_with_runner()` public API for
    telemetry, changed mock fallback from `[MOCK]: text` to clean passthrough.
- **v3.0.2**: Implemented token-efficiency gate.
  - Added `MIN_WORDS = 20` threshold to `_refine()` pipeline.
  - Rationale: High-deliberation "thinking" models consume significant tokens
    deciding whether to call a tool. For short prompts, this thinking cost + tool call
    overhead often exceeds the actual savings of the grammar fix.
  - Short prompts still undergo Phase 1 (deterministic filler removal) but skip
    the Phase 2 (local LLM) round trip, returning as `skipped (short prompt)`.

