// Single-code operations: PATCH (toggle / kick) and DELETE.
// Code passed as ?code=XXX (URL-encoded).
import { isAdmin, loadCodes, saveCodes } from '../_lib/auth.js';

export default async function handler(req, res) {
  if (!isAdmin(req)) return res.status(401).json({ error: 'unauthorized' });
  const code = String((req.query && req.query.code) || '').toUpperCase();
  if (!code) return res.status(400).json({ error: 'code required' });
  const codes = await loadCodes();
  if (!codes[code]) return res.status(404).json({ error: '邀请码不存在' });

  if (req.method === 'PATCH') {
    const action = String((req.body && req.body.action) || '');
    if (action === 'toggle') {
      codes[code].enabled = !codes[code].enabled;
      if (!codes[code].enabled) codes[code].session = null;
    } else if (action === 'kick') {
      codes[code].session = null;
    } else {
      return res.status(400).json({ error: 'unknown action' });
    }
    await saveCodes(codes);
    return res.json({ ok: true, codes });
  }

  if (req.method === 'DELETE') {
    delete codes[code];
    await saveCodes(codes);
    return res.json({ ok: true, codes });
  }

  return res.status(405).json({ error: 'method not allowed' });
}
