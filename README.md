# The Parley Ecosystem — v3.0

A suite of local-first MCP servers designed to provide persistent intelligence, message refinement, and multi-agent orchestration for the UW Medicine project.

---

## 🏛 The Servers

### 1. [Cicerone (The Knowledge Mentor)](./cicerone/README.md)
**Role:** Project memory and historical guide.
- Maintains architectural decisions and session history.
- **Librarian Protocol:** Provides project-aware indexing and structured learning memory.
- **Tools:** `librarian_briefing`, `librarian_scan`, `librarian_query`, `librarian_learn`.

### 2. [Dragoman (The Translator)](./dragoman/README.md)
**Role:** Prompt refinement and token optimization.
- Intercepts user messages starting with `/d:`, `@d:`, or `[d]`.
- Strips filler words and fixes grammar locally via the **Liaison** model.
- **Benefit:** Sharpens signal quality and reduces token cost for the main LLM.

### 3. [Agents Council (The Boardroom)](./agentsCouncil/README.md)
**Role:** Multi-agent collaboration.
- Orchestrates specialized agents (Drupal Architect, Performance Guard, etc.) for complex tasks.
- **Librarian Integration:** Agents receive project-specific rules automatically during briefings.
- **Cross-Council Escalation:** Allows agents to consult specialists from other domains.

---

## 🔗 Shared Infrastructure

All servers share a single connection layer located in the `shared/` directory:

- **`local_liaison.py`**: The central router for all local LLM requests.
- **`liaison_config.json`**: Global configuration for local models (LM Studio, Ollama). Update this file once to update all servers.

---

## 🛠 Usage Summary

| Task | Server | Command/Trigger |
|---|---|---|
| Start a session | Cicerone | `librarian_briefing` |
| Refine a prompt | Dragoman | `/d: <message>` |
| Consult specialists | Council | `start_council` |
| Map the project | Cicerone | `librarian_scan` |
| Search the codebase | Cicerone | `librarian_query` |
| Save a rule | Cicerone | `librarian_learn` |

---

## 🔒 Security & Privacy
- **Local-Only**: All indexing, searching, and grammar refinement happen on your local machine.
- **Zero-Footprint**: System state is stored in `.agents/` or `.parley-servers/` to avoid polluting the codebase.
- **Protocol Compliant**: All servers adhere to the MCP stdio protocol for secure, isolated execution.
