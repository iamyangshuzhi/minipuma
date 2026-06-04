import { isAdmin, loadCodes, saveCodes, readBody, withLock } from '../_lib/auth.js';

export default async function handler(req, res) {
  if (!isAdmin(req)) return res.status(401).json({ error: 'unauthorized' });

  if (req.method === 'GET') return res.json(await loadCodes());

  if (req.method === 'POST') {
    const body = readBody(req);
    const code = String(body.code || '').trim().toUpperCase();
    const note = String(body.note || '');
    let maxUsers = parseInt(body.maxUsers != null ? body.maxUsers : 1, 10);
    if (!Number.isFinite(maxUsers) || maxUsers < 1) maxUsers = 1;
    if (maxUsers > 10000) maxUsers = 10000;
    if (!code) return res.status(400).json({ error: '请填邀请码' });

    const result = await withLock('codes', async () => {
      const codes = await loadCodes();
      if (codes[code]) return { status: 409, json: { error: '该邀请码已存在' } };
      codes[code] = { enabled: true, note, sessions: [], maxUsers, last: null };
      await saveCodes(codes);
      return { json: { ok: true, codes } };
    });
    return res.status(result.status || 200).json(result.json);
  }

  return res.status(405).json({ error: 'method not allowed' });
}
