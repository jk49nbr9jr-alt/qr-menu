// Serverless function: set or change a user's password
// Works on Vercel (edge runtime).
// Updates `data/<tenant>/passwords.json` in the GitHub repo via the Contents API.

export const config = { runtime: 'edge' };

// --- Env ---
const GH_OWNER   = process.env.GITHUB_OWNER as string;
const GH_REPO    = process.env.GITHUB_REPO as string;
const GH_BRANCH  = process.env.GITHUB_BRANCH || 'main';
const GH_TOKEN   = process.env.GITHUB_TOKEN as string; // classic/token with repo contents scope
const ADMIN_SECRET = process.env.ADMIN_SECRET as string;

// --- Helpers ---
function jsonRes(status: number, data: unknown) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function requireEnv() {
  const missing: string[] = [];
  if (!GH_OWNER) missing.push('GITHUB_OWNER');
  if (!GH_REPO) missing.push('GITHUB_REPO');
  if (!GH_TOKEN) missing.push('GITHUB_TOKEN');
  if (!ADMIN_SECRET) missing.push('ADMIN_SECRET');
  if (missing.length) {
    throw new Error('Missing env: ' + missing.join(', '));
  }
}

function requireSecret(req: Request) {
  const hdr = req.headers.get('x-admin-secret') || '';
  if (hdr !== ADMIN_SECRET) throw new Error('Forbidden');
}

function pathFor(tenant: string) {
  return `data/${tenant}/passwords.json`;
}

async function ghFetch(path: string, init?: RequestInit) {
  const url = `https://api.github.com/repos/${GH_OWNER}/${GH_REPO}${path}`;
  const headers = {
    'Authorization': `Bearer ${GH_TOKEN}`,
    'Accept': 'application/vnd.github+json',
    ...init?.headers as Record<string, string> ?? {}
  };
  const res = await fetch(url, { ...init, headers });
  return res;
}

async function readJsonFromRepo(filePath: string, fallback: any) {
  // read file + sha via contents API
  const q = new URLSearchParams({ ref: GH_BRANCH }).toString();
  const r = await ghFetch(`/contents/${filePath}?${q}`);
  if (r.status === 404) return { data: fallback, sha: undefined };
  if (!r.ok) throw new Error(`[read] ${r.status} ${await r.text()}`);
  const js = await r.json();
  const content = typeof js.content === 'string' ? atob(js.content.replace(/\n/g, '')) : '';
  let parsed: any = fallback;
  try { parsed = JSON.parse(content); } catch {}
  return { data: parsed, sha: js.sha as string };
}

async function writeJsonToRepo(filePath: string, data: any, sha: string | undefined, message: string) {
  const body = {
    message,
    content: btoa(unescape(encodeURIComponent(JSON.stringify(data, null, 2)))).replace(/=+$/,'') ,
    branch: GH_BRANCH,
    sha
  } as any;
  // when no sha (new file) GitHub ignores undefined, but some runtimes send it – strip explicitly
  if (!sha) delete body.sha;
  const r = await ghFetch(`/contents/${filePath}`, {
    method: 'PUT',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' }
  });
  if (!r.ok) throw new Error(`[write] ${r.status} ${await r.text()}`);
  return r.json();
}

// --- Handler ---
export default async function handler(req: Request): Promise<Response> {
  try {
    requireEnv();

    const { searchParams } = new URL(req.url);
    const tenant = (searchParams.get('tenant') || '').trim();
    if (!tenant) return jsonRes(400, { ok: false, error: 'tenant missing' });

    // Allow a quick GET check
    if (req.method === 'GET' && searchParams.get('mode') === 'selftest') {
      return jsonRes(200, { ok: true, tenant, env: {
        GITHUB_OWNER_present: !!GH_OWNER,
        GITHUB_REPO_present: !!GH_REPO,
        GITHUB_TOKEN_present: !!GH_TOKEN,
      }});
    }

    if (req.method !== 'POST') return jsonRes(405, { ok: false, error: 'POST required' });

    // Auth
    try { requireSecret(req); } catch { return jsonRes(403, { ok: false, error: 'forbidden' }); }

    // Payload
    let body: any = {};
    try { body = await req.json(); } catch {}
    const username = (body?.username || '').trim();
    const password = (body?.password || '').trim();
    if (!username || !password) return jsonRes(400, { ok: false, error: 'username/password missing' });

    const filePath = pathFor(tenant);
    const { data: map, sha } = await readJsonFromRepo(filePath, {});
    (map as any)[username] = password;
    await writeJsonToRepo(filePath, map, sha, `[qr-menu] set password for ${username}`);

    return jsonRes(200, { ok: true, tenant, user: username });
  } catch (e: any) {
    return jsonRes(500, { ok: false, error: String(e?.message || e) });
  }
}