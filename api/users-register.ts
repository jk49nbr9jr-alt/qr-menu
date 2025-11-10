// Vercel Edge-compatible registration endpoint (no fs/path)
// Persists to GitHub repo: data/<tenant>/{users.json,pending.json}

export const config = { runtime: 'edge' } as const;

function getTenant(bodyOrQuery: any) {
  const t = (bodyOrQuery?.tenant || '').toString().trim();
  return t || 'speisekarte';
}

// --- GitHub helpers ---
const GH_TOKEN = process.env.GITHUB_TOKEN || '';
const GH_OWNER = process.env.GITHUB_OWNER || '';
const GH_REPO  = process.env.GITHUB_REPO  || '';
const GH_BRANCH = process.env.GITHUB_BRANCH || 'main';

function ghUrl(p: string) {
  const path = p.replace(/^\/+/, '');
  return `https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/contents/${path}?ref=${encodeURIComponent(GH_BRANCH)}`;
}

function b64encode(str: string) {
  // Edge runtime does not have Buffer – use Web APIs
  return btoa(unescape(encodeURIComponent(str)));
}
function b64decode(b64: string) {
  try { return decodeURIComponent(escape(atob(b64))); } catch { return ''; }
}

async function ghReadJson<T>(repoPath: string, fallback: T): Promise<{ data: T; sha: string | null }>{
  const url = ghUrl(repoPath);
  const res = await fetch(url, { headers: { Authorization: `Bearer ${GH_TOKEN}`, Accept: 'application/vnd.github+json' } });
  if (res.status === 404) return { data: fallback, sha: null };
  if (!res.ok) throw new Error(`GitHub read failed ${res.status}`);
  const json: any = await res.json();
  const txt = b64decode(json.content || '');
  try { return { data: JSON.parse(txt) as T, sha: json.sha || null }; } catch { return { data: fallback, sha: json.sha || null }; }
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
    const text = await res.text();
    throw new Error(`GitHub write failed ${res.status}: ${text}`);
  }
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  // Basic guard: require GitHub credentials
  if (!GH_TOKEN || !GH_OWNER || !GH_REPO) {
    return new Response(JSON.stringify({ ok:false, error: 'server-misconfigured' }), { status: 500 });
  }

  const body = await req.json().catch(() => ({}));
  const tenant = getTenant(body);
  const u = (body.username || '').toString().trim();
  const p = (body.password || '').toString();
  if (!u || !p || u.toLowerCase() === 'admin') {
    return new Response(JSON.stringify({ ok:false, error:'invalid' }), { status: 400 });
  }

  const usersPath = `data/${tenant}/users.json`;
  const pendingPath = `data/${tenant}/pending.json`;

  // Load current users and pending maps
  const { data: usersData, sha: usersSha } = await ghReadJson<{ allowed: string[]; passwords: Record<string,string> }>(usersPath, { allowed: ['admin'], passwords: {} });
  const { data: pendingData, sha: pendingSha } = await ghReadJson<Record<string,string>>(pendingPath, {});

  if (usersData.allowed.includes(u)) {
    return new Response(JSON.stringify({ ok:false, error:'exists' }), { status: 400 });
  }
  if (pendingData[u]) {
    return new Response(JSON.stringify({ ok:false, error:'pending' }), { status: 400 });
  }

  // add request (password stored as-is; consider hashing later)
  const nextPending = { ...pendingData, [u]: p };
  await ghWriteJson(pendingPath, nextPending, `feat(api): register pending user ${u} for ${tenant}`, pendingSha);

  // Ensure users.json exists (write back unchanged if it was missing)
  if (usersSha === null) {
    await ghWriteJson(usersPath, usersData, `chore(api): init users.json for ${tenant}`, null);
  }

  return new Response(JSON.stringify({ ok:true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}