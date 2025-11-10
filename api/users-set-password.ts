// api/users-set-password.ts
export const config = { runtime: "edge" }; // Vercel Edge

type GHFile = { content: string; sha: string; encoding: "base64" };

const GH_OWNER  = process.env.GITHUB_OWNER !;
const GH_REPO   = process.env.GITHUB_REPO  !;
const GH_BRANCH = process.env.GITHUB_BRANCH || "main";
const GH_TOKEN  = process.env.GITHUB_TOKEN !;

const ADMIN_SECRET = process.env.ADMIN_SECRET || process.env.VITE_ADMIN_SECRET || "";

// base64 helpers for Edge
const enc = (s: string) => btoa(unescape(encodeURIComponent(s)));
const dec = (b: string) => decodeURIComponent(escape(atob(b)));

function jsonRes(code: number, body: unknown) {
  return new Response(JSON.stringify(body, null, 2), {
    status: code,
    headers: { "content-type": "application/json" },
  });
}

async function gh<T>(path: string, init?: RequestInit): Promise<T> {
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
    const text = await r.text();
    throw new Error(`[write] ${r.status} ${text}`);
  }
  return r.json() as Promise<T>;
}

export default async function handler(req: Request) {
  try {
    // --- auth ---
    const secret = req.headers.get("x-admin-secret") || "";
    if (!ADMIN_SECRET || secret !== ADMIN_SECRET) {
      return jsonRes(401, { ok: false, error: "unauthorized" });
    }

    // --- input ---
    const url = new URL(req.url);
    const tenantQ = url.searchParams.get("tenant") || "";
    let username = "", password = "", tenant = tenantQ;
    try {
      const body = await req.json();
      username = (body?.username || "").trim();
      password = (body?.password || "").toString();
      tenant = tenant || (body?.tenant || "").trim();
    } catch { /* no body is ok for GET self-tests */ }

    if (!tenant) return jsonRes(400, { ok: false, error: "tenant missing" });
    if (req.method !== "POST") return jsonRes(405, { ok: false, error: "POST only" });
    if (!username || !password) return jsonRes(400, { ok: false, error: "invalid input" });

    // --- paths ---
    const path = `/repos/${GH_OWNER}/${GH_REPO}/contents/data/${tenant}/users.json`;

    // --- read existing file (may not exist on first run) ---
    let sha = "";
    let users: { allowed?: string[]; pending?: Record<string,string>; passwords?: Record<string,string> } = {
      allowed: ["admin"],
      pending: {},
      passwords: {},
    };

    try {
      const f = await gh<GHFile>(`${path}?ref=${encodeURIComponent(GH_BRANCH)}`);
      const json = dec(f.content);
      sha = f.sha;
      try { users = JSON.parse(json) || users; } catch {}
      users.allowed ||= ["admin"];
      users.pending ||= {};
      users.passwords ||= {};
    } catch {
      // file not found -> create new
    }

    // --- update password map ---
    users.passwords![username] = password;

    // --- write back (base64!) with sha if present ---
    const content = enc(JSON.stringify(users, null, 2) + "\n");
    const payload: any = {
      message: `chore(${tenant}): set password for ${username}`,
      content,
      branch: GH_BRANCH,
    };
    if (sha) payload.sha = sha;

    await gh(path, { method: "PUT", body: JSON.stringify(payload) });

    return jsonRes(200, { ok: true });
  } catch (err: any) {
    return jsonRes(500, { ok: false, error: String(err?.message || err) });
  }
}