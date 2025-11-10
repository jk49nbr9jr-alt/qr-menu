export const config = { runtime: 'nodejs' } as const;

/**
 * Delete a non-admin user from data/<tenant>/users.json (allowed[], passwords{}).
 * Storage via GitHub Contents API (no local FS), with simple admin-secret auth.
 *
 * Body: { tenant?: string, username: string }
 */

type UsersJson = { allowed: string[]; passwords: Record<string, string> };

type GitHubFile = { content: string; sha: string; encoding: string };

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,x-admin-secret',
};

function ok(data: any, status = 200) {
  return new Response(JSON.stringify({ ok: true, ...data }), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}
function err(status: number, message: string, details?: any) {
  return new Response(JSON.stringify({ ok: false, error: message, details }), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}

function sanitizeTenant(input?: string) {
  const raw = (input || '').toString().trim().toLowerCase();
  const clean = raw.replace(/[^a-z0-9._-]/g, '');
  return clean || 'speisekarte';
}

function headerGet(req: any, name: string): string {
  const h = (req as any)?.headers;
  if (!h) return '';
  if (typeof (h as any).get === 'function') {
    return ((h as any).get(name) as string) || '';
  }
  const key = name.toLowerCase();
  for (const k of Object.keys(h)) {
    if (k.toLowerCase() === key) {
      const v: any = (h as any)[k];
      return Array.isArray(v) ? (v[0] ?? '') : (v ?? '');
    }
  }
  return '';
}

function requireSecret(req: any) {
  const hdr = headerGet(req, 'x-admin-secret');
  const expected = process.env.VITE_ADMIN_SECRET || process.env.ADMIN_SECRET || '';
  return !!expected && hdr === expected;
}

const GH_OWNER = process.env.GITHUB_OWNER || '';
const GH_REPO = process.env.GITHUB_REPO || '';
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
  if (req.method !== 'POST') return err(405, 'method-not-allowed');
  if (!requireSecret(req)) return err(401, 'unauthorized');

  if (!GH_OWNER || !GH_REPO || !GH_TOKEN) {
    return err(500, 'missing-github-config', {
      GITHUB_OWNER: !!GH_OWNER,
      GITHUB_REPO: !!GH_REPO,
      GITHUB_TOKEN: !!GH_TOKEN,
    });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return err(400, 'invalid-json');
  }

  const tenant = sanitizeTenant(body?.tenant);
  const username = (body?.username || '').toString().trim();
  if (!username) return err(400, 'username-required');
  if (username === 'admin') return err(400, 'no-admin-delete');

  const usersPath = `data/${tenant}/users.json`;
  const { data: users, sha } = await readUsers(usersPath);

  const beforeAllowed = users.allowed.length;
  users.allowed = users.allowed.filter((u) => u !== username);
  if (users.passwords[username]) delete users.passwords[username];

  // Wenn sich nichts geändert hat, trotzdem ok zurückgeben
  if (users.allowed.length === beforeAllowed && !(username in users.passwords)) {
    return ok({ tenant, username, changed: false });
  }

  await ghPutJson(usersPath, users, sha, `delete user ${username} (tenant: ${tenant})`);
  return ok({ tenant, username, changed: true });
}