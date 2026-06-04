// Single-code operations: PATCH (toggle / kick / setMax) and DELETE.
// Code passed as ?code=XXX (URL-encoded).
import { isAdmin, loadCodes, saveCodes, normalizeCode, readBody, withLock } from '../_lib/auth.js';

export default async function handler(req, res) {
  if (!isAdmin(req)) return res.status(401).json({ error: 'unauthorized' });
  const code = String((req.query && req.query.code) || '').toUpperCase();
  if (!code) return res.status(400).json({ error: 'code required' });

  if (req.method !== 'PATCH' && req.method !== 'DELETE') {
    return res.status(405).json({ error: 'method not allowed' });
  }

  const body = readBody(req);

  const result = await withLock('codes', async () => {
    const codes = await loadCodes();
    if (!codes[code]) return { status: 404, json: { error: '邀请码不存在' } };
    normalizeCode(codes[code]);

    if (req.method === 'PATCH') {
      const action = String(body.action || '');
      if (action === 'toggle') {
        codes[code].enabled = !codes[code].enabled;
        if (!codes[code].enabled) { codes[code].sessions = []; codes[code].session = null; }
      } else if (action === 'kick') {
        codes[code].sessions = [];
        codes[code].session = null;
      } else if (action === 'setMax') {
        let m = parseInt(body.maxUsers, 10);
        if (!Number.isFinite(m) || m < 1) m = 1;
        if (m > 10000) m = 10000;
        codes[code].maxUsers = m;
        // If current sessions exceed new max, trim oldest
        while (codes[code].sessions.length > m) codes[code].sessions.shift();
      } else {
        return { status: 400, json: { error: 'unknown action' } };
      }
    } else { // DELETE
      delete codes[code];
    }

    await saveCodes(codes);
    return { json: { ok: true, codes } };
  });

  return res.status(result.status || 200).json(result.json);
}
