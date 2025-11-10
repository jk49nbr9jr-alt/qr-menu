// api/users-register.ts
// Node.js runtime (kein Edge), sauberer Body-Read, robustes Schreiben in pending.json

export const config = { runtime: "nodejs18.x" }; // oder "nodejs20.x" – nur KEIN "edge"

type GitFile = { sha?: string; content?: string; encoding?: string };
const OWNER   = process.env.GITHUB_OWNER!;
const REPO    = process.env.GITHUB_REPO!;
const BRANCH  = process.env.GITHUB_BRANCH || "main";
const TOKEN   = process.env.GITHUB_TOKEN!;

function b64(s: string) { return Buffer.from(s).toString("base64"); }
function ub64(s: string) { return Buffer.from(s, "base64").toString("utf8"); }

async function gh(path: string, init?: RequestInit) {
  const r = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/contents/${path}?ref=${BRANCH}`, {
    ...init,
    headers: {
      "Authorization": `Bearer ${TOKEN}`,
      "Accept": "application/vnd.github+json",
      ...init?.headers,
    },
    cache: "no-store",
  });
  return r;
}

async function readJson(path: string): Promise<{ json: any; sha?: string }> {
  const r = await gh(path);
  if (r.status === 404) return { json: {}, sha: undefined };
  if (!r.ok) throw new Error(`[read] ${r.status} ${await r.text()}`);
  const file = (await r.json()) as GitFile;
  const raw = file.content ? ub64(file.content) : "{}";
  let json: any = {};
  try { json = JSON.parse(raw || "{}"); } catch { json = {}; }
  return { json, sha: (file as any).sha };
}

async function writeJson(path: string, next: any, sha?: string, message = "update via users-register") {
  const body = {
    message,
    content: b64(JSON.stringify(next, null, 2)),
    branch: BRANCH,
    ...(sha ? { sha } : {}),
  };
  const r = await gh(path, { method: "PUT", body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`[write] ${r.status} ${await r.text()}`);
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ ok:false, error:"method not allowed" }), { status: 405 });
  }

  // Body lesen
  let body: any = {};
  try { body = await req.json(); } catch {}
  const url = new URL(req.url);
  // Tenant aus Body, sonst aus Query
  const tenant = (body?.tenant || url.searchParams.get("tenant") || "").toString().trim();
  let username = (body?.username || "").toString().trim();
  const password = (body?.password || "").toString();

  if (!tenant) return new Response(JSON.stringify({ ok:false, error:"tenant missing" }), { status: 400 });
  if (!username || !password) return new Response(JSON.stringify({ ok:false, error:"invalid" }), { status: 400 });

  // Username normalisieren (z. B. "Test " -> "test")
  username = username.toLowerCase();

  // Pfade
  const usersPath   = `data/${tenant}/users.json`;
  const pendingPath = `data/${tenant}/pending.json`;

  try {
    // users.json lesen (allowed-Liste)
    const { json: usersJson } = await readJson(usersPath);
    const allowed: string[] = Array.isArray(usersJson) ? usersJson : (usersJson?.allowed || usersJson || []);
    // pending.json lesen
    const { json: pendingJson, sha: pendingSha } = await readJson(pendingPath);
    const pending: Record<string,string> = pendingJson && typeof pendingJson === "object" ? pendingJson : {};

    // Prüfungen
    if (allowed.includes(username)) {
      return new Response(JSON.stringify({ ok:false, error:"exists" }), { status: 409 });
    }
    if (pending[username]) {
      return new Response(JSON.stringify({ ok:false, error:"pending" }), { status: 409 });
    }

    // Eintragen
    pending[username] = password;

    // Schreiben (mit/ohne sha)
    await writeJson(
      pendingPath,
      pending,
      pendingSha,
      `register ${username} -> data/${tenant}/pending.json`
    );

    return new Response(JSON.stringify({ ok:true, tenant, pendingUser: username }), { status: 200 });
  } catch (err: any) {
    console.error("[users-register] failed:", err);
    return new Response(JSON.stringify({ ok:false, error:String(err?.message || err) }), { status: 500 });
  }
}