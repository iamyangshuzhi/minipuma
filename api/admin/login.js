import { sign, getMaster } from '../_lib/auth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });
  const key = String((req.body && req.body.key) || '');
  const master = await getMaster();
  if (key !== master) return res.status(401).json({ error: '管理员密钥错误' });
  const exp = Date.now() + 12 * 60 * 60 * 1000; // 12 小时
  const token = sign({ admin: true, exp });
  return res.json({ token });
}
