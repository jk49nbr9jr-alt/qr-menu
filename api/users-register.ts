// api/users-register.ts
// Node runtime registration endpoint (no fs/path on edge)
// Persists to GitHub repo: data/<tenant>/{users.json,pending.json}

import type { IncomingMessage, ServerResponse } from 'http';
import { Buffer } from 'node:buffer';

export const config = { runtime: 'nodejs18.x' } as const; // <— FIX: explizite Node-Runtime

function sanitizeTenant(t?: string) {
  const raw = (t || '').toString().trim().toLowerCase();
  const clean = raw.replace(/[^a-z0-9._-]/g, '');
  return clean || 'speisekarte';
}

function validatePasswordStrength(pwd: string): { ok: true; score: number } | { ok: false; score: number; message: string } {
  const length = pwd.length;
  const hasLower = /[a-z]/.test(pwd);
  const hasUpper = /[A-Z]/.test(pwd);
  const hasDigit = /[0-9]/.test(pwd);
  const hasSpecial = /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?`~]/.test(pwd);
  const tooCommon = /(password|123456|qwerty|letmein|welcome|iloveyou)/i.test(pwd);

  let score = 0;
  if (length >= 8) score++;
  if (length >= 12) score++;
  if (hasLower) score++;
  if (hasUpper) score++;
  if (hasDigit) score++;
  if (hasSpecial) score++;

  if (tooCommon) return { ok: false, score, message: "Passwort ist zu verbreitet/leicht zu erraten." };
  if (length < 8) return { ok: false, score, message: "Mindestens 8 Zeichen erforderlich." };
  if (!hasLower) return { ok: false, score, message: "Mindestens ein Kleinbuchstabe erforderlich." };
  if (!hasUpper) return { ok: false, score, message: "Mindestens ein Großbuchstabe erforderlich." };
  if (!hasDigit) return { ok: false, score, message: "Mindestens eine Ziffer erforderlich." };
  if (!hasSpecial) return { ok: false, score, message: "Mindestens ein Sonderzeichen erforderlich." };

  return { ok: true, score };
}

function buildURL(req: IncomingMessage) {
  const proto = (req.headers['x-forwarded-proto'] as string) || 'https';
  const host  = (req.headers['x-forwarded-host'] as string) || (req.headers.host as string) || 'localhost';
  const path  = typeof req.url === 'string' ? req.url : '/';
  return new URL(`${proto}://${host}${path}`);
}

async function readJsonBody<T = any>(req: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  const raw = Buffer.concat(chunks).toString('utf8') || '{}';
  try { return JSON.parse(raw) as T; } catch { return {} as T; }
}

function json(res: ServerResponse, status: number, body: any) {
  const data = JSON.stringify(body);
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(data);
}

// --- GitHub helpers ---
const GH_TOKEN  = process.env.GITHUB_TOKEN  || '';
const GH_OWNER  = process.env.GITHUB_OWNER  || '';
const GH_REPO   = process.env.GITHUB_REPO   || '';
const GH_BRANCH = process.env.GITHUB_BRANCH || 'main';

function ghUrl(p: string) {
  const path = p.replace(/^\/+/, '');
  return `https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/contents/${path}?ref=${encodeURIComponent(GH_BRANCH)}`;
}

function b64encode(str: string) { return Buffer.from(str, 'utf8').toString('base64'); }
function b64decode(b64: string) { try { return Buffer.from(b64, 'base64').toString('utf8'); } catch { return ''; } }

type UsersJsonObj = { allowed: string[]; passwords?: Record<string,string> };
type PendingJson = Record<string,string>;
type GitHubFile = { content?: string; sha?: string; encoding?: string };

async function ghReadJson<T>(repoPath: string, fallback: T): Promise<{ data: T; sha: string | null }> {
  const url = ghUrl(repoPath);
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${GH_TOKEN}`, Accept: 'application/vnd.github+json' },
    cache: 'no-store',
  });
  if (res.status === 404) return { data: fallback, sha: null };
  if (!res.ok) throw new Error(`GitHub read failed ${res.status} ${res.statusText}`);
  const file: GitHubFile = await res.json() as any;
  const txt = b64decode(file.content || '');
  try {
    return { data: JSON.parse(txt) as T, sha: file.sha || null };
  } catch {
    return { data: fallback, sha: file.sha || null };
  }
}

async function ghWriteJson(repoPath: string, obj: any, message: string, sha: string | null) {
  const url = ghUrl(repoPath);
  const body = {
    message,
    content: b64encode(JSON.stringify(obj, null, 2)),
    branch: GH_BRANCH,
    ...(sha ? { sha } : {}),
  } as any;
  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${GH_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`GitHub write failed ${res.status}: ${text || res.statusText}`);
  }
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    if (req.method !== 'POST') {
      res.statusCode = 405;
      res.setHeader('Allow', 'POST');
      return res.end('Method not allowed');
    }

    if (!GH_TOKEN || !GH_OWNER || !GH_REPO) {
      return json(res, 500, { ok: false, error: 'server-misconfigured' });
    }

    const url  = buildURL(req);
    const body = await readJsonBody<{ username?: string; password?: string; tenant?: string }>(req);

    const tenant = sanitizeTenant(body.tenant || url.searchParams.get('tenant') || undefined);
    let username = (body.username || '').toString().trim().toLowerCase();
    const password = (body.password || '').toString();

    // Server-side password strength policy
    const vs = validatePasswordStrength(password);
    if (!vs.ok) {
      return json(res, 400, { ok: false, error: 'weak-password', message: vs.message, score: vs.score });
    }

    // Hash password before writing to GitHub (no plaintext in repo)
    const { hash } = await import('bcryptjs');
    const passwordHash = await hash(password, 10);

    if (!tenant) return json(res, 400, { ok: false, error: 'tenant-missing' });
    if (!username || !password) return json(res, 400, { ok: false, error: 'invalid' });
    if (username === 'admin') return json(res, 400, { ok: false, error: 'invalid' });

    const usersPath   = `data/${tenant}/users.json`;
    const pendingPath = `data/${tenant}/pending.json`;

    // users.json tolerant lesen (Array oder Objekt)
    const { data: rawUsers, sha: usersSha } = await ghReadJson<any>(usersPath, { allowed: ['admin'], passwords: {} });
    let usersData: UsersJsonObj;
    if (Array.isArray(rawUsers)) {
      usersData = { allowed: rawUsers as string[], passwords: {} };
    } else if (rawUsers && typeof rawUsers === 'object') {
      const allowed = Array.isArray(rawUsers.allowed) ? rawUsers.allowed : [];
      const passwords = (rawUsers.passwords && typeof rawUsers.passwords === 'object') ? rawUsers.passwords : {};
      usersData = { allowed: allowed.length ? allowed : ['admin'], passwords };
    } else {
      usersData = { allowed: ['admin'], passwords: {} };
    }

    const { data: pendingData, sha: pendingSha } = await ghReadJson<PendingJson>(pendingPath, {});

    if (usersData.allowed.includes(username)) {
      return json(res, 409, { ok: false, error: 'exists' }); // <— FIX: 409
    }
    if (pendingData[username]) {
      return json(res, 409, { ok: false, error: 'pending' }); // <— FIX: 409
    }

    const nextPending: PendingJson = { ...pendingData, [username]: passwordHash };
    await ghWriteJson(
      pendingPath,
      nextPending,
      `feat(api): register pending user ${username} for ${tenant}`,
      pendingSha
    );

    // users.json anlegen, falls fehlte
    if (usersSha === null) {
      await ghWriteJson(usersPath, usersData, `chore(api): init users.json for ${tenant}`, null);
    }

    // Only return username, never the password hash or sensitive info in response
    return json(res, 200, { ok: true, tenant, pendingUser: username });
  } catch (e: any) {
    console.error('[api/users-register] CRASH', e);
    return json(res, 500, { ok: false, error: 'handler-crash', message: String(e?.message || e) });
  }
}