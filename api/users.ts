export const config = { runtime: 'nodejs' } as const;

/**
 * Returns allowed users and pending users for a tenant from GitHub storage.
 * Uses GitHub Contents API instead of local filesystem.
 */

type UsersJson = { allowed: string[]; passwords: Record<string, string> };
type PendingJson = Record<string, string>;
type GitHubFile = { content: string; sha: string; encoding: string };

function sanitizeTenant(input?: string) {
  const raw = (input || '').toString().trim().toLowerCase();
  const clean = raw.replace(/[^a-z0-9._-]/g, '');
  return clean || 'speisekarte';
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

async function ghGetFile(path: string): Promise<GitHubFile> {
  return gh(`/repos/${GH_OWNER}/${GH_REPO}/contents/${encodeURIComponent(path)}`);
}

async function readJsonFile<T>(path: string, fallback: T): Promise<T> {
  try {
    const f = await ghGetFile(path);
    const buf = Buffer.from(f.content, (f.encoding as BufferEncoding) || 'base64');
    return JSON.parse(buf.toString('utf8')) as T;
  } catch {
    return fallback;
  }
}

export default async function handler(req: Request): Promise<Response> {
  const { searchParams } = new URL(req.url);
  const tenant = sanitizeTenant(searchParams.get('tenant') || undefined);

  if (!GH_OWNER || !GH_REPO || !GH_TOKEN) {
    return new Response(JSON.stringify({ ok: false, error: 'missing-github-config' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const usersPath = `data/${tenant}/users.json`;
  const pendingPath = `data/${tenant}/pending.json`;

  const users = await readJsonFile<UsersJson>(usersPath, { allowed: ['admin'], passwords: {} });
  const pending = await readJsonFile<PendingJson>(pendingPath, {});

  return new Response(
    JSON.stringify({ ok: true, allowed: users.allowed, pending }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
}