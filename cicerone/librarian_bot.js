#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/**
 * Librarian Bot - Project Indexer
 * Focuses on deep scanning custom code and shallow scanning core/contrib.
 */

const args = process.argv.slice(2);
let configMatch = args.find(a => a.match(/^--config=/));
let configVal = configMatch ? configMatch.split('=')[1].replace(/^["'](.+)["']$/, '$1') : null;
const CONFIG_PATH = configVal ? path.resolve(configVal) : path.resolve(process.cwd(), '.agents/shared/librarian/config.json');
const ANATOMY_PATH = path.join(path.dirname(CONFIG_PATH), 'anatomy.json');

let config;
try {
  config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
} catch (e) {
  console.error('LIBRARIAN: Error parsing config.json at ' + CONFIG_PATH + ': ' + e.message);
  process.exit(1);
}

function getFiles(dir, deep = true, depth = 0) {
  let results = [];
  if (!fs.existsSync(dir)) return results;
  
  const list = fs.readdirSync(dir);
  for (let file of list) {
    const fullPath = path.join(dir, file);
    const relPath = path.relative(process.cwd(), fullPath);
    
    // Check ignore patterns
    if (config.indexing.ignore.some(pattern => relPath.includes(pattern))) continue;

    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      const maxDepth = config.indexing.maxDepth || 10;
      if (deep || depth < maxDepth) {
        results = results.concat(getFiles(fullPath, deep, depth + 1));
      }
    } else {
      results.push({
        path: relPath,
        size: stat.size,
        mtime: stat.mtime,
        isDeep: deep
      });
    }
  }
  return results;
}

function extractSummary(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8').slice(0, 1000);
    // Try to find Drupal @file block
    const fileMatch = content.match(/@file\s+([\s\S]+?)\*/);
    if (fileMatch) return fileMatch[1].replace(/\n/g, ' ').trim();
    
    // Try first line comment
    const lineMatch = content.match(/^(\/\/|#|\/\*+)\s*(.+)/);
    if (lineMatch) return lineMatch[2].trim();
    
    return "No summary available.";
  } catch (e) {
    return "Error reading file.";
  }
}

async function run() {
  process.stderr.write('LIBRARIAN: Starting scan...\n');
  let allFiles = [];

  // Deep Scan
  for (let dir of (config.indexing.deep_scan || [])) {
    process.stderr.write(`LIBRARIAN: Deep scanning ${dir}...\n`);
    const files = getFiles(path.resolve(process.cwd(), dir), true);
    allFiles = allFiles.concat(files.map(f => ({
      ...f,
      summary: extractSummary(path.resolve(process.cwd(), f.path))
    })));
  }

  // Shallow Scan
  for (let dir of (config.indexing.shallow_scan || [])) {
    process.stderr.write(`LIBRARIAN: Shallow scanning ${dir}...\n`);
    const files = getFiles(path.resolve(process.cwd(), dir), false);
    allFiles = allFiles.concat(files.map(f => ({
      ...f,
      summary: "Contrib/Core module (shallow index)"
    })));
  }

  const output = {
    project_id: config.project_id,
    last_scan: new Date().toISOString(),
    files: allFiles
  };

  fs.writeFileSync(ANATOMY_PATH, JSON.stringify(output, null, 2));
  process.stderr.write(`LIBRARIAN: Scan complete. ${allFiles.length} files indexed.\n`);
}

run().catch(err => {
  console.error('LIBRARIAN: Fatal error:', err);
  process.exit(1);
});
