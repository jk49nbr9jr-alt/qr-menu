export const config = { runtime: "nodejs" } as const;

/**
 * Approve a pending user:
 * - moves from data/<tenant>/pending.json to data/<tenant>/users.json
 * - adds username to allowed[]
 * - writes the (hashed) password to data/<tenant>/passwords.json (not into users.json)
 * - if the pending value is plaintext it will be hashed with bcryptjs before being stored
 * Body: { tenant?: string, username: string }
 * Requires x-admin-secret.
 */

type GitHubFile = { content: string; sha: string; encoding: "base64" | string };
type UsersJson   = { allowed?: string[]; passwords?: Record<string, string> };
type PasswordsJson = Record<string, string>;
type PendingJson = Record<string, string>;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST,OPTIONS,GET",
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
  const expected = process.env.VITE_ADMIN_SECRET || process.env.ADMIN_SECRET || "";
  if (!expected) return false;
  const h = req?.headers;
  if (!h) return false;
  if (typeof h.get === "function") {
    const v = h.get("x-admin-secret") || h.get("X-Admin-Secret") || "";
    return v === expected;
  }
  if (typeof h === "object") {
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
const GH_BRANCH = process.env.GITHUB_BRANCH || "main";

function encPath(p: string) {
  return p.split("/").map(encodeURIComponent).join("/");
}

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

async function ghGetFile(path: string): Promise<GitHubFile & { path: string; sha: string }> {
  return gh<GitHubFile & { path: string; sha: string }>(
    `/repos/${GH_OWNER}/${GH_REPO}/contents/${encPath(path)}?ref=${encodeURIComponent(GH_BRANCH)}`
  );
}
async function ghPutJson(path: string, obj: unknown, sha: string | null, message: string) {
  let effectiveSha = sha;
  if (!effectiveSha) {
    try {
      const cur = await ghGetFile(path);
      effectiveSha = cur.sha || null;
    } catch {
      effectiveSha = null;
    }
  }
  const content = Buffer.from(JSON.stringify(obj, null, 2), "utf8").toString("base64");
  return gh(`/repos/${GH_OWNER}/${GH_REPO}/contents/${encPath(path)}`, {
    method: "PUT",
    body: JSON.stringify({
      message,
      content,
      sha: effectiveSha || undefined,
      branch: GH_BRANCH,
    }),
  });
}

async function readJsonFromRepo<T>(path: string, fallback: T): Promise<{ data: T; sha: string | null }> {
  try {
    const f = await ghGetFile(path);
    try {
      const buf = Buffer.from(f.content, (f.encoding as BufferEncoding) || "base64");
      const raw = buf.toString("utf8").trim().replace(/^\uFEFF/, "");
      if (!raw) return { data: fallback, sha: f.sha };
      const parsed = JSON.parse(raw) as T;
      return { data: parsed, sha: f.sha };
    } catch (e) {
      console.warn("[users-approve] parse error in", path, "-> using fallback, keeping sha");
      return { data: fallback, sha: f.sha };
    }
  } catch {
    return { data: fallback, sha: null };
  }
}

function getURL(req: any): URL {
  try {
    const h = req?.headers || {};
    const proto = (h["x-forwarded-proto"] as string) || (typeof h.get === "function" ? h.get("x-forwarded-proto") : "") || "https";
    const host  = (h["x-forwarded-host"] as string)  || (typeof h.get === "function" ? h.get("x-forwarded-host")  : "") || h.host || "localhost";
    const path  = typeof req?.url === "string" ? req.url : "/";
    return new URL(`${proto}://${host}${path}`);
  } catch {}
  return new URL("https://localhost/");
}

async function readBody(req: any): Promise<any> {
  try {
    if (typeof req?.json === "function") return await req.json();
  } catch {}
  try {
    const chunks: Uint8Array[] = [];
    // @ts-ignore
    for await (const chunk of req as any) {
      chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
    }
    const raw = Buffer.concat(chunks).toString("utf8");
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export default async function handler(req: any) {
  if (req.method === "OPTIONS") return new Response("ok", { status: 200, headers: CORS });

  const url = getURL(req);

  if (req.method === "GET") {
    const tenant = sanitizeTenant(url.searchParams.get("tenant") ?? undefined);
    const mode = url.searchParams.get("mode") || "info";
    if (mode === "selftest") {
      const expectedPresent = !!(process.env.VITE_ADMIN_SECRET || process.env.ADMIN_SECRET);
      const hdr = req?.headers || {};
      const provided = typeof hdr.get === "function"
        ? !!(hdr.get("x-admin-secret") || hdr.get("X-Admin-Secret"))
        : !!Object.keys(hdr || {}).find(k => k.toLowerCase() === "x-admin-secret");
      return ok({
        mode,
        tenant,
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
    return ok({ mode, tenant });
  }

  if (req.method !== "POST") return err(405, "method-not-allowed");
  if (!requireSecret(req)) return err(401, "unauthorized", { reason: "missing-or-invalid-x-admin-secret" });
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

  const usersPath   = `data/${tenant}/users.json`;
  const pendingPath = `data/${tenant}/pending.json`;
  const passwordsPath = `data/${tenant}/passwords.json`;

  // read both files
  const { data: users,   sha: usersSha }   = await readJsonFromRepo<UsersJson>(usersPath, { allowed: ["admin"] });
  const { data: pending, sha: pendingSha } = await readJsonFromRepo<PendingJson>(pendingPath, {});
  const { data: passwords, sha: passwordsSha } = await readJsonFromRepo<PasswordsJson>(passwordsPath, {});
  const pw = pending[username];

  // Support both legacy plaintext pending values and new bcrypt-hashed values.
  // If the pending value is not a bcrypt hash, hash it before storing in users.json.
  let passwordToStore = pw;
  const looksLikeBcrypt = typeof pw === "string" && /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(pw);
  if (typeof pw === "string" && !looksLikeBcrypt) {
    try {
      const { hash } = await import("bcryptjs");
      passwordToStore = await hash(pw, 10);
    } catch (e) {
      // If bcrypt is not available for some reason, fail safe rather than storing plaintext
      return err(500, "hashing-failed", { message: String((e as any)?.message || e) });
    }
  }

  if (!pw) return err(404, "not-pending");

  // update users
  const allowedSet = new Set<string>([...(users.allowed || [])]);
  allowedSet.add("admin");
  allowedSet.add(username);
  const nextUsers: UsersJson = { allowed: Array.from(allowedSet) };

  // merge/update passwords.json (hash is in passwordToStore)
  const nextPasswords: PasswordsJson = { ...(passwords || {}), [username]: passwordToStore };

  // remove from pending
  delete pending[username];

  try {
    await ghPutJson(usersPath,      nextUsers,      usersSha,      `approve user ${username} (tenant: ${tenant})`);
    await ghPutJson(passwordsPath,  nextPasswords,  passwordsSha,  `set password for ${username} (tenant: ${tenant})`);
    await ghPutJson(pendingPath,    pending,        pendingSha,    `remove pending ${username} (tenant: ${tenant})`);
    return ok({ tenant, username, approved: true });
  } catch (e: any) {
    return err(500, "approve-failed", { message: String(e?.message || e) });
  }
}