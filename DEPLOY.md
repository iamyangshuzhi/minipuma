# Minipuma 后端部署清单（2026-06 修订版）

> **本次代码审查改动（2026-06）**：
> - 修复 `build_app.cjs` 写死的旧会话输出路径 → 改为脚本同目录的 `./index.html`，`node build_app.cjs` 现在可直接重建前端。
> - 所有 API handler 增加**防御式 body 解析**（`readBody`）：无论 Vercel 是否把请求体解析成对象，`maxUsers` 等字段都能正确读取——这就是之前「设 1000 人却只能 1 人 / 改上限无效」的根因。**请重新部署后再测。**
> - `/api/login` 与 `/api/admin/login` 增加 **Redis 限流**（防暴力破解）。
> - 邀请码的读-改-写加 **Redis 轻量锁**，多人同时登录不再互相覆盖 session。
> - 数据层修正 4 条格式不全的条目（补全剂量/tier 字段）。

## 你要上传到 GitHub 仓库的文件

```
仓库根/
├── index.html                  # 前端单页应用（已对接 API）
├── package.json                # 声明 @upstash/redis 依赖
└── api/
    ├── _lib/
    │   └── auth.js             # JWT + Redis 公共工具
    ├── login.js                # POST  /api/login
    ├── logout.js               # POST  /api/logout
    ├── me.js                   # GET   /api/me  (心跳)
    └── admin/
        ├── login.js            # POST  /api/admin/login
        ├── codes.js            # GET/POST  /api/admin/codes
        ├── code.js             # PATCH/DELETE  /api/admin/code?code=XXX
        └── key.js              # PATCH  /api/admin/key
```

---

## 部署 5 步

### 第 1 步 · 把上面所有文件上传到 GitHub 仓库

打开你的 `minipuma` GitHub 仓库：

1. **删掉旧的 `index.html`**（如果还在的话）
2. 点 **Add file → Upload files**
3. 把以下文件 **全部拖进去**（保持目录结构）：
   - `index.html`
   - `package.json`
   - `api/_lib/auth.js`
   - `api/login.js`、`api/logout.js`、`api/me.js`
   - `api/admin/login.js`、`codes.js`、`code.js`、`key.js`
4. 拉到底点 **Commit changes**

> GitHub 网页上传保留目录结构的方法：在仓库主页点 "Add file → Create new file"，文件名输 `api/login.js` (带斜杠) 就会自动建子目录。或者用文件管理器把整个目录拖到 GitHub 上传框。

Vercel 会自动检测到 push 开始构建，**第一次部署会失败**（因为还没接 Redis），不用慌，下一步搞定。

### 第 2 步 · 在 Vercel 项目里开 Upstash Redis（重点！）

1. Vercel → 你的 `minipuma` 项目 → 顶部 **Storage** 标签
2. 点 **Create Database**
3. 在 Marketplace 列表里找到 **Upstash** → 点 **Create**
   > （不是 Redis-Official、不是 Edge Config、不是 Blob——是 Upstash）
4. 弹出窗口：
   - 选 **Redis**（不是 Vector/Queue/Search）
   - 数据库名：随便起，比如 `minipuma-db`
   - **Primary Region**：选离你近的（**Singapore** 或 **Tokyo**）
   - **Plan**：选 **Free**
5. 点 **Continue / Create**
6. 创建完成后，Vercel 会问"要不要把这个数据库连到 minipuma 项目" → **Connect**
7. **它会自动注入** Redis 连接环境变量到你的项目。视集成版本，变量名可能是：
   - 新版（Vercel Marketplace Upstash）：`KV_REST_API_URL` + `KV_REST_API_TOKEN`
   - 旧版（Upstash 直连）：`UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`

   **两套命名 `auth.js` 都兼容**（优先读 `KV_REST_API_*`，回退 `UPSTASH_REDIS_REST_*`），你不用手动填，也不用关心是哪套。

### 第 3 步 · 再加两个你自己设的环境变量

Vercel → 项目 → **Settings → Environment Variables**

| Name | Value | 说明 |
|---|---|---|
| `SESSION_SECRET` | **32 位随机字符串** | JWT 签名密钥，绝密 |
| `ADMIN_INIT_KEY` | **管理员初始密钥** (≥12位) | 第一次登录后台用 |

生成随机字符串可以在终端跑 `openssl rand -hex 32`，或在 https://www.random.org/strings 上随便生成。

3 个 Environment 选项都勾上（Production / Preview / Development）。

### 第 4 步 · 触发重新部署

Vercel → 项目 → **Deployments** → 找到最新一次（可能是失败的红色）→ 右侧 `⋯` → **Redeploy**

新部署会读取最新的环境变量。等几十秒，状态变 **Ready** 绿色。

### 第 5 步 · 验证 + 立刻改默认密钥

打开 **https://minipuma.xyz**：

1. 输入 `MINI-DEMO` → 应该能进，进入首页（症状网格）
2. 在地址栏改成 **https://minipuma.xyz/#admin**（这是隐藏入口，公开页不显示）
3. 输入你刚才设的 **ADMIN_INIT_KEY** → 进入后台
4. **立刻做这 4 件事**：
   - 用"更新密钥"改一个新的（≥6 位，只有你知道）
   - "添加邀请码" → 加上你要发出去的真实邀请码（如 `VIP-001` 备注"张三"）
   - **删除或停用 `MINI-DEMO`**
   - 退出登录，再用新的邀请码测一下能不能进

---

## 关于 Upstash 免费档

- **10,000 commands / 天** （够用，咱们这量级算下来一个用户一天 ~100 commands，够 100 用户日活）
- 256MB 存储（这里只存几十条邀请码，几 KB）
- **完全免费**，不需要绑卡

未来真用爆了 ($0.20/100k commands 也很便宜)。

---

## 常见问题

### Q: 部署后访问报 500 错误？

去 Vercel 项目 → **Functions** 标签 → 找到出错的 API → 看 **Logs**，多半是：
- 环境变量没加全
- Upstash 没连到项目
- 改了变量没 Redeploy

### Q: 后台进去看到"加载中"卡住不动？

按 F12 开发者工具 → Network 标签 → 看 `/api/admin/codes` 的响应。401 说明 token 过期或环境变量错；500 说明 Redis 没连上。

### Q: 我可以同时在多个设备登录管理员吗？

可以，管理员密钥进入允许多端。

### Q: 一个邀请码能给几个人用？

由该码的 **`maxUsers`（上限）** 决定，1–10000 可调：
- 添加邀请码时可直接填上限（默认 1）。
- 后台表格「占用 / 上限」列实时显示「当前在线人数 / 上限」（如 `3 / 5`），右侧输入框 + 「设」按钮可随时改上限。
- 超过上限时，**新登录会顶掉最早一个 session**（FIFO）。「清空」按钮会把该码所有登录踢下线。

### Q: 想要 #admin 这个隐藏 URL 更不容易被猜到？

打开 `index.html`，搜索两处 `'#admin'`，改成 `'#mp-x9k7'` 之类的，提交到 GitHub，Vercel 自动重新部署。新地址收藏到自己浏览器即可。

### Q: 我能在后台看到每个邀请码的"占用"状态吗？

可以。后台表格里"占用"列显示"已登录"或"空闲"。如果某邀请码有人在用，"踢出"按钮会把对方踢下线，强制重新输码。

---

## 改完后的能力一览

| 能力 | 实现 |
|---|---|
| 邀请码登录 | ✅ JWT，30 天有效期 |
| 邀请码全网生效 | ✅ 服务端存储，你后台改了所有人立即生效 |
| 每码多人 + 可调上限 | ✅ `maxUsers` 1–10000，满员 FIFO 顶号；后台实时显示「占用/上限」 |
| 后台 URL 隐藏 | ✅ /#admin，公开页面无链接 |
| 管理员密钥可改 | ✅ 后台直接改，存 Redis |
| 防暴力破解 | ✅ 登录 / 管理员登录 Redis 限流 |
| 并发安全 | ✅ 邀请码读写加锁，多人同时登录不丢 session |
| 跨设备体验 | ✅ 任何用户在任何设备打开都一致 |

---

部署中遇到问题，把错误截图给我。
