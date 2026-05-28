import { isAdmin, setMaster } from '../_lib/auth.js';

export default async function handler(req, res) {
  if (!isAdmin(req)) return res.status(401).json({ error: 'unauthorized' });
  if (req.method !== 'PATCH') return res.status(405).json({ error: 'method not allowed' });
  const key = String((req.body && req.body.key) || '');
  if (!key || key.length < 6) return res.status(400).json({ error: '新密钥过短(≥6位)' });
  await setMaster(key);
  return res.json({ ok: true });
}
