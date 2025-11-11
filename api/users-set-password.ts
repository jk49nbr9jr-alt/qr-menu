// api/users-set-password.ts
// Sets (or resets) a user's password by updating data/<tenant>/users.json
// Stores only a bcrypt *hash* under users.passwords[username].
// Auth: requires x-admin-secret header to match ADMIN_SECRET/VITE_ADMIN_SECRET.

export const config = { runtime: "nodejs" } as const; // bcrypt requires Node runtime

import type { IncomingMessage, ServerResponse } from "http";
import { Buffer } from "node:buffer";

type GHFile = { content: string; sha: string; encoding: string };

const GH_OWNER  = process.env.GITHUB_OWNER  || "";
const GH_REPO   = process.env.GITHUB_REPO   || "";
const GH_BRANCH = process.env.GITHUB_BRANCH || "main";
const GH_TOKEN  = process.env.GITHUB_TOKEN  || "";

const ADMIN_SECRET = process.env.ADMIN_SECRET || process.env.VITE_ADMIN_SECRET || "";

function json(res: ServerResponse, code: number, body: unknown) {
  res.statusCode = code;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body, null, 2));
}

function sanitizeTenant(input?: string) {
  const raw = (input || "").toString().trim().toLowerCase();
  const clean = raw.replace(/[^a-z0-9._-]/g, "");
  return clean || "speisekarte";
}

async function readJsonBody<T = any>(req: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  const raw = Buffer.concat(chunks).toString("utf8") || "{}";
  try { return JSON.parse(raw) as T; } catch { return {} as T; }
}

async function gh<T = any>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${GH_TOKEN}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
    cache: "no-store",
  });
  if (!r.ok) {
    const txt = await r.text().catch(() => "");
    throw new Error(`[write] ${r.status} ${txt || r.statusText}`);
  }
  return r.json() as Promise<T>;
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    // ---- auth ----
    const secret = (req.headers["x-admin-secret"] as string | undefined) || "";
    if (!ADMIN_SECRET || secret !== ADMIN_SECRET) {
      return json(res, 401, { ok: false, error: "unauthorized" });
    }

    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return json(res, 405, { ok: false, error: "POST only" });
    }

    // ---- input ----
    const body = await readJsonBody<{ tenant?: string; username?: string; password?: string }>(req);
    const tenant   = sanitizeTenant(body.tenant);
    const username = (body.username || "").toString().trim();
    const password = (body.password || "").toString();

    if (!tenant)   return json(res, 400, { ok: false, error: "tenant missing" });
    if (!username || !password) return json(res, 400, { ok: false, error: "invalid input" });

    // ---- read existing users file ----
    const path = `/repos/${GH_OWNER}/${GH_REPO}/contents/data/${tenant}/users.json`;

    let sha = "";
    let users: { allowed?: string[]; pending?: Record<string, string>; passwords?: Record<string, string> } = {
      allowed: ["admin"],
      pending: {},
      passwords: {},
    };

    try {
      const f = await gh<GHFile>(`${path}?ref=${encodeURIComponent(GH_BRANCH)}`);
      const txt = Buffer.from(f.content, (f.encoding as BufferEncoding) || "base64").toString("utf8");
      sha = f.sha;
      try { users = JSON.parse(txt) || users; } catch {}
      users.allowed ||= ["admin"]; users.pending ||= {}; users.passwords ||= {};
    } catch {
      // not found -> new file will be created
    }

    // ---- hash password (bcrypt) ----
    const looksLikeBcrypt = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(password);
    let passwordHash = password;
    if (!looksLikeBcrypt) {
      const { hash } = await import("bcryptjs");
      passwordHash = await hash(password, 10);
    }

    // ---- update password map ----
    users.passwords![username] = passwordHash;

    // ---- write back (base64) ----
    const content = Buffer.from(JSON.stringify(users, null, 2) + "\n", "utf8").toString("base64");
    const payload: any = {
      message: `chore(${tenant}): set password (hashed) for ${username}`,
      content,
      branch: GH_BRANCH,
    };
    if (sha) payload.sha = sha;

    await gh(path, { method: "PUT", body: JSON.stringify(payload) });

    // Do not return the hash
    return json(res, 200, { ok: true, username, tenant });
  } catch (err: any) {
    return json(res, 500, { ok: false, error: String(err?.message || err) });
  }
}