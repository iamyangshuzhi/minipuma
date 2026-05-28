import { verify, getBearer, loadCodes, saveCodes } from './_lib/auth.js';

export default async function handler(req, res) {
  const p = verify(getBearer(req));
  if (p && p.code && p.sid) {
    const codes = await loadCodes();
    if (codes[p.code] && codes[p.code].session === p.sid) {
      codes[p.code].session = null;
      await saveCodes(codes);
    }
  }
  return res.json({ ok: true });
}
