#!/usr/bin/env node
/**
 * Sync workspace data to Cloudflare KV via the Worker API.
 * 
 * Source of truth: ~/.openclaw/workspace/ (openclaw-backup)
 * Dashboard is just a view — all data lives in the workspace.
 * 
 * Usage: node scripts/sync-to-kv.js
 */
const https = require('https');
const fs = require('fs');
const path = require('path');

const API = process.env.API_URL || 'https://edith-api.tfsmrt.workers.dev';
const WORKSPACE = process.env.WORKSPACE || path.join(require('os').homedir(), '.openclaw', 'workspace');

function putJSON(endpoint, data) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(data);
    const url = new URL(API + endpoint);
    const req = https.request(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    }, res => { let b = ''; res.on('data', c => b += c); res.on('end', () => resolve({ status: res.statusCode })); });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function loadDir(dir) {
  const full = path.join(WORKSPACE, dir);
  if (!fs.existsSync(full)) return [];
  return fs.readdirSync(full)
    .filter(f => f.endsWith('.json'))
    .map(f => JSON.parse(fs.readFileSync(path.join(full, f), 'utf8')));
}

async function main() {
  console.log('Source:', WORKSPACE);
  
  const allAgentFiles = loadDir('agents');
  const agents = allAgentFiles.filter(a => a.id && a.id.startsWith('agent-'));
  const humans = allAgentFiles.filter(a => a.id && a.id.startsWith('human-'));
  const queue = loadDir('queue');
  const tasks = loadDir('tasks');

  console.log(`Syncing ${agents.length} agents, ${humans.length} humans, ${queue.length} jobs, ${tasks.length} tasks...`);

  console.log('  agents:', (await putJSON('/api/agents', agents)).status);
  console.log('  humans:', (await putJSON('/api/humans', humans)).status);
  console.log('  queue:', (await putJSON('/api/queue', queue)).status);
  
  // Sync tasks individually (POST creates, PUT updates)
  for (const task of tasks) {
    const r = await putJSON(`/api/tasks/${task.id}`, task);
    console.log(`  task ${task.id}: ${r.status}`);
  }

  console.log('Done!');
}

main().catch(e => { console.error(e); process.exit(1); });
