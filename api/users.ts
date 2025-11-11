// api/users.ts (Edge) - This endpoint never returns passwords and is used only for listing `allowed` and `pending`
export const config = { runtime: "edge" };

type UsersJson = {
  allowed?: string[];
  // (Intentionally no passwords here – hashes are never returned by this endpoint)
};
type PendingJson = Record<string, string>;

const GH_OWNER  = process.env.GITHUB_OWNER || "";
const GH_REPO   = process.env.GITHUB_REPO || "";
const GH_BRANCH = process.env.GITHUB_BRANCH || "main";
const GH_TOKEN  = process.env.GITHUB_TOKEN || "";
const ADMIN_SECRET = process.env.ADMIN_SECRET || process.env.VITE_ADMIN_SECRET || "";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type,x-admin-secret",
};

// base64 decode (Edge-safe)
const b64dec = (b: string) => {
  try { return decodeURIComponent(escape(atob(b))); } catch { return atob(b); }
};

const jsonRes = (status: number, body: unknown) =>
  new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...CORS,
    },
  });

const sanitizeTenant = (t?: string) => {
  const clean = (t || "").toLowerCase().trim().replace(/[^a-z0-9._-]/g, "");
  return clean || "speisekarte";
};

async function gh<T>(path: string): Promise<{ ok: true; data: T } | { ok: false; status: number; text: string }> {
  const r = await fetch(`https://api.github.com${path}`, {
    headers: {
      Authorization: `Bearer ${GH_TOKEN}`,
      Accept: "application/vnd.github+json",
    },
    cache: "no-store",
  });
  if (!r.ok) {
    return { ok: false, status: r.status, text: await r.text() };
  }
  return { ok: true, data: (await r.json()) as T };
}

export default async function handler(req: Request) {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: CORS });
  }
  try {
    const url = new URL(req.url);
    const tenant = sanitizeTenant(url.searchParams.get("tenant") || undefined);
    if (!tenant) return jsonRes(400, { ok: false, error: "tenant missing" });

    const mode = url.searchParams.get("mode") || "";

    // --- users.json lesen (tolerant)
    let allowed: string[] = ["admin"];

    type GHFile = { content: string; sha: string; encoding: "base64" };

    if (GH_TOKEN && GH_OWNER && GH_REPO) {
      const usersPath = `/repos/${GH_OWNER}/${GH_REPO}/contents/data/${tenant}/users.json?ref=${encodeURIComponent(GH_BRANCH)}`;
      const ur = await gh<GHFile>(usersPath);
      if (ur.ok) {
        try {
          const txt = b64dec(ur.data.content || "");
          const parsed = JSON.parse(txt) as UsersJson | string[];
          if (Array.isArray(parsed)) {
            allowed = parsed.length ? parsed : ["admin"];
          } else if (parsed && typeof parsed === "object") {
            allowed = Array.isArray(parsed.allowed) && parsed.allowed.length ? parsed.allowed : ["admin"];
          }
          // Ensure 'admin' is always present and remove duplicates
          allowed = Array.from(new Set([...(allowed || []), "admin"]));
        } catch {
          // fallback auf defaults
        }
      } else if (ur.status !== 404) {
        // andere Fehler als 404 melden
        return jsonRes(500, { ok: false, error: "github-read-users", detail: ur.text });
      }
    } else {
      return jsonRes(500, { ok: false, error: "server-misconfigured" });
    }

    // --- pending.json separat lesen
    let pending: PendingJson = {};
    const pendingPath = `/repos/${GH_OWNER}/${GH_REPO}/contents/data/${tenant}/pending.json?ref=${encodeURIComponent(GH_BRANCH)}`;
    const pr = await gh<GHFile>(pendingPath);
    if (pr.ok) {
      try {
        const txt = b64dec(pr.data.content || "");
        const obj = JSON.parse(txt);
        if (obj && typeof obj === "object") pending = obj as PendingJson;
      } catch {
        pending = {};
      }
    } else if (pr.status !== 404) {
      return jsonRes(500, { ok: false, error: "github-read-pending", detail: pr.text });
    }

    const hasSecret = !!ADMIN_SECRET && req.headers.get("x-admin-secret") === ADMIN_SECRET;
    const body: any = { ok: true, tenant, allowed, pending };
    // No passwords are ever returned from this endpoint.

    if (mode === "selftest") {
      body.selftest = {
        hasSecret,
        keys: {
          GITHUB_OWNER_present: !!GH_OWNER,
          GITHUB_REPO_present: !!GH_REPO,
          GITHUB_TOKEN_present: !!GH_TOKEN,
        },
      };
    }

    return jsonRes(200, body);
  } catch (err: any) {
    return jsonRes(500, { ok: false, error: String(err?.message || err) });
  }
}