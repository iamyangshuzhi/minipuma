import { sign, newSid, loadCodes, saveCodes, normalizeCode, readBody, clientIp, rateLimit, withLock } from './_lib/auth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });

  // Brute-force guard: 20 attempts / 60s per IP
  const rl = await rateLimit('login:' + clientIp(req), 20, 60);
  if (!rl.ok) return res.status(429).json({ error: '尝试过于频繁，请稍后再试' });

  const body = readBody(req);
  const code = String(body.code || '').trim().toUpperCase();
  if (!code) return res.status(400).json({ error: '请填邀请码' });

  const result = await withLock('codes', async () => {
    const codes = await loadCodes();
    if (!codes[code]) return { status: 401, json: { error: '邀请码无效' } };
    if (!codes[code].enabled) return { status: 403, json: { error: '该邀请码已被停用，请联系管理员' } };

    normalizeCode(codes[code]);
    const sid = newSid();
    // FIFO: if at capacity, drop oldest session
    if (codes[code].sessions.length >= codes[code].maxUsers) {
      codes[code].sessions.shift();
    }
    codes[code].sessions.push(sid);
    codes[code].session = sid; // keep legacy field in sync for back-compat
    codes[code].last = Date.now();
    await saveCodes(codes);
    return { sid };
  });

  if (result.status) return res.status(result.status).json(result.json);

  const exp = Date.now() + 30 * 24 * 60 * 60 * 1000; // 30 天
  const token = sign({ code, sid: result.sid, exp });
  return res.json({ token, code });
}
