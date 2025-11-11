/**
 * users-delete.ts — Vercel Serverless Function (Node runtime)
 * Deletes a user from data/<tenant>/users.json in the GitHub repo.
 */


type UsersFile = {
  allowed: string[];
  // you might extend later with { pending: Record<string,string> } etc.
};

type PasswordsFile = Record<string, string>;

function json(res: any, status: number, data: any) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(data));
}

function getHeader(req: any, name: string): string | undefined {
  // Vercel Node runtime provides IncomingMessage with a plain headers object
  const key = name.toLowerCase();
  return req.headers?.[key] ?? req.headers?.[name] ?? undefined;
}

async function readBody(req: any): Promise<any> {
  // If body already parsed by Vercel, use it
  if (typeof req.body === "object" && req.body) return req.body;
  // Otherwise collect stream
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c));
  const raw = Buffer.concat(chunks).toString("utf8");
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function requireSecret(req: any) {
  const envSecret = process.env.ADMIN_SECRET || process.env.VITE_ADMIN_SECRET || "";
  const headerSecret = getHeader(req, "x-admin-secret") || "";
  if (!envSecret || headerSecret !== envSecret) {
    const err: any = new Error("Unauthorized");
    err.status = 401;
    throw err;
  }
}

function getTenantFrom(body: any, req: any): string {
  const t = (body?.tenant || req.query?.tenant || "").toString().trim();
  if (!t) {
    const err: any = new Error("Missing tenant");
    err.status = 400;
    throw err;
  }
  return t;
}

function getGitHubEnv() {
  const owner = process.env.GITHUB_OWNER;
  const repo = process.env.GITHUB_REPO;
  const token = process.env.GITHUB_TOKEN;
  if (!owner || !repo || !token) {
    const err: any = new Error("GitHub env not configured");
    err.status = 500;
    throw err;
  }
  return { owner, repo, token };
}

async function gh(path: string, init: any = {}) {
  const { token } = getGitHubEnv();
  const url = `https://api.github.com${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      "Authorization": `token ${token}`,
      "Accept": "application/vnd.github+json",
      "User-Agent": "qr-menu-users-delete",
      ...(init.headers || {}),
    },
  } as any);
  const text = await res.text();
  let data: any;
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  return { ok: res.ok, status: res.status, data };
}

async function readUsers(path: string): Promise<{ file: UsersFile; sha?: string }> {
  // GET /repos/{owner}/{repo}/contents/{path}
  const { owner, repo } = getGitHubEnv();
  const r = await gh(`/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}`);
  if (!r.ok) {
    // If file missing, start with empty allowed list
    if (r.status === 404) return { file: { allowed: ["admin"] } };
    const err: any = new Error("GitHub read failed");
    err.status = 502;
    err.detail = r.data;
    throw err;
  }
  const content = Buffer.from(r.data.content || "", r.data.encoding || "base64").toString("utf8");
  const parsed: UsersFile = JSON.parse(content || `{"allowed":["admin"]}`);
  return { file: parsed, sha: r.data.sha };
}

async function readPasswords(path: string): Promise<{ map: PasswordsFile; sha?: string }> {
  const { owner, repo } = getGitHubEnv();
  const r = await gh(`/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}`);
  if (!r.ok) {
    if (r.status === 404) return { map: {} };
    const err: any = new Error("GitHub read failed");
    err.status = 502;
    err.detail = r.data;
    throw err;
  }
  const content = Buffer.from(r.data.content || "", r.data.encoding || "base64").toString("utf8");
  const parsed: PasswordsFile = JSON.parse(content || "{}");
  return { map: parsed, sha: r.data.sha };
}

async function writeUsers(path: string, next: UsersFile, sha?: string, message = "Delete user") {
  const { owner, repo } = getGitHubEnv();
  const body = {
    message,
    content: Buffer.from(JSON.stringify(next, null, 2), "utf8").toString("base64"),
    sha, // required when overwriting
  };
  const r = await gh(`/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const err: any = new Error("GitHub write failed");
    err.status = 502;
    err.detail = r.data;
    throw err;
  }
}

async function writePasswords(path: string, next: PasswordsFile, sha?: string, message = "Update passwords") {
  const { owner, repo } = getGitHubEnv();
  const body = {
    message,
    content: Buffer.from(JSON.stringify(next, null, 2), "utf8").toString("base64"),
    sha,
  };
  const r = await gh(`/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const err: any = new Error("GitHub write failed");
    err.status = 502;
    err.detail = r.data;
    throw err;
  }
}

export default async function handler(req: any, res: any) {
  try {
    if (req.method !== "POST") {
      res.setHeader?.("Allow", "POST");
      return json(res, 405, { ok: false, error: "Method Not Allowed" });
    }

    // Auth
    requireSecret(req);

    // Body
    const body = await readBody(req);
    const tenant = getTenantFrom(body, req);
    const username = (body?.username || "").toString().trim();
    if (!username) return json(res, 400, { ok: false, error: "Missing username" });
    if (username === "admin") return json(res, 400, { ok: false, error: "Cannot delete admin" });

    const usersPath = `data/${tenant}/users.json`;
    const passwordsPath = `data/${tenant}/passwords.json`;

    // Read current
    const { file, sha } = await readUsers(usersPath);

    // Remove user if present
    const before = new Set((file.allowed || []).concat());
    before.delete("admin"); // ensure admin remains
    before.delete(username);
    const allowed = ["admin", ...Array.from(before).filter((u) => u !== "admin")];

    const next: UsersFile = { allowed };

    // Write back
    await writeUsers(usersPath, next, sha, `Delete user ${username}`);

    let pwdRemoved = false;
    try {
      const { map: pwdMap, sha: pwdSha } = await readPasswords(passwordsPath);
      if (username in pwdMap) {
        delete pwdMap[username];
        pwdRemoved = true;
        await writePasswords(passwordsPath, pwdMap, pwdSha, `Remove password for ${username}`);
      }
    } catch (pwErr) {
      // Do not fail the whole delete if password file is missing or invalid; include detail in non-prod
      if (process.env.NODE_ENV !== "production") {
        console.warn("[users-delete] password cleanup warning", pwErr);
      }
    }

    return json(res, 200, { ok: true, allowed, passwordRemoved: pwdRemoved });
  } catch (e: any) {
    const status = e?.status || 500;
    const payload: any = { ok: false, error: e?.message || "Server error" };
    if (process.env.NODE_ENV !== "production") {
      payload.detail = e?.detail || undefined;
    }
    return json(res, status, payload);
  }
}