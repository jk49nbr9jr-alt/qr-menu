// Node runtime registration endpoint (no fs/path on edge)
// Persists to GitHub repo: data/<tenant>/{users.json,pending.json}

import type { IncomingMessage, ServerResponse } from 'http';
import { Buffer } from 'node:buffer';

export const config = { runtime: 'nodejs' } as const;

function sanitizeTenant(t?: string) {
  const raw = (t || '').toString().trim().toLowerCase();
  const clean = raw.replace(/[^a-z0-9._-]/g, '');
  return clean || 'speisekarte';
}

function buildURL(req: IncomingMessage) {
  const proto = (req.headers['x-forwarded-proto'] as string) || 'https';
  const host  = (req.headers['x-forwarded-host'] as string) || (req.headers.host as string) || 'localhost';
  const path  = typeof req.url === 'string' ? req.url : '/';
  return new URL(`${proto}://${host}${path}`);
}

async function readJsonBody<T = any>(req: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  const raw = Buffer.concat(chunks).toString('utf8') || '{}';
  try { return JSON.parse(raw) as T; } catch { return {} as T; }
}

function json(res: ServerResponse, status: number, body: any) {
  const data = JSON.stringify(body);
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(data);
}

// --- GitHub helpers ---
const GH_TOKEN  = process.env.GITHUB_TOKEN  || '';
const GH_OWNER  = process.env.GITHUB_OWNER  || '';
const GH_REPO   = process.env.GITHUB_REPO   || '';
const GH_BRANCH = process.env.GITHUB_BRANCH || 'main';

function ghUrl(p: string) {
  const path = p.replace(/^\/+/, '');
  return `https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/contents/${path}?ref=${encodeURIComponent(GH_BRANCH)}`;
}

function b64encode(str: string) {
  return Buffer.from(str, 'utf8').toString('base64');
}
function b64decode(b64: string) {
  try { return Buffer.from(b64, 'base64').toString('utf8'); } catch { return ''; }
}

type UsersJson = { allowed: string[]; passwords: Record<string,string> };
type PendingJson = Record<string,string>;
type GitHubFile = { content: string; sha: string; encoding: string };

async function ghReadJson<T>(repoPath: string, fallback: T): Promise<{ data: T; sha: string | null }> {
  const url = ghUrl(repoPath);
  const res = await fetch(url, { headers: { Authorization: `Bearer ${GH_TOKEN}`, Accept: 'application/vnd.github+json' }, cache: 'no-store' });
  if (res.status === 404) return { data: fallback, sha: null };
  if (!res.ok) throw new Error(`GitHub read failed ${res.status}`);
  const json: GitHubFile = await res.json() as any;
  const txt = b64decode(json.content || '');
  try { return { data: JSON.parse(txt) as T, sha: (json as any).sha || null }; } catch { return { data: fallback, sha: (json as any).sha || null }; }
}

async function ghWriteJson(repoPath: string, obj: any, message: string, sha: string | null) {
  const url = ghUrl(repoPath);
  const body = {
    message,
    content: b64encode(JSON.stringify(obj, null, 2)),
    branch: GH_BRANCH,
    ...(sha ? { sha } : {})
  } as any;
  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${GH_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`GitHub write failed ${res.status}: ${text || res.statusText}`);
  }
}

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

    const url  = buildURL(req);
    const body = await readJsonBody<{ username?: string; password?: string; tenant?: string }>(req);

    const tenant = sanitizeTenant(body.tenant || url.searchParams.get('tenant') || undefined);
    const u = (body.username || '').toString().trim();
    const p = (body.password || '').toString();

    if (!u || !p || u.toLowerCase() === 'admin') {
      return json(res, 400, { ok: false, error: 'invalid' });
    }

    const usersPath   = `data/${tenant}/users.json`;
    const pendingPath = `data/${tenant}/pending.json`;

    const { data: usersData,   sha: usersSha }   = await ghReadJson<UsersJson>(usersPath, { allowed: ['admin'], passwords: {} });
    const { data: pendingData, sha: pendingSha } = await ghReadJson<PendingJson>(pendingPath, {});

    if (usersData.allowed.includes(u)) {
      return json(res, 400, { ok: false, error: 'exists' });
    }
    if (pendingData[u]) {
      return json(res, 400, { ok: false, error: 'pending' });
    }

    const nextPending = { ...pendingData, [u]: p };
    await ghWriteJson(pendingPath, nextPending, `feat(api): register pending user ${u} for ${tenant}`, pendingSha);

    if (usersSha === null) {
      await ghWriteJson(usersPath, usersData, `chore(api): init users.json for ${tenant}`, null);
    }

    return json(res, 200, { ok: true });
  } catch (e: any) {
    console.error('[api/users-register] CRASH', e);
    return json(res, 500, { ok: false, error: 'handler-crash', message: String(e?.message || e) });
  }
}