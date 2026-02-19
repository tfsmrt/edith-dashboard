#!/usr/bin/env node
/**
 * Sync .mission-control/ JSON files to Cloudflare KV via the Worker API.
 * Usage: node scripts/sync-to-kv.js
 */
const https = require('https');
const fs = require('fs');
const path = require('path');

const API = process.env.API_URL || 'https://edith-api.tfsmrt.workers.dev';
const MC = path.join(__dirname, '..', '.mission-control');

function putJSON(endpoint, data) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(data);
    const url = new URL(API + endpoint);
    const req = https.request(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    }, res => { let b = ''; res.on('data', c => b += c); res.on('end', () => resolve({ status: res.statusCode, body: b })); });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function loadDir(dir) {
  const full = path.join(MC, dir);
  if (!fs.existsSync(full)) return [];
  return fs.readdirSync(full)
    .filter(f => f.endsWith('.json'))
    .map(f => JSON.parse(fs.readFileSync(path.join(full, f), 'utf8')));
}

async function main() {
  const agents = loadDir('agents');
  const humans = loadDir('humans');
  const queue = loadDir('queue');

  console.log(`Syncing ${agents.length} agents, ${humans.length} humans, ${queue.length} queue jobs...`);

  const r1 = await putJSON('/api/agents', agents);
  console.log(`  agents: ${r1.status}`);

  const r2 = await putJSON('/api/humans', humans);
  console.log(`  humans: ${r2.status}`);

  const r3 = await putJSON('/api/queue', queue);
  console.log(`  queue: ${r3.status}`);

  console.log('Done!');
}

main().catch(e => { console.error(e); process.exit(1); });
