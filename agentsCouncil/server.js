#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { CallToolRequestSchema, ListToolsRequestSchema } = require('@modelcontextprotocol/sdk/types.js');

// ─── Paths & Config ───────────────────────────────────────────────────────────
const STATE_FILE_PATH = path.resolve(__dirname, 'state.json');
const COUNCILS_DIR = path.resolve(__dirname, 'councils');
const LIAISON_CONFIG_PATH = path.resolve(__dirname, '../shared/liaison_config.json');
const LIBRARIAN_PATH = path.resolve(__dirname, '../../.agents/shared/librarian'); 

if (!fs.existsSync(COUNCILS_DIR)) {
  fs.mkdirSync(COUNCILS_DIR, { recursive: true });
}

// ─── Logging (MCP Standard) ───────────────────────────────────────────────────
function log(msg) {
  process.stderr.write(`COUNCIL: [${new Date().toISOString().split('T')[1].split('.')[0]}] ${msg}\n`);
}

// ─── Shared Intelligence ──────────────────────────────────────────────────────
async function callLiaison(prompt) {
  if (!fs.existsSync(LIAISON_CONFIG_PATH)) return null;
  try {
    const config = JSON.parse(fs.readFileSync(LIAISON_CONFIG_PATH, 'utf8'));
    const url = `${config.ollama.HOST}/api/generate`;
    const res = await fetch(url, {
      method: 'POST',
      body: JSON.stringify({ model: config.ollama.MODELS[0], prompt: prompt, stream: false }),
      headers: { 'Content-Type': 'application/json' }
    });
    const json = await res.json();
    return json.response;
  } catch (e) {
    return null;
  }
}

function getLibrarianBriefing() {
  const briefingP = path.join(LIBRARIAN_PATH, 'cerebrum.json');
  if (!fs.existsSync(briefingP)) return "";
  try {
    const cerebrum = JSON.parse(fs.readFileSync(briefingP, 'utf8'));
    if (!cerebrum.rules || cerebrum.rules.length === 0) return "";
    return `\nPROJECT RULES & CONVENTIONS (from Librarian):\n${cerebrum.rules.map(r => `- ${r.content}`).join('\n')}\n`;
  } catch (e) { return ""; }
}

// Ensure stdout is flushed before any other operations
process.stdout.flush && process.stdout.flush();

// ---------------------------------------------------------------------------
// State management
// ---------------------------------------------------------------------------
let state = {
  sessions: {
    default: {
      topic: "General Discussion",
      history: [],
      activeSummons: [],
      escalations: [],
      status: "active",
      activeCouncil: "drupal_healthcare",
    },
  },
  currentSessionId: "default",
};

function loadState() {
  try {
    if (fs.existsSync(STATE_FILE_PATH)) {
      state = JSON.parse(fs.readFileSync(STATE_FILE_PATH, "utf8"));
    }
  } catch (err) {
    log("Error loading state: " + err.message);
  }
}

function saveState() {
  try {
    const tempPath = `${STATE_FILE_PATH}.tmp`;
    fs.writeFileSync(tempPath, JSON.stringify(state, null, 2));
    fs.renameSync(tempPath, STATE_FILE_PATH);
  } catch (err) {
    log("Error saving state: " + err.message);
  }
}

loadState();

// ---------------------------------------------------------------------------
// Council registry parser
// ---------------------------------------------------------------------------
function parseCouncilMembers(councilName) {
  try {
    const councilPath = path.join(COUNCILS_DIR, `${councilName}.md`);
    if (!fs.existsSync(councilPath)) return [];

    const content = fs.readFileSync(councilPath, "utf8");
    const members = [];

    for (const line of content.split("\n")) {
      const match = line.match(/^\s*-\s*\*\*([^*]+)\*\*(?:\s*\[(\w+)\])?:\s*(.*)$/);
      if (match) {
        members.push({
          name: match[1].trim(),
          type: (match[2] || "ai").toLowerCase(),
          description: match[3].trim(),
        });
      }
    }
    return members;
  } catch (err) {
    log("Error reading council registry: " + err.message);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Briefing builders
// ---------------------------------------------------------------------------
function buildAiBriefing({ summon, session, recentHistory }) {
  const historyText = recentHistory.map((h) => `  [${h.sender}]: ${h.content}`).join("\n");
  const libBrief = getLibrarianBriefing();
  return [
    `╔══════════════════════════════════════╗`,
    `║         AGENT BRIEFING  [AI]         ║`,
    `╚══════════════════════════════════════╝`,
    ``,
    `AGENT:    ${summon.agentName}`,
    `PERSONA:  ${summon.persona}`,
    ``,
    `COUNCIL TOPIC:`,
    `  "${session.topic}"`,
    ``,
    `YOUR ASSIGNED QUESTION:`,
    `  "${summon.question}"`,
    ``,
    libBrief,
    summon.reason ? `CONTEXT FROM ORCHESTRATOR:\n  ${summon.reason}\n` : null,
    `RECENT COUNCIL HISTORY (last ${recentHistory.length} messages):`,
    historyText || "  (No prior messages — you are first to respond.)",
    ``,
    `══════════════════════════════════════`,
    `Respond in-character as ${summon.agentName}, drawing fully on your expertise.`,
    `Be specific and technical. Produce actionable output — code, config, or a`,
    `concrete plan — not just general advice.`,
    `When done, call send_message({ sender: "${summon.agentName}", message: "..." }).`,
  ].filter(Boolean).join("\n");
}

function buildLegendaryBriefing({ summon, session, recentHistory }) {
  const historyText = recentHistory.map((h) => `  [${h.sender}]: ${h.content}`).join("\n");
  const libBrief = getLibrarianBriefing();
  return [
    `╔══════════════════════════════════════╗`,
    `║    AGENT BRIEFING  [LEGENDARY]       ║`,
    `╚══════════════════════════════════════╝`,
    ``,
    `YOU ARE: ${summon.agentName}`,
    ``,
    `YOUR CHARACTER:`,
    `  ${summon.persona}`,
    ``,
    `COUNCIL TOPIC:`,
    `  "${session.topic}"`,
    ``,
    `QUESTION FOR YOU:`,
    `  "${summon.question}"`,
    ``,
    libBrief,
    summon.reason ? `CONTEXT:\n  ${summon.reason}\n` : null,
    `RECENT COUNCIL HISTORY (last ${recentHistory.length} messages):`,
    historyText || "  (No prior messages — you are first to speak.)",
    ``,
    `══════════════════════════════════════`,
    `Respond in FIRST PERSON as ${summon.agentName}.`,
    `Speak from your own lived experience and convictions. Be direct and opinionated.`,
    `Reference your own work and decisions where relevant. Do not hedge excessively.`,
    `Push back on bad ideas plainly. Show the simpler path when you see one.`,
    `When done, call send_message({ sender: "${summon.agentName}", message: "..." }).`,
  ].filter(Boolean).join("\n");
}

function buildHumanBriefing({ summon, session, recentHistory }) {
  const historyText = recentHistory.map((h) => `  [${h.sender}]: ${h.content}`).join("\n");
  return [
    `╔══════════════════════════════════════╗`,
    `║      COUNCIL SUMMARY  [HUMAN]        ║`,
    `╚══════════════════════════════════════╝`,
    ``,
    `Hi ${summon.agentName},`,
    ``,
    `The council has been working on:`,
    `  "${session.topic}"`,
    ``,
    `YOUR INPUT IS NEEDED:`,
    `  "${summon.question}"`,
    ``,
    summon.reason ? `WHY YOU'VE BEEN SUMMONED:\n  ${summon.reason}\n` : null,
    `RECENT DISCUSSION (last ${recentHistory.length} messages):`,
    historyText || "  (No prior messages yet.)",
    ``,
    `══════════════════════════════════════`,
    `To respond: call send_message({ sender: "${summon.agentName}", message: "your response" })`,
    `To review the full history first: call get_council_history()`,
  ].filter(Boolean).join("\n");
}

function buildBriefing(type, args) {
  switch (type) {
    case "legendary": return buildLegendaryBriefing(args);
    case "human":     return buildHumanBriefing(args);
    default:          return buildAiBriefing(args);
  }
}

// ---------------------------------------------------------------------------
// Server setup
// ---------------------------------------------------------------------------
const server = new Server(
  { name: "agents-council", version: "2.3.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "start_council",
        description: "Start a new council session on a topic.",
        inputSchema: {
          type: "object",
          properties: { topic: { type: "string" } },
          required: ["topic"],
        },
      },
      {
        name: "list_councils",
        description: "List all available council registries.",
        inputSchema: { type: "object", properties: {} },
      },
      {
        name: "select_council",
        description: "Switch active council by name.",
        inputSchema: {
          type: "object",
          properties: { name: { type: "string" } },
          required: ["name"],
        },
      },
      {
        name: "list_members",
        description: "List agents in active council.",
        inputSchema: { type: "object", properties: {} },
      },
      {
        name: "summon_member",
        description: "Summon an agent with a question.",
        inputSchema: {
          type: "object",
          properties: {
            name: { type: "string" },
            question: { type: "string" },
            reason: { type: "string" },
          },
          required: ["name", "question"],
        },
      },
      {
        name: "get_active_summons",
        description: "List pending summons.",
        inputSchema: { type: "object", properties: {} },
      },
      {
        name: "claim_summon",
        description: "Claim summons and get briefing. MUST follow with send_message.",
        inputSchema: {
          type: "object",
          properties: { name: { type: "string" } },
          required: ["name"],
        },
      },
      {
        name: "get_my_prompt",
        description: "Refresh briefing.",
        inputSchema: {
          type: "object",
          properties: { name: { type: "string" }, history_limit: { type: "number" } },
          required: ["name"],
        },
      },
      {
        name: "send_message",
        description: "Post response to council.",
        inputSchema: {
          type: "object",
          properties: { sender: { type: "string" }, message: { type: "string" } },
          required: ["sender", "message"],
        },
      },
      {
        name: "get_council_history",
        description: "Read transcript.",
        inputSchema: {
          type: "object",
          properties: { limit: { type: "number" } },
        },
      },
      {
        name: "export_council_minutes",
        description: "Save minutes to markdown.",
        inputSchema: { type: "object", properties: {} },
      },
      {
        name: "escalate_to_council",
        description: "Ask outside specialist for help.",
        inputSchema: {
          type: "object",
          properties: {
            from_agent: { type: "string" },
            target_council: { type: "string" },
            target_agent: { type: "string" },
            question: { type: "string" },
            reason: { type: "string" },
          },
          required: ["from_agent", "target_council", "target_agent", "question"],
        },
      },
      {
        name: "resolve_escalation",
        description: "Submit specialist response.",
        inputSchema: {
          type: "object",
          properties: {
            escalation_id: { type: "string" },
            agent_name: { type: "string" },
            response: { type: "string" },
          },
          required: ["escalation_id", "agent_name", "response"],
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  loadState();
  const { name, arguments: args } = request.params;
  const sessionId = state.currentSessionId;
  const session = state.sessions[sessionId];

  if (!session) {
    return { content: [{ type: "text", text: "No active session. Call start_council first." }] };
  }

  switch (name) {
    case "start_council": {
      const newId = Date.now().toString();
      state.sessions[newId] = {
        topic: args.topic,
        history: [{ sender: "System", content: `Council convened on: "${args.topic}"`, timestamp: new Date().toISOString() }],
        activeSummons: [],
        escalations: [],
        activeCouncil: session?.activeCouncil || "drupal_healthcare",
        status: "active",
      };
      state.currentSessionId = newId;
      saveState();
      return { content: [{ type: "text", text: `✅ Council session started: "${args.topic}"` }] };
    }
    case "list_councils": {
      const files = fs.readdirSync(COUNCILS_DIR).filter(f => f.endsWith(".md")).map(f => f.replace(".md", ""));
      return { content: [{ type: "text", text: `Available Councils:\n${files.join('\n')}` }] };
    }
    case "select_council": {
      session.activeCouncil = args.name;
      saveState();
      return { content: [{ type: "text", text: `✅ Switched to council: ${args.name}` }] };
    }
    case "list_members": {
      const members = parseCouncilMembers(session.activeCouncil);
      const list = members.map(m => `- **${m.name}** [${m.type}]\n  ${m.description}`).join("\n\n");
      return { content: [{ type: "text", text: `Members of ${session.activeCouncil}:\n\n${list}` }] };
    }
    case "summon_member": {
      const members = parseCouncilMembers(session.activeCouncil);
      const member = members.find(m => m.name.toLowerCase() === args.name.toLowerCase());
      if (!member) return { content: [{ type: "text", text: `❌ Agent '${args.name}' not found.` }] };
      session.activeSummons.push({
        agentName: member.name, agentType: member.type, persona: member.description,
        question: args.question, reason: args.reason || "", status: "pending", timestamp: new Date().toISOString()
      });
      session.history.push({ sender: "System", content: `${member.name} summoned: "${args.question}"`, timestamp: new Date().toISOString() });
      saveState();
      return { content: [{ type: "text", text: `✅ ${member.name} summoned.` }] };
    }
    case "get_active_summons": {
      const list = session.activeSummons.map(s => `- [${s.status}] **${s.agentName}**: "${s.question}"`).join("\n");
      return { content: [{ type: "text", text: `Active Summons:\n${list || "None"}` }] };
    }
    case "claim_summon": {
      const summon = session.activeSummons.find(s => s.agentName.toLowerCase() === args.name.toLowerCase() && s.status === "pending");
      if (!summon) return { content: [{ type: "text", text: `❌ No pending summons for '${args.name}'.` }] };
      summon.status = "claimed";
      saveState();
      const briefing = buildBriefing(summon.agentType, { summon, session, recentHistory: session.history.slice(-10) });
      return { content: [{ type: "text", text: briefing }] };
    }
    case "send_message": {
      session.history.push({ sender: args.sender, content: args.message, timestamp: new Date().toISOString() });
      const idx = session.activeSummons.findIndex(s => s.agentName.toLowerCase() === args.sender.toLowerCase());
      if (idx !== -1) session.activeSummons.splice(idx, 1);
      saveState();
      return { content: [{ type: "text", text: `✅ Message from ${args.sender} recorded.` }] };
    }
    case "get_council_history": {
      const messages = args.limit ? session.history.slice(-args.limit) : session.history;
      const text = messages.map(h => `**${h.sender}**:\n${h.content}`).join("\n\n---\n\n");
      return { content: [{ type: "text", text }] };
    }
    case "escalate_to_council": {
      const escId = `esc_${Date.now()}`;
      session.escalations.push({ id: escId, fromAgent: args.from_agent, status: "pending" });
      session.activeSummons.push({
        agentName: args.target_agent, status: "pending", question: args.question, reason: `ESCALATION [${escId}]: From ${args.from_agent}.`, agentType: "ai", persona: "Specialist"
      });
      saveState();
      return { content: [{ type: "text", text: `✅ Escalation ${escId} created.` }] };
    }
    case "resolve_escalation": {
      const esc = session.escalations.find(e => e.id === args.escalation_id);
      if (!esc) return { content: [{ type: "text", text: "❌ Escalation not found." }] };
      session.history.push({ sender: `${args.agent_name} [Spec]`, content: args.response, timestamp: new Date().toISOString() });
      esc.status = "resolved";
      saveState();
      return { content: [{ type: "text", text: "✅ Escalation resolved." }] };
    }
    default:
      return { content: [{ type: "text", text: "Unknown tool" }] };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  process.stderr.write(`agentsCouncil fatal error: ${err.message}\n`);
  process.exit(1);
});
