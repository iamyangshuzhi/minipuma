import { verify, getBearer, loadCodes, saveCodes, normalizeCode, withLock } from './_lib/auth.js';

export default async function handler(req, res) {
  const p = verify(getBearer(req));
  if (p && p.code && p.sid) {
    await withLock('codes', async () => {
      const codes = await loadCodes();
      const c = codes[p.code];
      if (c) {
        normalizeCode(c);
        c.sessions = c.sessions.filter(s => s !== p.sid);
        if (c.session === p.sid) c.session = c.sessions[c.sessions.length - 1] || null;
        await saveCodes(codes);
      }
    });
  }
  return res.json({ ok: true });
}
