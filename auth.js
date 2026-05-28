// Shared auth helpers — JWT sign/verify (HMAC-SHA256) + Vercel KV access.
import crypto from 'crypto';
import { kv } from '@vercel/kv';

const SECRET = process.env.SESSION_SECRET || 'CHANGE-ME-IN-VERCEL-ENV-VARS';

function b64u(buf) {
  return Buffer.from(buf).toString('base64').replace(/=+$/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}
function b64uDec(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  return Buffer.from(str, 'base64');
}

export function sign(payload) {
  const header = b64u(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64u(JSON.stringify(payload));
  const sig = b64u(crypto.createHmac('sha256', SECRET).update(`${header}.${body}`).digest());
  return `${header}.${body}.${sig}`;
}

export function verify(token) {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [h, b, s] = parts;
  const expected = b64u(crypto.createHmac('sha256', SECRET).update(`${h}.${b}`).digest());
  if (expected !== s) return null;
  try {
    const payload = JSON.parse(b64uDec(b).toString());
    if (payload.exp && Date.now() > payload.exp) return null;
    return payload;
  } catch { return null; }
}

export function newSid() {
  return crypto.randomBytes(16).toString('hex');
}

export function getBearer(req) {
  const h = req.headers.authorization || req.headers.Authorization || '';
  return h.startsWith('Bearer ') ? h.slice(7) : '';
}

export async function loadCodes() {
  const existing = await kv.get('codes');
  if (existing && typeof existing === 'object' && Object.keys(existing).length) return existing;
  // Seed on first run.
  const seed = { 'MINI-DEMO': { enabled: true, note: '示例邀请码', session: null, last: null } };
  await kv.set('codes', seed);
  return seed;
}

export async function saveCodes(codes) {
  await kv.set('codes', codes);
}

export async function getMaster() {
  const stored = await kv.get('master');
  if (stored) return stored;
  // First-run default. Admin must change immediately.
  return process.env.ADMIN_INIT_KEY || 'minipuma2026';
}

export async function setMaster(key) {
  await kv.set('master', key);
}

export function isAdmin(req) {
  const p = verify(getBearer(req));
  return !!(p && p.admin);
}

export async function getUserFromReq(req) {
  const p = verify(getBearer(req));
  if (!p || !p.code || !p.sid) return null;
  const codes = await loadCodes();
  const c = codes[p.code];
  if (!c || !c.enabled || c.session !== p.sid) return null;
  return { code: p.code, sid: p.sid };
}
