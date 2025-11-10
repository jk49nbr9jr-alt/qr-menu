export const config = { runtime: "nodejs" } as const;

/**
 * Approve a pending user:
 * Body: { tenant?: string, username: string }
 * Moves password from data/<tenant>/pending.json into data/<tenant>/users.json (allowed[], passwords{}).
 * Storage is done via GitHub Contents API (no local FS).
 */

type GitHubFile = { content: string; sha: string; encoding: "base64" | string };
type UsersJson = { allowed: string[]; passwords: Record<string, string> };
type PendingJson = Record<string, string>;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type,x-admin-secret",
};

function ok(data: any, init: ResponseInit = {}) {
  return new Response(JSON.stringify({ ok: true, ...data }), {
    status: 200,
    headers: { "Content-Type": "application/json", ...CORS, ...(init.headers || {}) },
  });
}
function err(status: number, message: string, details?: any) {
  return new Response(JSON.stringify({ ok: false, error: message, details }), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

function sanitizeTenant(input?: string) {
  const raw = (input || "").toString().trim().toLowerCase();
  const clean = raw.replace(/[^a-z0-9._-]/g, "");
  return clean || "speisekarte";
}

function requireSecret(req: Request) {
  const hdr = req.headers.get("x-admin-secret") || "";
  const expected = process.env.VITE_ADMIN_SECRET || process.env.ADMIN_SECRET || "";
  return !!expected && hdr === expected;
}

const GH_OWNER = process.env.GITHUB_OWNER || "";
const GH_REPO = process.env.GITHUB_REPO || "";
const GH_TOKEN = process.env.GITHUB_TOKEN || "";

async function gh<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`https://api.github.com${url}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${GH_TOKEN}`,
      "User-Agent": "qr-menu-api",
      ...(init?.headers || {}),
    },
    cache: "no-store",
  });
  if (!r.ok) {
    const text = await r.text().catch(() => "");
    throw new Error(`GitHub ${r.status}: ${text || r.statusText}`);
  }
  return (await r.json()) as T;
}

async function ghGetFile(path: string): Promise<GitHubFile & { path: string }> {
  return gh<GitHubFile & { path: string }>(`/repos/${GH_OWNER}/${GH_REPO}/contents/${encodeURIComponent(path)}`);
}
async function ghPutFile(path: string, contentObj: unknown, sha: string | null, message: string) {
  const content = Buffer.from(JSON.stringify(contentObj, null, 2), "utf8").toString("base64");
  return gh(`/repos/${GH_OWNER}/${GH_REPO}/contents/${encodeURIComponent(path)}`, {
    method: "PUT",
    body: JSON.stringify({ message, content, sha: sha || undefined }),
  });
}

async function readJsonFromRepo<T>(path: string, fallback: T): Promise<{ data: T; sha: string | null }> {
  try {
    const f = await ghGetFile(path);
    const buf = Buffer.from(f.content, (f.encoding as BufferEncoding) || "base64");
    const parsed = JSON.parse(buf.toString("utf8")) as T;
    return { data: parsed, sha: f.sha };
  } catch {
    return { data: fallback, sha: null };
  }
}

// --- helpers for Node/Edge compatibility ---
async function readBody(req: any): Promise<any> {
  try {
    if (typeof req?.json === "function") {
      return await req.json();
    }
  } catch {}
  try {
    const chunks: Uint8Array[] = [];
    // @ts-ignore - Node readable stream
    for await (const chunk of req as any) {
      chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
    }
    const raw = Buffer.concat(chunks).toString("utf8");
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function getURL(req: any): URL {
  try {
    if (req?.url) return new URL(req.url, `http://${req.headers?.host || "localhost"}`);
  } catch {}
  return new URL("http://localhost/");
}

export default async function handler(req: any) {
  if (req.method === "OPTIONS") return new Response("ok", { status: 200, headers: CORS });
  if (req.method !== "POST") return err(405, "method-not-allowed");
  if (!requireSecret(req)) return err(401, "unauthorized");

  if (!GH_OWNER || !GH_REPO || !GH_TOKEN) {
    return err(500, "missing-github-config", { GITHUB_OWNER: !!GH_OWNER, GITHUB_REPO: !!GH_REPO, GITHUB_TOKEN: !!GH_TOKEN });
  }

  const url = getURL(req);
  const body = await readBody(req);

  const tenant = sanitizeTenant(body?.tenant ?? url.searchParams.get("tenant") ?? undefined);
  const username = ((body?.username ?? url.searchParams.get("username") ?? "") as string).toString().trim();
  if (!username) return err(400, "username-required");

  const usersPath = `data/${tenant}/users.json`;
  const pendingPath = `data/${tenant}/pending.json`;

  // Load files (or defaults)
  const { data: users, sha: usersSha } = await readJsonFromRepo<UsersJson>(usersPath, { allowed: ["admin"], passwords: {} });
  const { data: pending, sha: pendingSha } = await readJsonFromRepo<PendingJson>(pendingPath, {});

  const pwd = pending[username];
  if (!pwd) return err(400, "no-pending");

  if (!users.allowed.includes(username)) users.allowed.push(username);
  users.passwords[username] = pwd;
  delete pending[username];

  // Save both files back
  await ghPutFile(usersPath, users, usersSha, `approve user ${username} (tenant: ${tenant})`);
  await ghPutFile(pendingPath, pending, pendingSha, `remove user from pending ${username} (tenant: ${tenant})`);

  return ok({ tenant, username });
}