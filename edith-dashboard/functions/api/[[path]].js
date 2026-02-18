/**
 * E.D.I.T.H Pages Function — API proxy
 *
 * Catches all requests to /api/* and proxies them server-side to the
 * Cloudflare Worker (edith-api.tfsmrt.workers.dev).
 *
 * Runs on the Cloudflare edge — no CORS issues, all HTTP methods supported.
 */

const WORKER_URL = 'https://edith-api.tfsmrt.workers.dev';

export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);

  // Build the target Worker URL: keep pathname + search params
  const target = `${WORKER_URL}${url.pathname}${url.search}`;

  // Forward the request as-is (method, headers, body)
  const workerRequest = new Request(target, {
    method: request.method,
    headers: request.headers,
    body: request.method !== 'GET' && request.method !== 'HEAD' ? request.body : undefined,
  });

  try {
    const response = await fetch(workerRequest);
    // Return the Worker response directly (it already has the right Content-Type)
    return response;
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
