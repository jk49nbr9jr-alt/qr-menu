import fs from 'fs/promises';
import path from 'path';

function getTenant(bodyOrQuery: any) {
  const t = (bodyOrQuery?.tenant || '').toString().trim();
  return t || 'speisekarte';
}
function dirFor(tenant: string) {
  return path.join(process.cwd(), 'data', tenant);
}
async function ensureFiles(tenant: string) {
  const dir = dirFor(tenant);
  await fs.mkdir(dir, { recursive: true });
  const users = path.join(dir, 'users.json');
  const pending = path.join(dir, 'pending.json');
  try { await fs.access(users); } catch { await fs.writeFile(users, JSON.stringify({ allowed: ["admin"], passwords: {} }, null, 2)); }
  try { await fs.access(pending); } catch { await fs.writeFile(pending, JSON.stringify({}, null, 2)); }
  return { users, pending };
}
async function readJSON<T>(file: string, fallback: T): Promise<T> {
  try { return JSON.parse(await fs.readFile(file, 'utf8')) as T; } catch { return fallback; }
}
async function writeJSON(file: string, data: any) {
  await fs.writeFile(file, JSON.stringify(data, null, 2));
}
function requireSecret(req: Request) {
  const hdr = req.headers.get('x-admin-secret') || '';
  const expected = process.env.VITE_ADMIN_SECRET || process.env.ADMIN_SECRET || '';
  if (!expected || hdr !== expected) return false;
  return true;
}
export default async function handler(req: Request) {
  const { searchParams } = new URL(req.url);
  const tenant = getTenant({ tenant: searchParams.get('tenant') });
  const { users, pending } = await ensureFiles(tenant);

  const u = await readJSON<{allowed:string[], passwords:Record<string,string>}>(users, {allowed:["admin"], passwords:{}});
  const p = await readJSON<Record<string,string>>(pending, {});
  return new Response(JSON.stringify({ ok:true, allowed: u.allowed, pending: p }), { status: 200, headers: { 'Content-Type': 'application/json' }});
}