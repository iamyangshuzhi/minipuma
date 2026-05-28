import { sign, newSid, loadCodes, saveCodes } from './_lib/auth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });
  const code = String((req.body && req.body.code) || '').trim().toUpperCase();
  if (!code) return res.status(400).json({ error: '请填邀请码' });

  const codes = await loadCodes();
  if (!codes[code]) return res.status(401).json({ error: '邀请码无效' });
  if (!codes[code].enabled) return res.status(403).json({ error: '该邀请码已被停用，请联系管理员' });

  const sid = newSid();
  codes[code].session = sid;
  codes[code].last = Date.now();
  await saveCodes(codes);

  const exp = Date.now() + 30 * 24 * 60 * 60 * 1000; // 30 天
  const token = sign({ code, sid, exp });
  return res.json({ token, code });
}
