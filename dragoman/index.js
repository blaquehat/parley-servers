#!/usr/bin/env node
const { spawn } = require('child_process');
const path = require('path');

// Ultra-stable Node -> Python Bridge (Unified Pipeline)
const pyPath = '/usr/bin/python3';
const scriptPath = path.join(__dirname, 'mcp_server.py');

console.error(`[BRIDGE] Spawning Python: ${pyPath} ${scriptPath}`);

// Spawn the robust python MCP server unbuffered, piping all stdio directly.
const py = spawn(pyPath, ['-u', scriptPath], {
  stdio: ['pipe', 'pipe', 'pipe']
});

process.stdin.pipe(py.stdin);
py.stdout.pipe(process.stdout);
py.stderr.pipe(process.stderr);

py.on('exit', (code, signal) => {
  console.error(`[BRIDGE] Python exited with code ${code} and signal ${signal}`);
  process.exit(code || 0);
});

py.on('error', (err) => {
  console.error(`[BRIDGE] CRITICAL: Failed to spawn Python: ${err.message}`);
  process.exit(1);
});

py.stderr.on('data', (data) => {
  // No need to wrap in extra logging, just pass it through exactly as python wrote it
  process.stderr.write(data);
});
