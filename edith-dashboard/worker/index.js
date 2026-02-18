/**
 * E.D.I.T.H API Worker
 *
 * Cloudflare Worker providing persistent task/chat API via KV storage.
 * Used as the backend for edith-dashboard.pages.dev
 *
 * KV Keys:
 *   task:{id}           — individual task JSON
 *   task-index          — JSON array of task IDs (for listing)
 *   chat:{channel}      — JSON array of messages
 *
 * Routes:
 *   GET    /api/tasks           — list all tasks
 *   POST   /api/tasks           — create task
 *   GET    /api/tasks/:id       — get single task
 *   PUT    /api/tasks/:id       — replace task
 *   PATCH  /api/tasks/:id       — update fields
 *   DELETE /api/tasks/:id       — delete task
 *   GET    /api/chat/:channel   — get messages
 *   POST   /api/chat/:channel   — append message
 *   GET    /api/metrics         — basic metrics
 *   GET    /health              — health check
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

const R = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });

const E = (msg, status = 400) => R({ error: msg }, status);

// ── KV helpers ────────────────────────────────────────────────────────────────

async function getIndex(kv) {
  const raw = await kv.get('task-index');
  return raw ? JSON.parse(raw) : [];
}

async function setIndex(kv, ids) {
  await kv.put('task-index', JSON.stringify(ids));
}

async function getTask(kv, id) {
  const raw = await kv.get(`task:${id}`);
  return raw ? JSON.parse(raw) : null;
}

async function putTask(kv, task) {
  await kv.put(`task:${task.id}`, JSON.stringify(task));
  // Ensure it's in the index
  const ids = await getIndex(kv);
  if (!ids.includes(task.id)) {
    ids.unshift(task.id); // newest first
    await setIndex(kv, ids);
  }
}

async function delTask(kv, id) {
  await kv.delete(`task:${id}`);
  const ids = await getIndex(kv);
  await setIndex(kv, ids.filter(i => i !== id));
}

async function listTasks(kv) {
  const ids = await getIndex(kv);
  const tasks = await Promise.all(ids.map(id => getTask(kv, id)));
  return tasks.filter(Boolean); // remove nulls from deleted tasks
}

async function getChatMessages(kv, channel) {
  const raw = await kv.get(`chat:${channel}`);
  return raw ? JSON.parse(raw) : [];
}

async function appendChat(kv, channel, msg) {
  const msgs = await getChatMessages(kv, channel);
  msgs.push(msg);
  await kv.put(`chat:${channel}`, JSON.stringify(msgs));
  return msg;
}

// ── Static data (agents/humans — not stored in KV, defined here) ──────────────

const AGENTS = [
  { id: 'agent-steve',   name: 'Steve Rogers',     designation: 'CEO — Captain of Operations',  status: 'active' },
  { id: 'agent-tony',    name: 'Tony Stark',        designation: 'Senior Developer — Iron Architect', status: 'active' },
  { id: 'agent-peter',   name: 'Peter Parker',      designation: 'Junior Developer — Web-Slinger', status: 'active' },
  { id: 'agent-steven',  name: 'Steven Strange',    designation: 'SEO Analyst — Master of the Web', status: 'active' },
  { id: 'agent-thor',    name: 'Thor Odinson',      designation: 'Marketing Lead — God of Campaigns', status: 'active' },
  { id: 'agent-natasha', name: 'Natasha Romanoff',  designation: 'QA Lead — Black Widow',        status: 'active' },
];

const HUMANS = [
  { id: 'human-somrat', name: 'Somrat', designation: 'CEO & Founder', status: 'online' },
];

// ── Router ────────────────────────────────────────────────────────────────────

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS });
    }

    const url = new URL(request.url);
    const { pathname } = url;
    const method = request.method;
    const kv = env.TASKS_KV;

    try {
      // ── Health
      if (pathname === '/health') {
        return R({ ok: true, ts: new Date().toISOString(), storage: 'kv' });
      }

      // ── GET /api/tasks
      if (pathname === '/api/tasks' && method === 'GET') {
        const tasks = await listTasks(kv);
        return R(tasks);
      }

      // ── POST /api/tasks
      if (pathname === '/api/tasks' && method === 'POST') {
        const body = await request.json();
        if (!body.title) return E('title required');
        const date = new Date().toISOString().split('T')[0].replace(/-/g, '');
        const id = body.id || `task-${date}-${Date.now()}`;
        const task = {
          ...body,
          id,
          status: body.status || 'INBOX',
          created_at: body.created_at || new Date().toISOString(),
          updated_at: new Date().toISOString(),
          comments: body.comments || [],
          deliverables: body.deliverables || [],
          dependencies: body.dependencies || [],
          blocked_by: body.blocked_by || [],
        };
        await putTask(kv, task);
        return R(task, 201);
      }

      // ── /api/tasks/:id
      const taskMatch = pathname.match(/^\/api\/tasks\/([^/]+)$/);
      if (taskMatch) {
        const id = taskMatch[1];

        if (method === 'GET') {
          const task = await getTask(kv, id);
          return task ? R(task) : E('Task not found', 404);
        }

        if (method === 'PUT') {
          const body = await request.json();
          const existing = await getTask(kv, id) || {};
          const task = { ...existing, ...body, id, updated_at: new Date().toISOString() };
          await putTask(kv, task);
          return R(task);
        }

        if (method === 'PATCH') {
          const body = await request.json();
          const existing = await getTask(kv, id);
          if (!existing) return E('Task not found', 404);
          const allowed = ['status', 'assignee', 'priority', 'title', 'description', 'comments', 'labels', 'blocked_by'];
          const task = { ...existing };
          for (const field of allowed) {
            if (body[field] !== undefined) task[field] = body[field];
          }
          task.updated_at = new Date().toISOString();
          await putTask(kv, task);
          return R(task);
        }

        if (method === 'DELETE') {
          const existing = await getTask(kv, id);
          if (!existing) return E('Task not found', 404);
          await delTask(kv, id);
          return R({ success: true });
        }
      }

      // ── GET /api/agents
      if (pathname === '/api/agents' && method === 'GET') {
        return R(AGENTS);
      }

      // ── GET /api/humans
      if (pathname === '/api/humans' && method === 'GET') {
        return R(HUMANS);
      }

      // ── Chat
      const chatMatch = pathname.match(/^\/api\/chat\/([^/]+)$/);
      if (chatMatch) {
        const channel = chatMatch[1];

        if (method === 'GET') {
          return R(await getChatMessages(kv, channel));
        }

        if (method === 'POST') {
          const body = await request.json();
          if (!body.author || !body.text) return E('author and text required');
          const msg = {
            id: body.id || `cm-${Date.now()}`,
            author: body.author,
            text: body.text,
            ts: body.ts || new Date().toISOString(),
          };
          await appendChat(kv, channel, msg);
          return R(msg, 201);
        }
      }

      // ── GET /api/metrics
      if (pathname === '/api/metrics' && method === 'GET') {
        const tasks = await listTasks(kv);
        const byStatus = {};
        ['INBOX', 'ASSIGNED', 'IN_PROGRESS', 'REVIEW', 'DONE', 'BLOCKED'].forEach(s => {
          byStatus[s] = tasks.filter(t => t.status === s).length;
        });
        return R({ totalTasks: tasks.length, tasksByStatus: byStatus, activeAgents: AGENTS.length });
      }

      // ── Stub endpoints (return empty arrays to prevent 404s)
      if (pathname === '/api/queue' && method === 'GET') {
        return R([]);
      }

      if (pathname === '/api/credentials' && method === 'GET') {
        return R([]);
      }

      if (pathname === '/api/resources' && method === 'GET') {
        return R([]);
      }

      if (pathname === '/api/bookings' && method === 'GET') {
        return R([]);
      }

      if (pathname === '/api/costs' && method === 'GET') {
        return R({ total: 0, byAgent: {}, byCategory: {} });
      }

      if (pathname === '/api/quotas' && method === 'GET') {
        return R([]);
      }

      return E('Not found', 404);

    } catch (e) {
      console.error(e);
      return E(e.message, 500);
    }
  },
};
