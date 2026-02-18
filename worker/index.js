/**
 * E.D.I.T.H API Worker
 *
 * Cloudflare Worker that provides a persistent task API
 * backed by GitHub (tfsmrt/mission-control repo).
 *
 * Routes:
 *   GET    /api/tasks           — list all tasks
 *   POST   /api/tasks           — create task
 *   GET    /api/tasks/:id       — get single task
 *   PUT    /api/tasks/:id       — replace task
 *   PATCH  /api/tasks/:id       — update fields
 *   DELETE /api/tasks/:id       — delete task
 *   GET    /api/agents          — list agents
 *   GET    /api/humans          — list humans
 *   POST   /api/chat/:channel   — append chat message
 *   GET    /api/chat/:channel   — get chat messages
 *   GET    /health              — health check
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}

function err(message, status = 400) {
  return json({ error: message }, status);
}

// ── GitHub API helpers ────────────────────────────────────────────────────────

async function ghGet(env, path) {
  const url = `https://api.github.com/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/contents/${path}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'edith-api-worker/1.0',
    },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GitHub GET ${path} → ${res.status}`);
  return res.json();
}

async function ghPut(env, path, content, sha, message) {
  const url = `https://api.github.com/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/contents/${path}`;
  const body = {
    message,
    content: btoa(unescape(encodeURIComponent(content))),
    ...(sha ? { sha } : {}),
  };
  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'User-Agent': 'edith-api-worker/1.0',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub PUT ${path} → ${res.status}: ${text}`);
  }
  return res.json();
}

async function ghDelete(env, path, sha, message) {
  const url = `https://api.github.com/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/contents/${path}`;
  const res = await fetch(url, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'User-Agent': 'edith-api-worker/1.0',
    },
    body: JSON.stringify({ message, sha }),
  });
  if (!res.ok) throw new Error(`GitHub DELETE ${path} → ${res.status}`);
  return res.json();
}

function decodeContent(b64) {
  // GitHub returns base64 with newlines
  return decodeURIComponent(escape(atob(b64.replace(/\n/g, ''))));
}

// ── Task helpers ──────────────────────────────────────────────────────────────

async function listTasks(env) {
  const dir = await ghGet(env, env.TASKS_PATH);
  if (!dir || !Array.isArray(dir)) return [];
  const items = [];
  await Promise.all(
    dir
      .filter(f => f.name.endsWith('.json'))
      .map(async (f) => {
        try {
          const file = await ghGet(env, f.path);
          if (file && file.content) {
            items.push(JSON.parse(decodeContent(file.content)));
          }
        } catch (e) { /* skip bad files */ }
      })
  );
  // Sort newest first
  return items.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

async function getTask(env, id) {
  const file = await ghGet(env, `${env.TASKS_PATH}/${id}.json`);
  if (!file) return null;
  return { data: JSON.parse(decodeContent(file.content)), sha: file.sha };
}

async function saveTask(env, id, taskData, sha, action) {
  const content = JSON.stringify(taskData, null, 2);
  await ghPut(env, `${env.TASKS_PATH}/${id}.json`, content, sha,
    `[edith-api] ${action}: ${taskData.title || id}`);
  return taskData;
}

// ── Chat helpers ──────────────────────────────────────────────────────────────

async function getChatMessages(env, channel) {
  const path = `.mission-control/messages/chat-${channel}.json`;
  const file = await ghGet(env, path);
  if (!file) return { messages: [], sha: null };
  return {
    messages: JSON.parse(decodeContent(file.content)),
    sha: file.sha,
  };
}

async function appendChatMessage(env, channel, msg) {
  const path = `.mission-control/messages/chat-${channel}.json`;
  const { messages, sha } = await getChatMessages(env, channel);
  messages.push(msg);
  const content = JSON.stringify(messages, null, 2);
  await ghPut(env, path, content, sha,
    `[chat] ${msg.author} in #${channel}`);
  return msg;
}

// ── Router ────────────────────────────────────────────────────────────────────

export default {
  async fetch(request, env) {
    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    const url = new URL(request.url);
    const { pathname } = url;
    const method = request.method;

    // ── Health
    if (pathname === '/health') {
      return json({ ok: true, ts: new Date().toISOString() });
    }

    // ── GET /api/tasks
    if (pathname === '/api/tasks' && method === 'GET') {
      try {
        const tasks = await listTasks(env);
        return json(tasks);
      } catch (e) {
        return err(e.message, 500);
      }
    }

    // ── POST /api/tasks
    if (pathname === '/api/tasks' && method === 'POST') {
      try {
        const body = await request.json();
        if (!body.title) return err('title required');
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
        await saveTask(env, id, task, null, 'CREATED');
        return json(task, 201);
      } catch (e) {
        return err(e.message, 500);
      }
    }

    // ── /api/tasks/:id routes
    const taskMatch = pathname.match(/^\/api\/tasks\/([^/]+)$/);
    if (taskMatch) {
      const id = taskMatch[1];

      if (method === 'GET') {
        try {
          const result = await getTask(env, id);
          if (!result) return err('Task not found', 404);
          return json(result.data);
        } catch (e) {
          return err(e.message, 500);
        }
      }

      if (method === 'PUT') {
        try {
          const body = await request.json();
          const existing = await getTask(env, id);
          const task = {
            ...(existing?.data || {}),
            ...body,
            id,
            updated_at: new Date().toISOString(),
          };
          await saveTask(env, id, task, existing?.sha, 'UPDATED');
          return json(task);
        } catch (e) {
          return err(e.message, 500);
        }
      }

      if (method === 'PATCH') {
        try {
          const body = await request.json();
          const existing = await getTask(env, id);
          if (!existing) return err('Task not found', 404);
          const allowed = ['status', 'assignee', 'priority', 'title', 'description', 'comments', 'labels'];
          const task = { ...existing.data };
          for (const field of allowed) {
            if (body[field] !== undefined) task[field] = body[field];
          }
          task.updated_at = new Date().toISOString();
          await saveTask(env, id, task, existing.sha, 'PATCHED');
          return json(task);
        } catch (e) {
          return err(e.message, 500);
        }
      }

      if (method === 'DELETE') {
        try {
          const existing = await getTask(env, id);
          if (!existing) return err('Task not found', 404);
          await ghDelete(env, `${env.TASKS_PATH}/${id}.json`, existing.sha,
            `[edith-api] DELETED: ${id}`);
          return json({ success: true });
        } catch (e) {
          return err(e.message, 500);
        }
      }
    }

    // ── GET /api/agents
    if (pathname === '/api/agents' && method === 'GET') {
      try {
        const dir = await ghGet(env, '.mission-control/agents');
        if (!dir || !Array.isArray(dir)) return json([]);
        const agents = [];
        await Promise.all(
          dir.filter(f => f.name.endsWith('.json')).map(async (f) => {
            try {
              const file = await ghGet(env, f.path);
              if (file?.content) agents.push(JSON.parse(decodeContent(file.content)));
            } catch (e) {}
          })
        );
        return json(agents);
      } catch (e) {
        return err(e.message, 500);
      }
    }

    // ── GET /api/humans
    if (pathname === '/api/humans' && method === 'GET') {
      try {
        const dir = await ghGet(env, '.mission-control/humans');
        if (!dir || !Array.isArray(dir)) return json([]);
        const humans = [];
        await Promise.all(
          dir.filter(f => f.name.endsWith('.json')).map(async (f) => {
            try {
              const file = await ghGet(env, f.path);
              if (file?.content) humans.push(JSON.parse(decodeContent(file.content)));
            } catch (e) {}
          })
        );
        return json(humans);
      } catch (e) {
        return err(e.message, 500);
      }
    }

    // ── Chat: GET /api/chat/:channel
    const chatGet = pathname.match(/^\/api\/chat\/([^/]+)$/);
    if (chatGet && method === 'GET') {
      try {
        const { messages } = await getChatMessages(env, chatGet[1]);
        return json(messages);
      } catch (e) {
        return err(e.message, 500);
      }
    }

    // ── Chat: POST /api/chat/:channel
    const chatPost = pathname.match(/^\/api\/chat\/([^/]+)$/);
    if (chatPost && method === 'POST') {
      try {
        const body = await request.json();
        if (!body.author || !body.text) return err('author and text required');
        const msg = {
          id: body.id || `cm-${Date.now()}`,
          author: body.author,
          text: body.text,
          ts: body.ts || new Date().toISOString(),
        };
        await appendChatMessage(env, chatPost[1], msg);
        return json(msg, 201);
      } catch (e) {
        return err(e.message, 500);
      }
    }

    // ── Metrics (basic)
    if (pathname === '/api/metrics' && method === 'GET') {
      try {
        const tasks = await listTasks(env);
        const byStatus = {};
        ['INBOX','ASSIGNED','IN_PROGRESS','REVIEW','DONE','BLOCKED'].forEach(s => {
          byStatus[s] = tasks.filter(t => t.status === s).length;
        });
        return json({ totalTasks: tasks.length, tasksByStatus: byStatus });
      } catch (e) {
        return err(e.message, 500);
      }
    }

    return err('Not found', 404);
  },
};
