# Agents Council

A shared AI council system that lets multiple AI agents collaborate on a problem in a single, persistent conversation. Each agent has a defined role and expertise. You summon the ones you need, they receive a personalized briefing, and they each respond individually — like calling a meeting with the right specialists.

State is saved to a local `state.json` file, so the conversation persists across IDE sessions and can be picked up by anyone on the team.

---

## What Problem Does This Solve?

When you're working on a complex Drupal codebase — refactoring a legacy module, debugging a caching issue, planning a migration — you often need input from multiple specialists. Normally you'd have to prompt an AI from scratch each time, re-explain the context, and manually piece together advice from different sessions.

Agents Council keeps all of that in one place. You start a session with a topic, summon the agents you need with specific questions, and each one responds with full context of what's already been discussed.

---

## Quick Start

### 1. Install dependencies

```bash
cd .parley-servers/agentsCouncil
npm install
```

### 2. Connect to your IDE

See the [IDE Setup](#ide-setup) section below for your specific tool.

### 3. Start a session

In your AI chat, type something like:

> "Start a council session on our provider search refactor"

The AI will call `start_council` automatically.

### 4. Summon agents

> "Summon DrupalArchitect to answer: what's the best approach for migrating our custom search hooks to plugins?"

### 5. Each agent responds

Each summoned agent calls `claim_summon` to get their briefing, then `send_message` to post their response. In practice, the AI in your IDE handles this automatically — you just read the responses.

### 6. Review the discussion

> "Show me the full council history"

---

## Councils

Councils are sets of agents defined in Markdown files inside the `councils/` folder. Each one is designed for a different type of work.

| Council | Best For |
|---|---|
| `drupal_healthcare` | Drupal sites with Epic, Kyruus, and HIPAA considerations |
| `drupal_regular` | General Drupal development |
| `codebase_overhaul` | Large-scale refactoring and technical debt reduction |
| `internal_team` | Mixed human + AI sessions requiring human approval |
| `legendary_architects` | First-principles architectural, backend, and theming debates |

To switch councils mid-session:
> "Switch to the codebase_overhaul council"

---

## Agent Types

Each agent in a council file has a type tag that controls how they receive their briefing:

| Type | Who | How They Respond |
|---|---|---|
| `[ai]` | AI specialist agents | Full technical briefing — produce code, config, or a concrete plan |
| `[legendary]` | Historical figures (Dries, Rasmus, etc.) | First-person, opinionated, in-character response |
| `[human]` | Real team members (Mike, etc.) | Plain summary of the discussion and a clear ask |

---

## Available Tools

These are the MCP tools the AI uses behind the scenes. You don't call these directly — just ask the AI in natural language and it will use the right tools.

| Tool | What It Does |
|---|---|
| `start_council` | Begin a new session with a topic |
| `list_councils` | Show all available council files |
| `select_council` | Switch to a different council |
| `list_members` | Show agents in the active council |
| `summon_member` | Call an agent with a specific question |
| `get_active_summons` | See who has been summoned and is pending |
| `claim_summon` | Agent claims their summons and receives briefing |
| `get_my_prompt` | Agent refreshes their briefing at any time |
| `send_message` | Agent posts their response to the session |
| `get_council_history` | Read the full session transcript |
| `escalate_to_council` | Ask a specialist from a different council for help |
| `resolve_escalation` | Specialist submits their response and returns control |

---

## Cross-Council Escalation

Any agent can escalate a question to a specialist in a different council when the topic goes beyond their expertise. The whole thing is automatic — the session history carries through, the specialist gets full context, their response is woven back in, and the original council is restored when they're done.

**Example flow:**

```
codebase_overhaul session (DrupalThemeArchitect is working on a Twig issue)
  → DrupalThemeArchitect hits a deep render pipeline question
  → calls escalate_to_council({
      from_agent: "DrupalThemeArchitect",
      target_council: "legendary_architects",
      target_agent: "Fabian Franz",
      question: "Why is this render array not respecting cache tags?",
      reason: "SDC component, cache tags set correctly but parent page not invalidating"
    })
  → Fabian Franz receives a full briefing with session history
  → Fabian Franz calls resolve_escalation({ ... response: "..." })
  → Response is logged as "Fabian Franz [via legendary_architects]"
  → Active council automatically restored to codebase_overhaul
  → DrupalThemeArchitect continues with Fabian's answer in context
```

**What gets logged in history:**

Each escalation leaves two entries in the session transcript — a `🔀 ESCALATION` record when it's raised, and a `↩️ ESCALATION RESPONSE` record when it's resolved. This means `get_council_history` always shows the complete picture of who was consulted and what they said, even across council boundaries.

**Suggested escalation paths:**

| From Council | Escalate To | For |
|---|---|---|
| `codebase_overhaul` | `legendary_architects` | Deep architectural or Twig rendering questions |
| `drupal_healthcare` | `legendary_architects` | First-principles decisions on Epic/FHIR architecture |
| `drupal_regular` | `legendary_architects` | Performance or caching deep dives |
| Any council | `internal_team` | Human sign-off on a decision mid-session |

---

## 🧠 Librarian Integration (Project-Aware Briefings)

The Agents Council is now fully **Librarian-Aware**. 

Every agent summoned (except `[human]` types) automatically receives the latest **Project Rules & Conventions** from the Librarian's Cerebrum (`cerebrum.json`). 

- **Benefits**: Council members will automatically know your project's coding standards, "never/always" lists, and recent architectural decisions without you needing to explain them.
- **How it works**: The Council server reads the Librarian state at the moment of summons and injects it directly into the agent's briefing prompt.

---

## IDE Setup

### VS Code / GitHub Copilot

Add to `.vscode/mcp.json` in your workspace root (create the file if it doesn't exist):

```json
{
  "mcpServers": {
    "agents-council": {
      "command": "node",
      "args": ["${workspaceFolder}/.parley-servers/agentsCouncil/server.js"]
    }
  }
}
```

If `${workspaceFolder}` doesn't resolve correctly, use your full absolute path:

```json
{
  "mcpServers": {
    "agents-council": {
      "command": "node",
      "args": ["/absolute/path/to/.parley-servers/agentsCouncil/server.js"]
    }
  }
}
```

> **Find your Node path:** Run `node find_node.js` in the `.parley-servers/agentsCouncil` directory. Use that path as the `command` value if `node` alone doesn't work.

### Zed IDE

Open `~/Library/Application Support/Zed/settings.json` and add:

```json
{
  "context_servers": {
    "agents-council": {
      "command": {
        "path": "/opt/homebrew/bin/node",
        "args": ["/absolute/path/to/.parley-servers/agentsCouncil/server.js"]
      }
    }
  }
}
```

> **Note for Local Models (Ollama/Qwen/Deepseek in Zed):** 
> Local models often struggle to spontaneously trigger MCP tools and may respond with generic text instead. If your model writes out a markdown template instead of running the tool, you must explicitly instruct it. Try prompting:
> *"Use the `start_council` tool to start a session on X. Do not generate text, only use the tool."*

> Zed requires the full absolute path — the `${workspaceFolder}` variable is not supported.

### Claude Desktop

Open `~/Library/Application Support/Claude/claude_desktop_config.json` and add:

```json
{
  "mcpServers": {
    "agents-council": {
      "command": "node",
      "args": ["/absolute/path/to/.parley-servers/agentsCouncil/server.js"]
    }
  }
}
```

---

## Adding Your Own Council

1. Create a new `.md` file in the `councils/` folder, e.g. `councils/my_team.md`
2. Add agents using this format:

```markdown
# My Council

- **AgentName** [ai]: One or two sentences describing their role, expertise, and how they think.
- **HumanName** [human]: What this person is responsible for and what kind of input they provide.
```

3. Switch to it in your session:
> "Switch to the my_team council"

**Tips for writing good agent descriptions:**
- Be specific about what they know, not just their job title
- Describe *how they think* and what kind of output they produce
- For `[legendary]` agents, describe their personality and convictions — the AI needs this to respond in character
- For `[human]` agents, keep it brief — they receive a plain summary, not an AI prompt

---

## For the Codebase Overhaul Council

If you're doing a large refactor, use the `codebase_overhaul` council and follow this order:

1. **Audit first** — Summon `CodeAuditor` with your module/theme and ask for a technical debt register
2. **Plan** — Summon `DrupalArchitect` with the audit results to build a phased migration plan
3. **Safety net** — Summon `TestArchitect` to establish test coverage before changing anything
4. **Refactor** — Work through phases, summoning `DrupalArchitect` per component
5. **Performance check** — Summon `DrupalPerformanceGuard` after each phase
6. **Deployment** — Summon `DrupalDevOps` to validate the pipeline is ready
7. **Sign-off** — Summon `Mike` with a phase summary for human approval

---

## File Structure

```
.parley-servers/agentsCouncil/
├── server.js              # MCP server — the core of the system
├── client.js              # Optional Node.js client for programmatic use
├── find_node.js           # Utility: prints your Node binary path for IDE config
├── package.json
├── state.json             # Auto-generated — persists session state across IDEs
└── councils/
    ├── drupal_healthcare.md
    ├── drupal_regular.md
    ├── codebase_overhaul.md
    ├── internal_team.md
    └── legendary_architects.md
```

> `state.json` is auto-created on first use. You can add it to `.gitignore` if you don't want session history committed, or keep it tracked if your team wants to share session context.

---

## Troubleshooting

**The tools aren't showing up in my IDE**
- Make sure you ran `npm install` in the `.parley-servers/agentsCouncil` directory
- Restart your IDE after adding the MCP config
- Check the path in your config points to the actual `server.js` file
- Run `node find_node.js` to confirm your Node path is correct

**"No active session" error**
- Call `start_council` first before summoning any agents

**"Agent not found" error**
- Names are case-sensitive. Run `list_members` to see exact names
- Make sure you're on the right council — run `list_councils` to check

**"No pending summons" error**
- The agent may have already claimed their summons. Run `get_active_summons` to check status
- Or the agent name doesn't match exactly — check `list_members`

**state.json conflicts on the team**
- This file is last-write-wins. For team use, it's best to treat each developer's local copy as their own session, or coordinate who is running the active session at any given time
