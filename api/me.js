import { getUserFromReq } from './_lib/auth.js';

export default async function handler(req, res) {
  const u = await getUserFromReq(req);
  if (!u) return res.status(401).json({ error: 'unauthorized' });
  return res.json({ ok: true, code: u.code });
}
