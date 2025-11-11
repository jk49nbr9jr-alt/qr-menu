// Verify username + password against hashed passwords stored in GitHub (data/<tenant>/passwords.json)

export const config = { runtime: 'nodejs' } as const;

import type { IncomingMessage, ServerResponse } from 'http';
import { Buffer } from 'node:buffer';

// ---------- Utils ----------
function sanitizeTenant(input?: string) {
  const raw = (input || '').toString().trim().toLowerCase();
  const clean = raw.replace(/[^a-z0-9._-]/g, '');
  return clean || 'speisekarte';
}

function json(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

async function readJsonBody<T = any>(req: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  const raw = Buffer.concat(chunks).toString('utf8') || '{}';
  try { return JSON.parse(raw) as T; } catch { return {} as T; }
}

// ---------- GitHub helpers ----------
const GH_TOKEN  = process.env.GITHUB_TOKEN  || '';
const GH_OWNER  = process.env.GITHUB_OWNER  || '';
const GH_REPO   = process.env.GITHUB_REPO   || '';
const GH_BRANCH = process.env.GITHUB_BRANCH || 'main';

function ghUrl(p: string) {
  const path = p.replace(/^\/+/, '');
  return `https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/contents/${path}?ref=${encodeURIComponent(GH_BRANCH)}`;
}

type GitHubFile = { content: string; sha: string; encoding: string };

async function ghReadJson<T>(repoPath: string, fallback: T): Promise<{ data: T; sha: string | null }> {
  const url = ghUrl(repoPath);
  const r = await fetch(url, {
    headers: {
      Authorization: `Bearer ${GH_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'qr-menu-api',
    },
    cache: 'no-store',
  });
  if (r.status === 404) return { data: fallback, sha: null };
  if (!r.ok) throw new Error(`GitHub read failed ${r.status}`);
  const jsonResp: GitHubFile = await r.json() as any;
  const txt = Buffer.from(jsonResp.content || '', (jsonResp.encoding as BufferEncoding) || 'base64').toString('utf8');
  try { return { data: JSON.parse(txt) as T, sha: (jsonResp as any).sha || null }; }
  catch { return { data: fallback, sha: (jsonResp as any).sha || null }; }
}

// ---------- Types ----------
interface UsersJson {
  allowed?: string[];
}
type PasswordsJson = Record<string, string>;

// ---------- Handler ----------
export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    if (req.method !== 'POST') {
      res.statusCode = 405;
      res.setHeader('Allow', 'POST');
      return res.end('Method not allowed');
    }

    if (!GH_TOKEN || !GH_OWNER || !GH_REPO) {
      return json(res, 500, { ok: false, error: 'server-misconfigured' });
    }

    const body = await readJsonBody<{ tenant?: string; username?: string; password?: string }>(req);
    const tenant   = sanitizeTenant(body.tenant);
    const username = (body.username || '').toString().trim().toLowerCase();
    const password = (body.password || '').toString();

    if (!username || !password) {
      return json(res, 400, { ok: false, error: 'missing-credentials' });
    }

    // Load users.json and passwords.json (hashes are kept outside of users.json)
    const usersPath = `data/${tenant}/users.json`;
    const pwPath    = `data/${tenant}/passwords.json`;
    const { data: users } = await ghReadJson<UsersJson>(usersPath, { allowed: ['admin'] });
    const { data: pwMap }  = await ghReadJson<PasswordsJson>(pwPath, {});

    const allowed = Array.isArray(users.allowed) ? users.allowed : ['admin'];

    if (!allowed.includes(username)) {
      // not approved user
      return json(res, 401, { ok: false, error: 'unauthorized' });
    }

    const storedHash = pwMap[username];
    if (!storedHash) {
      // no password set for this user
      return json(res, 401, { ok: false, error: 'no-password' });
    }

    // Compare bcrypt
    const { compare } = await import('bcryptjs');
    const ok = await compare(password, storedHash);
    if (!ok) {
      return json(res, 401, { ok: false, error: 'invalid-password' });
    }

    // success — no sensitive data in response
    return json(res, 200, { ok: true, username, tenant });
  } catch (e: any) {
    console.error('[api/users-login] CRASH', e);
    return json(res, 500, { ok: false, error: 'handler-crash', message: String(e?.message || e) });
  }
}