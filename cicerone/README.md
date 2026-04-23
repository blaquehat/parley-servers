# Cicerone (The Knowledge Mentor) — v1.5.0

Cicerone is a persistent, project-aware knowledge layer for AI agents. It maintains the "Total Recall" of a codebase by tracking architectural decisions, session history, and project-specific conventions.

It now includes the **Librarian Protocol**, a local-only indexing and advisory layer that provides deep project intelligence without external token bloat.

---

## 🛠 Available Tools

### 1. Memory & Session Management
- **`check_recall`**: Performs a quick health check of the session. Returns the latest work snippet, recent decisions, and the health status of the Librarian index.
- **`load_context`**: Reads the `context-snapshot.md` file to give a new agent a 30-second catch-up on the project state.
- **`load_full_context`**: Reads all session journals for deep technical recovery.
- **`preview_save` / `confirm_save`**: Drafts and writes updates to session journals (`decisions.md`, `current-work.md`, etc.).
- **`scaffold_files`**: Automatically creates the `.agents/shared/journals/` directory structure if it is missing.

### 2. The Librarian Suite (Project Intelligence)
- **`librarian_briefing`**: **[Mandatory Startup]** Returns a high-density "Situation Report" combining current work, active project rules, and anatomy status.
- **`librarian_scan`**: Triggers the `librarian_bot.js` to re-index the project. It maps the file structure (Deep for custom code, Shallow for core/contrib) into `anatomy.json`.
- **`librarian_query`**: Performs a semantic search across the project anatomy using the local Liaison model. Ask: *"Where is the routing logic for the provider search?"*
- **`librarian_learn`**: Formally records a new rule, correction, or vocabulary term into the **Cerebrum** memory (`cerebrum.json`).
- **`librarian_log_read`**: Logs a file read to the **Session Ledger**. This prevents agents from redundantly reading the same content in a single session.

---

## 🏗 The Librarian Protocol

The Librarian stores its state in `.agents/shared/librarian/` to maintain a zero-footprint on your main project code.

- **`anatomy.json`**: A flattened map of your project's files and their purposes.
- **`cerebrum.json`**: The "Brain" of the project. Stores persistent rules like *"Always use SDC components for UI"* or *"Never use \Drupal::logger() directly."*
- **`session_ledger.json`**: Tracks file interactions during the current conversation to optimize token usage.

---

## 🚀 Setup & Integration

### Configuration
Librarian behavior is controlled via `config.json` in the librarian directory. You can configure:
- **Deep Scan**: Directories to index with full metadata (e.g., `docroot/modules/custom`).
- **Shallow Scan**: Directories to index as name-only (e.g., `docroot/core`).
- **Ignore Patterns**: Files and extensions to skip.

### IDE Registration
Add Cicerone to your MCP configuration:

```json
{
  "mcpServers": {
    "cicerone": {
      "command": "node",
      "args": ["/absolute/path/to/.parley-servers/cicerone/index.js"]
    }
  }
}
```

---

## 🧠 Philosophy: "Total Recall"
Cicerone ensures that no architectural decision is made twice because the context was lost. It bridges the gap between different AI agents (Zed, Antigravity, VS Code) by providing a unified, persistent memory layer that lives *within* the repository.
