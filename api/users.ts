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

type ReadReport<T> = { data: T; error?: string; exists: boolean };
async function readJsonFileWithReport<T>(path: string, fallback: T): Promise<ReadReport<T>> {
  try {
    const f = await ghGetFile(path);
    const buf = Buffer.from(f.content, (f.encoding as BufferEncoding) || 'base64');
    const parsed = JSON.parse(buf.toString('utf8')) as T;
    return { data: parsed, exists: true };
  } catch (e: any) {
    const msg = typeof e?.message === 'string' ? e.message : String(e);
    return { data: fallback, error: msg, exists: false };
  }
}

export default async function handler(req: Request): Promise<Response> {
  const { searchParams } = new URL(req.url);
  const tenant = sanitizeTenant(searchParams.get('tenant') || undefined);
  const debug = searchParams.get('debug') === '1';

  if (!GH_OWNER || !GH_REPO || !GH_TOKEN) {
    const missing: string[] = [];
    if (!GH_OWNER) missing.push('GITHUB_OWNER');
    if (!GH_REPO) missing.push('GITHUB_REPO');
    if (!GH_TOKEN) missing.push('GITHUB_TOKEN');
    return new Response(JSON.stringify({ ok: false, error: 'missing-github-config', missing, tenant }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const usersPath = `data/${tenant}/users.json`;
  const pendingPath = `data/${tenant}/pending.json`;

  const errors: Array<{ file: string; error: string }> = [];

  const usersRep = await readJsonFileWithReport<UsersJson>(usersPath, { allowed: ['admin'], passwords: {} });
  if (usersRep.error) errors.push({ file: usersPath, error: usersRep.error });

  const pendingRep = await readJsonFileWithReport<PendingJson>(pendingPath, {});
  if (pendingRep.error) errors.push({ file: pendingPath, error: pendingRep.error });

  return new Response(
    JSON.stringify({
      ok: true,
      allowed: usersRep.data.allowed,
      pending: pendingRep.data,
      ...(debug
        ? {
            debug: {
              tenant,
              usersPath,
              pendingPath,
              usersExists: usersRep.exists,
              pendingExists: pendingRep.exists,
              errors,
            },
          }
        : {}),
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
}