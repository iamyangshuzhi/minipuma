// Shared auth helpers — JWT sign/verify (HMAC-SHA256) + Upstash Redis access.
import crypto from 'crypto';
import { Redis } from '@upstash/redis';

const SECRET = process.env.SESSION_SECRET || 'CHANGE-ME-IN-VERCEL-ENV-VARS';
// Upstash via Vercel Marketplace 注入的是 KV_REST_API_* 命名；老的 Upstash 直连用 UPSTASH_REDIS_REST_*。两种都兼容。
const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});

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

// Defensive body parsing — Vercel usually parses JSON into req.body, but if the
// content-type is missing or the runtime changes, req.body can arrive as a raw
// string / Buffer / undefined. This guarantees handlers always get an object.
// (Root cause of the earlier "maxUsers always 1" bug.)
export function readBody(req) {
  let b = req && req.body;
  if (b == null) return {};
  if (Buffer.isBuffer(b)) b = b.toString('utf8');
  if (typeof b === 'string') { try { return JSON.parse(b || '{}'); } catch { return {}; } }
  return b;
}

export function clientIp(req) {
  const xff = (req.headers && (req.headers['x-forwarded-for'] || req.headers['X-Forwarded-For'])) || '';
  const first = (Array.isArray(xff) ? xff[0] : String(xff)).split(',')[0].trim();
  return first || (req.socket && req.socket.remoteAddress) || 'unknown';
}

// Fixed-window rate limiter backed by Redis. Returns {ok, count}.
export async function rateLimit(id, limit, windowSec) {
  try {
    const key = 'rl:' + id;
    const n = await redis.incr(key);
    if (n === 1) await redis.expire(key, windowSec);
    return { ok: n <= limit, count: n };
  } catch { return { ok: true, count: 0 }; } // never block on limiter failure
}

// Best-effort distributed lock (SET NX PX + short spin). Serializes the
// read-modify-write on the shared `codes` object so concurrent logins don't
// clobber each other or transiently exceed maxUsers.
export async function withLock(name, fn, opts) {
  const { ttlMs = 3000, tries = 25, waitMs = 80 } = opts || {};
  const key = 'lock:' + name;
  const token = newSid();
  let got = false;
  for (let i = 0; i < tries; i++) {
    let r = null;
    try { r = await redis.set(key, token, { nx: true, px: ttlMs }); } catch { break; }
    if (r === 'OK' || r === true) { got = true; break; }
    await new Promise(res => setTimeout(res, waitMs));
  }
  try { return await fn(); }
  finally { if (got) { try { await redis.del(key); } catch {} } }
}

// Normalize a code record: ensure sessions array + maxUsers field exist
// Back-compat: old records had single `session` field → migrate to `sessions` array.
export function normalizeCode(c) {
  if (!c || typeof c !== 'object') return c;
  if (!Array.isArray(c.sessions)) {
    c.sessions = c.session ? [c.session] : [];
  }
  if (typeof c.maxUsers !== 'number' || c.maxUsers < 1) c.maxUsers = 1;
  if (c.maxUsers > 10000) c.maxUsers = 10000;
  // Keep `session` for legacy reads but treat `sessions` as source of truth.
  return c;
}

export async function loadCodes() {
  const existing = await redis.get('codes');
  if (existing && typeof existing === 'object' && Object.keys(existing).length) {
    Object.keys(existing).forEach(k => normalizeCode(existing[k]));
    return existing;
  }
  // Seed on first run.
  const seed = { 'MINI-DEMO': { enabled: true, note: '示例邀请码', sessions: [], maxUsers: 1, last: null } };
  await redis.set('codes', seed);
  return seed;
}

export async function saveCodes(codes) {
  await redis.set('codes', codes);
}

export async function getMaster() {
  const stored = await redis.get('master');
  if (stored) return stored;
  return process.env.ADMIN_INIT_KEY || 'minipuma2026';
}

export async function setMaster(key) {
  await redis.set('master', key);
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
  if (!c || !c.enabled) return null;
  normalizeCode(c);
  if (!c.sessions.includes(p.sid)) return null;
  return { code: p.code, sid: p.sid };
}
