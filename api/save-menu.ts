// api/save-menu.ts
export const config = { runtime: "edge" };

const GITHUB_TOKEN = process.env.GITHUB_TOKEN!;
const OWNER = process.env.GITHUB_OWNER!;
const REPO = process.env.GITHUB_REPO!;
const BRANCH = process.env.GITHUB_BRANCH || "main";
const ADMIN_SECRET = process.env.ADMIN_SECRET!;

async function getSha(path: string) {
  const url = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${encodeURIComponent(path)}?ref=${BRANCH}`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${GITHUB_TOKEN}`, "User-Agent": "qr-menu" }});
  if (r.status === 200) { const j:any = await r.json(); return j.sha as string; }
  return undefined;
}

export default async (req: Request) => {
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  const auth = req.headers.get("x-admin-secret") || "";
  if (auth !== ADMIN_SECRET) return new Response("Unauthorized", { status: 401 });

  const body = await req.json().catch(() => null) as { tenant?: string; items?: any[] } | null;
  if (!body || !body.tenant || !Array.isArray(body.items)) {
    return new Response("Bad Request", { status: 400 });
  }

  const path = `public/menus/${body.tenant}.json`;
  const content = Buffer.from(JSON.stringify(body.items, null, 2)).toString("base64");
  const sha = await getSha(path);

  const res = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/contents/${encodeURIComponent(path)}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      "Content-Type": "application/json",
      "User-Agent": "qr-menu"
    },
    body: JSON.stringify({
      message: `chore(menu): update ${body.tenant}.json`,
      content,
      branch: BRANCH,
      sha
    })
  });

  if (!res.ok) {
    const t = await res.text();
    return new Response(`GitHub error: ${t}`, { status: 500 });
  }
  return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json" }});
};