export const config = { runtime: "nodejs" } as const;

/**
 * Approve a pending user:
 * Body: { tenant?: string, username: string }
 * Moves password from data/<tenant>/pending.json into data/<tenant>/users.json (allowed[], passwords{}).
 * Storage is done via GitHub Contents API (no local FS).
 */

function safeJSON(data: any) {
  try { return JSON.stringify(data); } catch { return '"<unserializable>"'; }
}

type GitHubFile = { content: string; sha: string; encoding: "base64" | string };
type UsersJson = { allowed: string[]; passwords: Record<string, string> };
type PendingJson = Record<string, string>;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type,x-admin-secret",
  "Cache-Control": "no-store",
};

function ok(data: any, init: ResponseInit = {}) {
  const headers = { "Content-Type": "application/json", ...CORS, ...(init.headers || {}) } as Record<string,string>;
  return new Response(JSON.stringify({ ok: true, ...data }), { status: init.status ?? 200, headers });
}
function err(status: number, message: string, details?: any) {
  const payload = { ok: false, error: message, details };
  return new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json", ...CORS } });
}

function sanitizeTenant(input?: string) {
  const raw = (input || "").toString().trim().toLowerCase();
  const clean = raw.replace(/[^a-z0-9._-]/g, "");
  return clean || "speisekarte";
}

function requireSecret(req: any) {
  // do not log secret – only presence
  const expected = process.env.VITE_ADMIN_SECRET || process.env.ADMIN_SECRET || "";
  if (!expected) return false;

  const h = req?.headers;
  if (!h) return false;

  // WHATWG Request?
  if (typeof h.get === "function") {
    const v =
      h.get("x-admin-secret") ||
      h.get("X-Admin-Secret") ||
      "";
    return v === expected;
  }

  // Node IncomingHttpHeaders (plain object)
  if (typeof h === "object") {
    // Header-Namen case-insensitive behandeln
    const key = Object.keys(h).find(k => k.toLowerCase() === "x-admin-secret");
    if (!key) return false;
    const vRaw: any = (h as any)[key];
    const v = Array.isArray(vRaw) ? vRaw[0] : String(vRaw ?? "");
    return v === expected;
  }

  return false;
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
    console.error("[users-approve] GitHub API error", r.status, text || r.statusText);
    throw new Error(`GitHub ${r.status}: ${text || r.statusText}`);
  }
  return (await r.json()) as T;
}

function encPath(p: string) {
  return p.split('/').map(encodeURIComponent).join('/');
}

async function ghGetFile(path: string): Promise<GitHubFile & { path: string }> {
  return gh<GitHubFile & { path: string }>(`/repos/${GH_OWNER}/${GH_REPO}/contents/${encPath(path)}`);
}
async function ghPutFile(path: string, contentObj: unknown, sha: string | null, message: string) {
  try {
    // If no SHA provided, try to fetch it (update vs create safety)
    let effectiveSha = sha;
    if (!effectiveSha) {
      try {
        const current = await ghGetFile(path);
        effectiveSha = current.sha || null;
      } catch {
        // file does not exist -> create new (no sha)
        effectiveSha = null;
      }
    }
    const content = Buffer.from(JSON.stringify(contentObj, null, 2), "utf8").toString("base64");
    return gh(`/repos/${GH_OWNER}/${GH_REPO}/contents/${encPath(path)}`, {
      method: "PUT",
      body: JSON.stringify({ message, content, sha: effectiveSha || undefined }),
    });
  } catch (e) {
    console.error(`[users-approve] ghPutFile failed for ${path}`, e);
    throw e;
  }
}

async function readJsonFromRepo<T>(path: string, fallback: T): Promise<{ data: T; sha: string | null }> {
  try {
    const f = await ghGetFile(path);
    const buf = Buffer.from(f.content, (f.encoding as BufferEncoding) || "base64");
    const parsed = JSON.parse(buf.toString("utf8")) as T;
    return { data: parsed, sha: f.sha };
  } catch (e) {
    console.warn('[users-approve] readJsonFromRepo fallback for', path, 'err=', e && (e as any).message);
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
    if (req?.url) return new URL(req.url, `https://${req.headers?.host || "localhost"}`);
  } catch {}
  return new URL("https://localhost/");
}

async function approveUserFlow(tenant: string, username: string, usersPath: string, pendingPath: string, usersShaHint: string | null = null, pendingShaHint: string | null = null) {
  const { data: users, sha: usersSha } = await readJsonFromRepo<UsersJson>(usersPath, {
    allowed: ["admin"],
    passwords: {},
  });
  const { data: pending, sha: pendingSha } = await readJsonFromRepo<PendingJson>(pendingPath, {});

  const pwd = pending[username];
  if (!pwd) {
    const e: any = new Error("no-pending");
    e.code = "no-pending";
    throw e;
  }

  if (!users.allowed.includes(username)) users.allowed.push(username);
  users.passwords[username] = pwd;
  delete pending[username];

  await ghPutFile(usersPath, users, usersShaHint ?? usersSha, `approve user ${username} (tenant: ${tenant})`);
  await ghPutFile(pendingPath, pending, pendingShaHint ?? pendingSha, `remove user from pending ${username} (tenant: ${tenant})`);

  return { tenant, username };
}

export default async function handler(req: any) {
  // CORS preflight
  if (req.method === "OPTIONS") return new Response("ok", { status: 200, headers: CORS });

  const url = getURL(req);
  console.log("[users-approve]", req.method, url.toString());

  if (req.method === "GET") {
    const tenant = sanitizeTenant(url.searchParams.get("tenant") ?? undefined);
    const usersPath = `data/${tenant}/users.json`;
    const pendingPath = `data/${tenant}/pending.json`;
    const mode = url.searchParams.get("mode") || "info";

    if (mode === "selftest") {
      // do NOT expose secrets – only presence and whether a header was provided
      const expectedPresent = !!(process.env.VITE_ADMIN_SECRET || process.env.ADMIN_SECRET);
      const hdr = req?.headers || {};
      const provided = typeof hdr.get === "function"
        ? !!(hdr.get("x-admin-secret") || hdr.get("X-Admin-Secret"))
        : !!Object.keys(hdr || {}).find(k => k.toLowerCase() === "x-admin-secret");

      return ok({
        mode,
        tenant,
        paths: { usersPath, pendingPath },
        env: {
          GITHUB_OWNER_present: !!GH_OWNER,
          GITHUB_REPO_present: !!GH_REPO,
          GITHUB_TOKEN_present: !!GH_TOKEN,
          ADMIN_SECRET_present: expectedPresent,
        },
        authHeaderProvided: provided,
        now: Date.now(),
      });
    }

    if (mode === "approve") {
      if (!requireSecret(req)) {
        return err(401, "unauthorized", { reason: "missing-or-invalid-x-admin-secret" });
      }
      const username = (url.searchParams.get("username") || "").trim();
      if (!username) return err(400, "username-required");
      try {
        const usersPath2 = `data/${tenant}/users.json`;
        const pendingPath2 = `data/${tenant}/pending.json`;
        const result = await approveUserFlow(tenant, username, usersPath2, pendingPath2);
        return ok(result);
      } catch (e: any) {
        return err(400, "approve-failed", { message: String(e?.message || e), stack: e?.stack || null });
      }
    }

    return ok({ mode, tenant, paths: { usersPath, pendingPath }, now: Date.now() });
  }

  if (req.method !== "POST") return err(405, "method-not-allowed");
  if (!requireSecret(req)) {
    console.warn("[users-approve] unauthorized – missing/invalid x-admin-secret header");
    return err(401, "unauthorized", { reason: "missing-or-invalid-x-admin-secret" });
  }

  if (!GH_OWNER || !GH_REPO || !GH_TOKEN) {
    return err(500, "missing-github-config", {
      GITHUB_OWNER: !!GH_OWNER,
      GITHUB_REPO: !!GH_REPO,
      GITHUB_TOKEN: !!GH_TOKEN,
    });
  }

  const body = await readBody(req);

  const tenant = sanitizeTenant(body?.tenant ?? url.searchParams.get("tenant") ?? undefined);
  const username = ((body?.username ?? url.searchParams.get("username") ?? "") as string).toString().trim();
  if (!username) return err(400, "username-required");

  const usersPath = `data/${tenant}/users.json`;
  const pendingPath = `data/${tenant}/pending.json`;

  if (url.searchParams.get("dryrun") === "1") {
    // Load files (or defaults)
    const { data: users, sha: usersSha } = await readJsonFromRepo<UsersJson>(usersPath, {
      allowed: ["admin"],
      passwords: {},
    });
    const { data: pending, sha: pendingSha } = await readJsonFromRepo<PendingJson>(pendingPath, {});

    const pwd = pending[username];
    return ok({
      dryrun: true,
      tenant,
      username,
      plan: {
        willAddToAllowed: !users.allowed.includes(username),
        willSetPassword: true,
        willRemoveFromPending: !!pwd,
      },
      snapshot: { users, pending },
    });
  }

  try {
    const result = await approveUserFlow(tenant, username, usersPath, pendingPath);
    return ok(result);
  } catch (e: any) {
    return err(500, "approve-failed", { message: String(e?.message || e), stack: e?.stack || null });
  }
}