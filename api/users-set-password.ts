export const config = { runtime: 'nodejs' } as const;

/**
 * Set (or reset) a user's password inside data/<tenant>/users.json
 * Uses GitHub Contents API (no local FS) and requires x-admin-secret.
 *
 * POST Body: { tenant?: string, username: string, password: string }
 * GET  : only for diagnostics => /api/users-set-password?tenant=...&mode=selftest
 */

type UsersJson = { allowed: string[]; passwords: Record<string, string> };
type GitHubFile = { content: string; sha: string; encoding: string };

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,x-admin-secret',
};

function ok(data: any, status = 200) {
  return new Response(JSON.stringify({ ok: true, ...data }, null, 2), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}
function err(status: number, message: string, details?: any) {
  return new Response(JSON.stringify({ ok: false, error: message, details }, null, 2), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}

function getUrl(req: any): URL {
  const raw = (req as any)?.url || '';
  const host = headerGet(req as any, 'host') || 'localhost';
  try {
    return new URL(raw, `http://${host}`);
  } catch {
    // fallback (should never happen)
    return new URL(`http://${host}/`);
  }
}

async function readJsonBody(req: any): Promise<any> {
  try {
    if (typeof (req as any).json === 'function') {
      return await (req as any).json();
    }
  } catch { /* fall through to stream read */ }

  // Stream read (Node.js IncomingMessage)
  const chunks: Uint8Array[] = [];
  for await (const chunk of req as any) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : Buffer.from(chunk));
  }
  const text = Buffer.concat(chunks).toString('utf8');
  try { return JSON.parse(text); } catch { return {}; }
}

/** normalize tenant from body or query */
function sanitizeTenant(input?: string) {
  const raw = (input || '').toString().trim().toLowerCase();
  const clean = raw.replace(/[^a-z0-9._-]/g, '');
  return clean || 'speisekarte';
}

/** headers.get fallback for Node.js runtime (where req.headers is a plain object) */
function headerGet(req: Request, name: string): string | null {
  const h: any = (req as any).headers;
  if (h && typeof h.get === 'function') return h.get(name);
  if (h && typeof h === 'object') {
    const key = Object.keys(h).find(k => k.toLowerCase() === name.toLowerCase());
    return key ? String(h[key]) : null;
  }
  return null;
}

function requireSecret(req: Request) {
  const hdr = headerGet(req, 'x-admin-secret') || '';
  const expected = process.env.VITE_ADMIN_SECRET || process.env.ADMIN_SECRET || '';
  return !!expected && hdr === expected;
}

const GH_OWNER = process.env.GITHUB_OWNER || '';
const GH_REPO  = process.env.GITHUB_REPO  || '';
const GH_TOKEN = process.env.GITHUB_TOKEN || '';

async function gh<T = any>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`https://api.github.com${url}`, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${GH_TOKEN}`,
      'User-Agent': 'qr-menu-api',
      ...(init?.headers || {}),
    },
    cache: 'no-store',
  });
  if (!r.ok) {
    const text = await r.text().catch(() => '');
    throw new Error(`GitHub ${r.status}: ${text || r.statusText}`);
  }
  return (await r.json()) as T;
}

async function ghGetFile(path: string): Promise<GitHubFile & { sha: string }> {
  return gh(`/repos/${GH_OWNER}/${GH_REPO}/contents/${encodeURIComponent(path)}`);
}
async function ghPutJson(path: string, obj: unknown, sha: string | null, message: string) {
  // Buffer is available in node runtime
  const content = Buffer.from(JSON.stringify(obj, null, 2), 'utf8').toString('base64');
  return gh(`/repos/${GH_OWNER}/${GH_REPO}/contents/${encodeURIComponent(path)}`, {
    method: 'PUT',
    body: JSON.stringify({ message, content, sha: sha || undefined }),
  });
}

async function readUsers(path: string): Promise<{ data: UsersJson; sha: string | null }> {
  try {
    const f = await ghGetFile(path);
    const buf = Buffer.from(f.content, (f.encoding as BufferEncoding) || 'base64');
    const parsed = JSON.parse(buf.toString('utf8')) as UsersJson;
    return { data: parsed, sha: f.sha };
  } catch {
    return { data: { allowed: ['admin'], passwords: {} }, sha: null };
  }
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { status: 200, headers: CORS });

  const url = getUrl(req);
  const tenantFromQuery = url.searchParams.get('tenant') || undefined;
  const mode = url.searchParams.get('mode') || '';

  if (req.method === 'GET') {
    if (mode === 'selftest') {
      const tenant = sanitizeTenant(tenantFromQuery);
      if (!GH_OWNER || !GH_REPO || !GH_TOKEN) {
        return err(500, 'missing-github-config', {
          GITHUB_OWNER: !!GH_OWNER,
          GITHUB_REPO:  !!GH_REPO,
          GITHUB_TOKEN: !!GH_TOKEN,
        });
      }
      const usersPath = `data/${tenant}/users.json`;
      const { data, sha } = await readUsers(usersPath);
      return ok({ tenant, usersPath, sha: sha || null, snapshot: data });
    }
    return err(405, 'method-not-allowed');
  }

  // POST
  if (req.method !== 'POST') return err(405, 'method-not-allowed');
  if (!requireSecret(req)) return err(401, 'unauthorized');

  if (!GH_OWNER || !GH_REPO || !GH_TOKEN) {
    return err(500, 'missing-github-config', {
      GITHUB_OWNER: !!GH_OWNER,
      GITHUB_REPO:  !!GH_REPO,
      GITHUB_TOKEN: !!GH_TOKEN,
    });
  }

  let body: any;
  try {
    body = await readJsonBody(req);
  } catch {
    return err(400, 'invalid-json');
  }

  const tenant   = sanitizeTenant(body?.tenant || tenantFromQuery);
  const username = (body?.username || '').toString().trim();
  const password = (body?.password || '').toString();

  if (!username || !password) return err(400, 'missing-username-or-password');

  const usersPath = `data/${tenant}/users.json`;
  const { data: users, sha } = await readUsers(usersPath);

  if (!users.allowed.includes(username)) {
    return err(403, 'not-allowed');
  }

  // NOTE: no hashing here — caller can provide already-hashed if desired
  users.passwords[username] = password;

  await ghPutJson(usersPath, users, sha, `set password for ${username} (tenant: ${tenant})`);
  return ok({ tenant, username, changed: true });
}