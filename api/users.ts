// api/users.ts
export const config = { runtime: "edge" };

type UsersJson = {
  allowed?: string[];
  pending?: Record<string, string>;
  passwords?: Record<string, string>;
};

const GH_OWNER  = process.env.GITHUB_OWNER!;
const GH_REPO   = process.env.GITHUB_REPO!;
const GH_BRANCH = process.env.GITHUB_BRANCH || "main";
const GH_TOKEN  = process.env.GITHUB_TOKEN!;
const ADMIN_SECRET = process.env.ADMIN_SECRET || process.env.VITE_ADMIN_SECRET || "";

// base64 utils (Edge)
const dec = (b: string) => decodeURIComponent(escape(atob(b)));

function jsonRes(status: number, body: unknown) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function gh<T>(path: string): Promise<T> {
  const r = await fetch(`https://api.github.com${path}`, {
    headers: {
      Authorization: `Bearer ${GH_TOKEN}`,
      Accept: "application/vnd.github+json",
    },
    cache: "no-store",
  });
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  return r.json() as Promise<T>;
}

export default async function handler(req: Request) {
  try {
    const url = new URL(req.url);
    const tenant = (url.searchParams.get("tenant") || "").trim();
    if (!tenant) return jsonRes(400, { ok: false, error: "tenant missing" });

    // optional: self-test mode
    const mode = url.searchParams.get("mode") || "";

    // read users.json from repo (if missing, return defaults)
    type GHFile = { content: string; sha: string; encoding: "base64" };
    let users: UsersJson = { allowed: ["admin"], pending: {}, passwords: {} };

    try {
      const file = await gh<GHFile>(
        `/repos/${GH_OWNER}/${GH_REPO}/contents/data/${tenant}/users.json?ref=${encodeURIComponent(GH_BRANCH)}`
      );
      const text = dec(file.content);
      const parsed = JSON.parse(text) as UsersJson;
      users.allowed = parsed.allowed || ["admin"];
      users.pending = parsed.pending || {};
      users.passwords = parsed.passwords || {};
    } catch {
      // file not found => keep defaults
    }

    // include passwords only with valid secret
    const hasSecret =
      !!ADMIN_SECRET && req.headers.get("x-admin-secret") === ADMIN_SECRET;

    const body: any = {
      ok: true,
      allowed: users.allowed || ["admin"],
      pending: users.pending || {},
    };

    if (hasSecret) {
      body.passwords = users.passwords || {};
    }

    // optional visibility for quick checks
    if (mode === "selftest") {
      body.selftest = {
        hasSecret,
        keys: {
          GITHUB_OWNER_present: !!GH_OWNER,
          GITHUB_REPO_present: !!GH_REPO,
          GITHUB_TOKEN_present: !!GH_TOKEN,
        },
        tenant,
      };
    }

    return jsonRes(200, body);
  } catch (err: any) {
    return jsonRes(500, { ok: false, error: String(err?.message || err) });
  }
}