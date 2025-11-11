export const config = { runtime: 'nodejs' } as const;

import type { IncomingMessage, ServerResponse } from "http";
import { Buffer } from "node:buffer";

/* ----------------------------------------------------
 * SAME HELPERS WIE BEI DIR – NICHT VERÄNDERT
 * ---------------------------------------------------- */

type PendingMap = Record<string, string>;
type GitHubFile = { content: string; sha: string; encoding: string };
type PasswordsMap = Record<string, string>;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,x-admin-secret',
};

function ok(res: ServerResponse, data: any, status = 200) {
  const json = JSON.stringify({ ok: true, ...data });
  res.writeHead(status, { 'Content-Type': 'application/json', ...CORS });
  res.end(json);
}

function err(res: ServerResponse, status: number, message: string, details?: any) {
  const json = JSON.stringify({ ok: false, error: message, details });
  res.writeHead(status, { 'Content-Type': 'application/json', ...CORS });
  res.end(json);
}

function sanitizeTenant(input?: string) {
  const raw = (input || "").toString().trim().toLowerCase();
  const clean = raw.replace(/[^a-z0-9._-]/g, "");
  return clean || "speisekarte";
}

function requireSecret_Node(req: IncomingMessage) {
  const hdr = (req.headers["x-admin-secret"] as string) || "";
  const expected = process.env.ADMIN_SECRET || process.env.VITE_ADMIN_SECRET || "";
  return !!expected && hdr === expected;
}

/* ---------- GitHub ---------- */

const GH_OWNER = process.env.GITHUB_OWNER || "";
const GH_REPO = process.env.GITHUB_REPO || "";
const GH_TOKEN = process.env.GITHUB_TOKEN || "";

async function gh<T = any>(url: string, init?: any): Promise<T> {
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
    throw new Error(`GitHub ${r.status}: ${text}`);
  }

  return (await r.json()) as T;
}

async function ghGetFile(path: string): Promise<GitHubFile & { sha: string }> {
  return gh(`/repos/${GH_OWNER}/${GH_REPO}/contents/${encodeURIComponent(path)}`);
}

async function ghPutJson(path: string, obj: unknown, sha: string | null, message: string) {
  const content = Buffer.from(JSON.stringify(obj, null, 2), "utf8").toString("base64");

  return gh(`/repos/${GH_OWNER}/${GH_REPO}/contents/${encodeURIComponent(path)}`, {
    method: "PUT",
    body: JSON.stringify({ message, content, sha: sha || undefined }),
  });
}

async function readPending(path: string): Promise<{ data: PendingMap; sha: string | null }> {
  try {
    const f = await ghGetFile(path);
    const buf = Buffer.from(f.content, f.encoding as BufferEncoding);
    return { data: JSON.parse(buf.toString("utf8")), sha: f.sha };
  } catch {
    return { data: {}, sha: null };
  }
}

async function readPasswords(path: string): Promise<{ data: PasswordsMap; sha: string | null }> {
  try {
    const f = await ghGetFile(path);
    const buf = Buffer.from(f.content, f.encoding as BufferEncoding);
    return { data: JSON.parse(buf.toString("utf8")), sha: f.sha };
  } catch {
    return { data: {}, sha: null };
  }
}

/* ----------------------------------------------------
 * ✅ NOW THE NEW NODE-RUNTIME HANDLER
 * ---------------------------------------------------- */

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    if (req.method === "OPTIONS") {
      res.writeHead(200, CORS);
      return res.end("ok");
    }

    if (req.method !== "POST") {
      return err(res, 405, "method-not-allowed");
    }

    if (!requireSecret_Node(req)) {
      return err(res, 401, "unauthorized");
    }

    if (!GH_OWNER || !GH_REPO || !GH_TOKEN) {
      return err(res, 500, "missing-github-config", {
        GH_OWNER: !!GH_OWNER,
        GH_REPO: !!GH_REPO,
        GH_TOKEN: !!GH_TOKEN,
      });
    }

    /* ----- Read JSON body manually (Node style) ----- */
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    let body: any = {};
    try {
      body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
      return err(res, 400, "invalid-json");
    }

    const tenant = sanitizeTenant(body?.tenant);
    const username = (body?.username || "").toString().trim();

    if (!username) return err(res, 400, "username-required");

    const pendingPath = `data/${tenant}/pending.json`;
    const passwordsPath = `data/${tenant}/passwords.json`;

    const { data: pending, sha } = await readPending(pendingPath);

    const existed = username in pending;
    if (existed) delete pending[username];
    else return ok(res, { tenant, username, changed: false });

    await ghPutJson(
      pendingPath,
      pending,
      sha,
      `reject pending user ${username} (tenant: ${tenant})`
    );

    // Additionally: cleanup any stored password for this (never-approved) user
    let passwordRemoved = false;
    try {
      const { data: pwMap, sha: pwSha } = await readPasswords(passwordsPath);
      if (username in pwMap) {
        delete pwMap[username];
        await ghPutJson(
          passwordsPath,
          pwMap,
          pwSha,
          `remove password for rejected user ${username} (tenant: ${tenant})`
        );
        passwordRemoved = true;
      }
    } catch (pwErr) {
      // non-fatal; log for diagnostics
      console.warn("[users-reject] password cleanup warning:", pwErr instanceof Error ? pwErr.message : pwErr);
    }

    return ok(res, { tenant, username, changed: true, passwordRemoved });
  } catch (e: any) {
    console.error("[users-reject] CRASH", e);
    return err(res, 500, "handler-crash", String(e?.message || e));
  }
}