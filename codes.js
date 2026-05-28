import { isAdmin, loadCodes, saveCodes } from '../_lib/auth.js';

export default async function handler(req, res) {
  if (!isAdmin(req)) return res.status(401).json({ error: 'unauthorized' });
  const codes = await loadCodes();

  if (req.method === 'GET') return res.json(codes);

  if (req.method === 'POST') {
    const code = String((req.body && req.body.code) || '').trim().toUpperCase();
    const note = String((req.body && req.body.note) || '');
    if (!code) return res.status(400).json({ error: '请填邀请码' });
    if (codes[code]) return res.status(409).json({ error: '该邀请码已存在' });
    codes[code] = { enabled: true, note, session: null, last: null };
    await saveCodes(codes);
    return res.json({ ok: true, codes });
  }

  return res.status(405).json({ error: 'method not allowed' });
}
