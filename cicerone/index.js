#!/usr/bin/env node
'use strict';
const { Server }               = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} = require('@modelcontextprotocol/sdk/types.js');
const path = require('path');
const fs   = require('fs');

const LIAISON_CONFIG_PATH = path.resolve(__dirname, '../shared/liaison_config.json');

async function callLiaison(prompt) {
  if (!fs.existsSync(LIAISON_CONFIG_PATH)) return null;
  try {
    const config = JSON.parse(fs.readFileSync(LIAISON_CONFIG_PATH, 'utf8'));
    // Try Ollama first
    const url = `${config.ollama.HOST}/api/generate`;
    
    // Quick availability check (1s timeout)
    try {
      const checkController = new AbortController();
      const checkId = setTimeout(() => checkController.abort(), 1000);
      const checkRes = await fetch(config.ollama.HOST, { signal: checkController.signal });
      clearTimeout(checkId);
      if (!checkRes.ok && checkRes.status !== 404) return null; // 404 is fine for a root hit
    } catch (e) {
      return null; // Liaison is likely offline
    }

    const body = {
      model: config.ollama.MODELS[0],
      prompt: prompt,
      stream: false,
    };
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(url, {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal
    });
    clearTimeout(id);
    const json = await res.json();
    return json.response;
  } catch (e) {
    process.stderr.write(`Liaison Error: ${e.message}\n`);
    return null;
  }
}

function parseArgs() {
  const args   = process.argv.slice(2);
  const config = {
    sessionPath: '.agents/shared/journals',
    debug:       false,
  };
  for (const arg of args) {
    if (arg === '--debug') {
      config.debug = true;
      continue;
    }
    const match = arg.match(/^--([^=]+)=(.*)$/);
    if (!match) continue;
    const [, key, value] = match;
    if (key === 'path' && value) {
      config.sessionPath = value;
    }
  }
  return config;
}
const CONFIG = parseArgs();
const SESSION_PATH = path.isAbsolute(CONFIG.sessionPath)
  ? CONFIG.sessionPath
  : path.resolve(process.cwd(), CONFIG.sessionPath);

const SESSION_FILES = {
  contextSnapshot: 'context-snapshot.md',
  currentWork:     'current-work.md',
  decisions:       'decisions.md',
  preferences:     'preferences.md',
  wishlist:        'wishlist.md',
  unexplained:     'the-unexplained-episodes.md',
};

const LIBRARIAN_FILES = {
  config:    'config.json',
  anatomy:   'anatomy.json',
  cerebrum:  'cerebrum.json',
  ledger:    'session_ledger.json',
};

const LIBRARIAN_PATH = path.join(__dirname, '..', '..', '.agents', 'shared', 'librarian');
// process.stderr.write(`DEBUG: LIBRARIAN_PATH resolved to: ${LIBRARIAN_PATH}\n`);
const librarianPath = (key) => path.join(LIBRARIAN_PATH, LIBRARIAN_FILES[key]);

const filePath = (key) => path.join(SESSION_PATH, SESSION_FILES[key]);

const TOOL_DEFINITIONS = [
  {
    name:        'check_recall',
    description: 'Lightweight startup check. Returns last session date, active work summary, and load recommendation.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name:        'load_context',
    description: 'Reads context-snapshot.md and returns summary + project field check.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name:        'load_full_context',
    description: 'Reads all session files for deep recovery.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name:        'preview_save',
    description: 'Drafts potential updates for user review.',
    inputSchema: {
      type:       'object',
      properties: {
        updates: { type: 'array', items: { type: 'object', properties: { file: { type: 'string' }, content: { type: 'string' } } } },
      },
    },
  },
  {
    name:        'confirm_save',
    description: 'Writes the pending save after user confirmation.',
    inputSchema: { type: 'object', properties: { previewId: { type: 'string' } } },
  },
  {
    name:        'route_item',
    description: 'Tags something mid-session for later saving.',
    inputSchema: { type: 'object', properties: { file: { type: 'string' }, content: { type: 'string' } } },
  },
  {
    name:        'scaffold_files',
    description: 'Creates missing session files from templates.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name:        'get_session_path',
    description: 'Returns the resolved absolute path where session files are stored.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name:        'librarian_init',
    description: 'Initializes the Librarian directory and configuration in .agents/shared/librarian.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name:        'librarian_scan',
    description: 'Triggers the Librarian Bot to re-index the project. Use after significant code changes.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name:        'librarian_query',
    description: 'Semantic search of the project anatomy. Ask where features or logic are located.',
    inputSchema: {
      type:       'object',
      properties: {
        query: { type: 'string', description: 'Natural language question about the codebase.' },
      },
      required: ['query'],
    },
  },
  {
    name:        'librarian_learn',
    description: 'Formally records a correction or pattern into the structured Cerebrum memory.',
    inputSchema: {
      type:       'object',
      properties: {
        type: { type: 'string', enum: ['rule', 'correction', 'vocabulary'] },
        content: { type: 'string' },
      },
      required: ['type', 'content'],
    },
  },
  {
    name:        'librarian_briefing',
    description: 'The "Situational Report" for the current session. Combines memory, rules, and anatomy status into one call.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name:        'librarian_log_read',
    description: 'Logs a file read to the session ledger to prevent redundant operations.',
    inputSchema: { type: 'object', properties: { file: { type: 'string' } }, required: ['file'] },
  },
];

async function handleToolCall(name, args) {
  try {
    switch (name) {
      case 'check_recall': {
        const work = fs.existsSync(filePath('currentWork')) ? fs.readFileSync(filePath('currentWork'), 'utf8').slice(0, 500) : 'No recent work found.';
        const decisions = fs.existsSync(filePath('decisions')) ? fs.readFileSync(filePath('decisions'), 'utf8').slice(0, 500) : 'No recent decisions found.';
        
        // Librarian Health Check
        let librarianStatus = 'Healthy';
        const anatomyP = librarianPath('anatomy');
        if (!fs.existsSync(anatomyP)) {
          librarianStatus = 'WARNING: Anatomy index missing. Run librarian_scan.';
        } else {
          const stat = fs.statSync(anatomyP);
          const daysOld = (new Date() - stat.mtime) / (1000 * 60 * 60 * 24);
          if (daysOld > 3) librarianStatus = `WARNING: Anatomy index is ${Math.round(daysOld)} days old. Consider librarian_scan.`;
        }

        return { content: [{ type: 'text', text: `Last Work Snippet:\n${work}\n\nRecent Decisions Snippet:\n${decisions}\n\nLibrarian Status: ${librarianStatus}` }] };
      }
      case 'load_context': {
        const p = filePath('contextSnapshot');
        if (!fs.existsSync(p)) return { content: [{ type: 'text', text: 'No context snapshot found.' }] };
        const content = fs.readFileSync(p, 'utf8');
        return { content: [{ type: 'text', text: content }] };
      }
      case 'load_full_context': {
        let full = '';
        for (const [key, file] of Object.entries(SESSION_FILES)) {
          const p = filePath(key);
          if (fs.existsSync(p)) {
            full += `\n--- ${file} ---\n${fs.readFileSync(p, 'utf8')}\n`;
          }
        }
        return { content: [{ type: 'text', text: full || 'No session files found.' }] };
      }
      case 'get_session_path':
        return { content: [{ type: 'text', text: 'Session files path: ' + SESSION_PATH }] };
      case 'route_item': {
        const { file, content } = args;
        const p = path.join(SESSION_PATH, file);
        fs.appendFileSync(p, `\n\n${new Date().toISOString().split('T')[0]}\n${content}`);
        return { content: [{ type: 'text', text: `Appended to ${file}` }] };
      }
      case 'librarian_init': {
        if (!fs.existsSync(LIBRARIAN_PATH)) fs.mkdirSync(LIBRARIAN_PATH, { recursive: true });
        const defaultConfig = {
          project_id: path.basename(process.cwd()),
          indexing: {
            deep_scan: ["docroot/modules/custom", "docroot/themes/custom"],
            shallow_scan: ["docroot/modules/contrib", "core"],
            ignore: [".git", "node_modules", "vendor", "sites/default/files"]
          },
          cerebrum: { auto_log_corrections: true }
        };
        if (!fs.existsSync(librarianPath('config'))) fs.writeFileSync(librarianPath('config'), JSON.stringify(defaultConfig, null, 2));
        if (!fs.existsSync(librarianPath('anatomy'))) fs.writeFileSync(librarianPath('anatomy'), JSON.stringify({ files: [], last_scan: null }, null, 2));
        if (!fs.existsSync(librarianPath('cerebrum'))) fs.writeFileSync(librarianPath('cerebrum'), JSON.stringify({ rules: [], corrections: [], vocabulary: {} }, null, 2));
        if (!fs.existsSync(librarianPath('ledger'))) fs.writeFileSync(librarianPath('ledger'), JSON.stringify({ reads: [] }, null, 2));
        return { content: [{ type: 'text', text: 'Librarian initialized at ' + LIBRARIAN_PATH }] };
      }
      case 'librarian_scan': {
        const { spawnSync } = require('child_process');
        const botPath = path.resolve(__dirname, 'librarian_bot.js');
        const configP = librarianPath('config');
        try {
          const result = spawnSync(process.execPath, [botPath, `--config=${configP}`], { cwd: process.cwd(), encoding: 'utf8' });
          if (result.error) throw result.error;
          if (result.status !== 0) throw new Error(result.stderr || result.stdout);
          return { content: [{ type: 'text', text: result.stdout }] };
        } catch (e) {
          return { content: [{ type: 'text', text: 'Scan failed: ' + e.message }], isError: true };
        }
      }
      case 'librarian_query': {
        const { query } = args;
        const anatomyFile = librarianPath('anatomy');
        if (!fs.existsSync(anatomyFile)) return { content: [{ type: 'text', text: 'Anatomy index not found. Run librarian_scan first.' }], isError: true };
        const anatomy = JSON.parse(fs.readFileSync(anatomyFile, 'utf8'));
        
        // Phase 1: Local LLM semantic filter (if available)
        let filteredPaths = null;
        const liaisonResponse = await callLiaison(
          `You are a project librarian. The user is looking for: "${query}". ` +
          `Below is a list of top-level directories in the project. ` +
          `Identify which directories are most likely to contain the relevant files. ` +
          `Output ONLY a comma-separated list of directories — nothing else.\n\n` +
          `Directories:\n${Array.from(new Set(anatomy.files.map(f => f.path.split('/')[0]))).join('\n')}`
        );

        if (liaisonResponse) {
          const targets = liaisonResponse.split(',').map(t => t.trim().toLowerCase());
          filteredPaths = anatomy.files.filter(f => targets.some(t => f.path.toLowerCase().includes(t)));
        }

        const pool = filteredPaths || anatomy.files;
        
        // Phase 2: Keyword match within the filtered pool
        const keywords = query.toLowerCase().split(/\s+/).filter(k => k.length > 2);
        const matches = pool
          .filter(f => keywords.some(k => f.path.toLowerCase().includes(k) || (f.summary && f.summary.toLowerCase().includes(k))))
          .slice(0, 15);

        let result = `Librarian results for "${query}":\n\n`;
        if (liaisonResponse) result += `(Liaison identified high-probability zones: ${liaisonResponse.trim()})\n\n`;
        
        matches.forEach(m => {
          result += `- ${m.path} (${m.isDeep ? 'Custom' : 'Core'})\n  Summary: ${m.summary}\n`;
        });
        return { content: [{ type: 'text', text: result || 'No matches found in the index.' }] };
      }
      case 'librarian_learn': {
        const { type, content } = args;
        const cerebrumP = librarianPath('cerebrum');
        if (!fs.existsSync(cerebrumP)) return { content: [{ type: 'text', text: 'Cerebrum memory not found.' }], isError: true };
        const cerebrum = JSON.parse(fs.readFileSync(cerebrumP, 'utf8'));
        
        const entry = { date: new Date().toISOString().split('T')[0], content };
        if (type === 'rule') cerebrum.rules.push(entry);
        else if (type === 'correction') cerebrum.corrections.push(entry);
        else if (type === 'vocabulary') {
          const parts = content.split(':');
          if (parts.length >= 2) {
            const key = parts[0].trim();
            const val = parts.slice(1).join(':').trim();
            cerebrum.vocabulary[key] = val;
          } else {
            cerebrum.vocabulary[content.trim()] = "Defined in conversation.";
          }
        }

        fs.writeFileSync(cerebrumP, JSON.stringify(cerebrum, null, 2));
        return { content: [{ type: 'text', text: `Recorded ${type} in Cerebrum memory.` }] };
      }
      case 'librarian_briefing': {
        const work = fs.existsSync(filePath('currentWork')) ? fs.readFileSync(filePath('currentWork'), 'utf8') : 'No current work logged.';
        const decisions = fs.existsSync(filePath('decisions')) ? fs.readFileSync(filePath('decisions'), 'utf8').slice(0, 1000) : 'No decisions logged.';
        const cerebrumP = librarianPath('cerebrum');
        const cerebrum = fs.existsSync(cerebrumP) ? JSON.parse(fs.readFileSync(cerebrumP, 'utf8')) : { rules: [] };
        
        const ledgerP = librarianPath('ledger');
        const ledger = fs.existsSync(ledgerP) ? JSON.parse(fs.readFileSync(ledgerP, 'utf8')) : { reads: [] };

        let report = `### LIBRARIAN BRIEFING (Situation Report)\n\n`;
        report += `#### 1. Current Progress\n${work.slice(0, 500)}...\n\n`;
        report += `#### 2. Active Rules & Conventions\n${cerebrum.rules.map(r => `- ${r.content}`).join('\n') || 'No custom rules active.'}\n\n`;
        report += `#### 3. Session Context\nFiles read this session: ${ledger.reads.length}\n`;
        
        const anatomyP = librarianPath('anatomy');
        if (fs.existsSync(anatomyP)) {
          const anatomy = JSON.parse(fs.readFileSync(anatomyP, 'utf8'));
          report += `Project Index: ${anatomy.files.length} files mapped (Last scan: ${anatomy.last_scan})\n`;
        }

        return { content: [{ type: 'text', text: report }] };
      }
      case 'librarian_log_read': {
        const { file } = args;
        const ledgerP = librarianPath('ledger');
        const ledger = fs.existsSync(ledgerP) ? JSON.parse(fs.readFileSync(ledgerP, 'utf8')) : { reads: [] };
        if (!ledger.reads.includes(file)) {
          ledger.reads.push(file);
          fs.writeFileSync(ledgerP, JSON.stringify(ledger, null, 2));
          return { content: [{ type: 'text', text: `Logged read of ${file}` }] };
        }
        return { content: [{ type: 'text', text: `${file} already in ledger.` }] };
      }
      default:
        return { content: [{ type: 'text', text: 'Unknown tool: ' + name }], isError: true };
    }
  } catch (err) {
    return { content: [{ type: 'text', text: 'IO Error: ' + err.message }], isError: true };
  }
}

const server = new Server(
  { name: 'cicerone', version: '1.2.0' },
  { capabilities: { tools: {} } }
);
server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOL_DEFINITIONS }));
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args = {} } = request.params;
  try { return await handleToolCall(name, args); }
  catch (err) { return { content: [{ type: 'text', text: 'Error: ' + err.message }], isError: true }; }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
main().catch((err) => {
  process.stderr.write('Fatal: ' + err.message + '\n');
  process.exit(1);
});
