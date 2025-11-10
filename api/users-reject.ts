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
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  if (!requireSecret(req)) return new Response('Unauthorized', { status: 401 });

  const body = await req.json();
  const tenant = getTenant(body);
  const username = (body.username||'').toString().trim();
  const { pending } = await ensureFiles(tenant);
  const p = await readJSON<Record<string,string>>(pending, {});
  delete p[username];
  await writeJSON(pending, p);
  return new Response(JSON.stringify({ ok:true }), { status: 200 });
}