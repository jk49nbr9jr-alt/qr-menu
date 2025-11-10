// api/users.ts
import type { IncomingMessage, ServerResponse } from 'http';
import { Buffer } from 'node:buffer';

export const config = { runtime: 'nodejs' } as const;

type UsersJson = { allowed: string[]; passwords: Record<string, string> };
type PendingJson = Record<string, string>;
type GitHubFile = { content: string; sha: string; encoding: string };

function sanitizeTenant(input?: string) {
  const raw = (input || '').toString().trim().toLowerCase();
  const clean = raw.replace(/[^a-z0-9._-]/g, '');
  return clean || 'speisekarte';
}

const GH_OWNER = process.env.GITHUB_OWNER || '';
const GH_REPO  = process.env.GITHUB_REPO  || '';
const GH_TOKEN = process.env.GITHUB_TOKEN || '';

function buildURL(req: IncomingMessage) {
  const proto = (req.headers['x-forwarded-proto'] as string) || 'https';
  const host  = (req.headers['x-forwarded-host'] as string) || (req.headers.host as string) || 'localhost';
  const path  = typeof req.url === 'string' ? req.url : '/';
  return new URL(`${proto}://${host}${path}`);
}

function json(res: ServerResponse, status: number, body: any) {
  const data = JSON.stringify(body);
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(data);
}

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

async function ghGetFile(path: string): Promise<GitHubFile> {
  return gh(`/repos/${GH_OWNER}/${GH_REPO}/contents/${encodeURIComponent(path)}`);
}

async function readJsonFile<T>(path: string, fallback: T): Promise<T> {
  try {
    const f = await ghGetFile(path);
    const enc = (f.encoding as BufferEncoding) || 'base64';
    const buf = Buffer.from(f.content || '', enc);
    return JSON.parse(buf.toString('utf8')) as T;
  } catch {
    return fallback;
  }
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    const url = buildURL(req);
    const debug  = url.searchParams.get('debug') === '1';
    const tenant = sanitizeTenant(url.searchParams.get('tenant') || undefined);

    if (!GH_OWNER || !GH_REPO || !GH_TOKEN) {
      return json(res, 500, {
        ok: false,
        error: 'missing-github-config',
        ...(debug && {
          env: {
            GITHUB_OWNER_present: !!GH_OWNER,
            GITHUB_REPO_present: !!GH_REPO,
            GITHUB_TOKEN_present: !!GH_TOKEN,
          },
        }),
      });
    }

    const usersPath   = `data/${tenant}/users.json`;
    const pendingPath = `data/${tenant}/pending.json`;

    let usersErr: string | null = null;
    let pendingErr: string | null = null;

    let users: UsersJson = { allowed: ['admin'], passwords: {} };
    let pending: PendingJson = {};

    try { users   = await readJsonFile<UsersJson>(usersPath, users); }   catch (e: any) { usersErr   = String(e?.message || e); }
    try { pending = await readJsonFile<PendingJson>(pendingPath, {}); } catch (e: any) { pendingErr = String(e?.message || e); }

    if (debug) {
      return json(res, 200, {
        ok: true,
        tenant,
        paths: { usersPath, pendingPath },
        env: {
          GITHUB_OWNER_present: !!GH_OWNER,
          GITHUB_REPO_present: !!GH_REPO,
          GITHUB_TOKEN_present: !!GH_TOKEN,
        },
        usersErr,
        pendingErr,
        allowed: users.allowed,
        pending,
      });
    }

    return json(res, 200, { ok: true, allowed: users.allowed, pending });

  } catch (e: any) {
    console.error('[api/users] CRASH', e);
    return json(res, 500, { ok: false, error: 'handler-crash', message: String(e?.message || e) });
  }
}