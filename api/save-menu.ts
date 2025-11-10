// api/save-menu.ts
export const config = { runtime: "nodejs" } as const;

// --- Environment ---
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const OWNER = process.env.GITHUB_OWNER;
const REPO = process.env.GITHUB_REPO;
const BRANCH = process.env.GITHUB_BRANCH || "main";
const ADMIN_SECRET = process.env.ADMIN_SECRET;

// --- Helpers ---
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, x-admin-secret",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

async function getSha(path: string): Promise<string | undefined> {
  const url = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${encodeURIComponent(
    path
  )}?ref=${BRANCH}`;
  const r = await fetch(url, {
    headers: {
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      "User-Agent": "qr-menu",
    },
  });
  if (r.status === 200) {
    const j: any = await r.json();
    return j.sha as string;
  }
  return undefined;
}

function sanitizeTenant(t: string): string {
  // keep only safe chars, lowercased; fallback to 'speisekarte'
  const safe = (t || "").toLowerCase().match(/[a-z0-9._-]+/g)?.join("") || "speisekarte";
  return safe;
}

// --- Handler ---
export default async function handler(req: Request): Promise<Response> {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return json({ ok: false, error: "method-not-allowed" }, 405);
  }

  // Basic env validation
  if (!GITHUB_TOKEN || !OWNER || !REPO) {
    return json({ ok: false, error: "server-misconfigured" }, 500);
  }
  if (!ADMIN_SECRET) {
    return json({ ok: false, error: "missing-admin-secret" }, 500);
  }

  // Simple auth
  const auth = req.headers.get("x-admin-secret") || "";
  if (auth !== ADMIN_SECRET) {
    return json({ ok: false, error: "unauthorized" }, 401);
  }

  // Parse & validate body
  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "bad-json" }, 400);
  }
  const tenantInput = (body?.tenant ?? "") as string;
  const items = body?.items;
  if (!tenantInput || !Array.isArray(items)) {
    return json({ ok: false, error: "bad-request" }, 400);
  }
  const tenant = sanitizeTenant(tenantInput);

  const path = `public/menus/${tenant}.json`;
  try {
    const content = Buffer.from(JSON.stringify(items, null, 2)).toString("base64");
    const sha = await getSha(path);

    const res = await fetch(
      `https://api.github.com/repos/${OWNER}/${REPO}/contents/${encodeURIComponent(path)}`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${GITHUB_TOKEN}`,
          "Content-Type": "application/json",
          "User-Agent": "qr-menu",
        },
        body: JSON.stringify({
          message: `chore(menu): update ${tenant}.json`,
          content,
          branch: BRANCH,
          sha,
        }),
      }
    );

    if (!res.ok) {
      const t = await res.text().catch(() => "");
      return json({ ok: false, error: "github-error", details: t || res.statusText }, 500);
    }

    return json({ ok: true, path });
  } catch (e: any) {
    return json({ ok: false, error: "exception", details: e?.message || String(e) }, 500);
  }
}