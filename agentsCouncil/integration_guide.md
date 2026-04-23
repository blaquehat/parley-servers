# Agents Council Integration Guide

This MCP server allows multiple agents to collaborate in a shared "Council" session. Because state is persisted to `state.json`, you can move between different IDEs and keep the same conversation context.

## 1. Zed IDE
To add this to Zed, open your settings (Cmd+,) or `~/Library/Application Support/Zed/settings.json` and add the following to the `context_servers` section:

```json
{
  "context_servers": {
    "agents-council": {
      "command": "node",
      "args": ["~/Development/uwmed/.parley-servers/agentsCouncil/server.js"]
    }
  }
}
```

## 2. GitHub Copilot
If you are using the MCP extension for GitHub Copilot, add the server to your configuration:

```json
{
  "mcpServers": {
    "agents-council": {
      "command": "/usr/local/bin/node",
      "args": ["~/Development/uwmed/.parley-servers/agentsCouncil/server.js"]
    }
  }
}
```

## 4. Team Portability (Sharing with others)
If you are sharing this repo with teammates, the `~/` path is a good start, but note that some IDEs (like Zed) may require the full absolute path unique to their machine.

**Recommended Setup for Teammates:**
1. Clone the repo.
2. Run `npm install` inside the `.parley-servers/agentsCouncil` directory.
3. In their IDE, they should use their specific path:
   - **Mac**: `/Users/USERNAME/Development/uwmed/.parley-servers/agentsCouncil/server.js`
   - **Linux**: `/home/USERNAME/Development/uwmed/.parley-servers/agentsCouncil/server.js`

**Pro Tip:** If their IDE supports it (like VS Code), they can use the `${workspaceFolder}` variable:
`"args": ["${workspaceFolder}/.parley-servers/agentsCouncil/server.js"]`
