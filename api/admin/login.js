import { sign, getMaster, readBody, clientIp, rateLimit } from '../_lib/auth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });

  // Brute-force guard on the master key: 10 attempts / 5 min per IP
  const rl = await rateLimit('adminlogin:' + clientIp(req), 10, 300);
  if (!rl.ok) return res.status(429).json({ error: '尝试过于频繁，请 5 分钟后再试' });

  const key = String(readBody(req).key || '');
  const master = await getMaster();
  if (key !== master) return res.status(401).json({ error: '管理员密钥错误' });
  const exp = Date.now() + 12 * 60 * 60 * 1000; // 12 小时
  const token = sign({ admin: true, exp });
  return res.json({ token });
}
