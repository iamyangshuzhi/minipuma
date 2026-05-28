# Minipuma 后端部署清单

## 文件清单（需要上传到 GitHub 仓库根目录）

```
仓库根/
├── index.html                # 前端单页应用（已对接 API）
├── package.json              # 声明 @vercel/kv 依赖
└── api/
    ├── _lib/
    │   └── auth.js           # JWT + KV 公共工具
    ├── login.js              # POST  邀请码登录
    ├── logout.js             # POST  退出登录
    ├── me.js                 # GET   验证当前会话(心跳)
    └── admin/
        ├── login.js          # POST  管理员密钥登录
        ├── codes.js          # GET/POST 列表/新增邀请码
        ├── code.js           # PATCH/DELETE 单码改禁/踢出/删除
        └── key.js            # PATCH 修改管理员密钥
```

## 部署 5 步

### 1. 把以上文件上传到你的 GitHub 仓库

- 打开你的 `minipuma` 仓库
- 删掉旧的 `index.html`，把这些**新文件**全部上传（保持上面的目录结构）
- 提交（Commit changes）

Vercel 会自动检测到 push，开始构建并部署。**先让它跑完一次**——会失败（因为 KV 还没配），不要紧，下一步搞定。

### 2. 在 Vercel 项目里开 KV 数据库

1. Vercel → 你的 `minipuma` 项目 → 顶部 **Storage** 标签
2. **Create Database** → 选 **KV (Key-Value)**
3. 名字随便（如 `minipuma-kv`），地域选离你近的（**Singapore** / **HKG** / **Tokyo** 都可以）
4. Create
5. 创建完成后，Vercel 会问你"连接到哪个项目"→ 选 `minipuma` 项目 → Connect
6. **它会自动把 KV 的环境变量注入到你的项目**（KV_REST_API_URL、KV_REST_API_TOKEN 等），无需手动配

### 3. 设置两个关键环境变量

Vercel → 项目 → **Settings → Environment Variables** → 添加两条：

| Name | Value | 说明 |
|---|---|---|
| `SESSION_SECRET` | **任意复杂字符串**（建议 32 位以上随机串） | JWT 签名密钥，绝密 |
| `ADMIN_INIT_KEY` | **管理员初始密钥**（建议 12 位以上） | 第一次登录管理员后台用这个 |

随机字符串示例：可以在终端跑 `openssl rand -hex 32`，或者用 https://www.random.org/strings/。

### 4. 触发重新部署

Vercel → 项目 → **Deployments** → 找到最新一次 → 右侧三点菜单 → **Redeploy**

等几十秒，状态变绿 **Ready**。

### 5. 验证

- 打开 **https://minipuma.xyz** → 应该看到登录页（无"管理员入口"链接）
- 输入 `MINI-DEMO` → 应该能进
- 在浏览器地址栏改成 **https://minipuma.xyz/#admin** → 进入管理员登录
- 输入你刚才设的 `ADMIN_INIT_KEY` → 进入后台
- **立刻**：
  - 用"更新密钥"改个新的密钥（不要再用 ADMIN_INIT_KEY 那个）
  - 添加你要发出去的真实邀请码（如 `VIP-001` 备注"张三"等）
  - **停用** `MINI-DEMO`（或者删掉）

---

## 关于本地开发 / 测试

如果你想在自己电脑上跑后端测试（一般不需要）：

```bash
npm i -g vercel
cd 仓库目录
vercel dev    # 启动本地 dev server，会模拟 KV
```

## 安全须知

- **`ADMIN_INIT_KEY` 只是初次启动用**，登录后立即在后台改一个新的（新的会存到 KV 里，环境变量里的不再生效）
- **`SESSION_SECRET` 千万不能泄露**——它泄露相当于伪造任意用户/管理员登录都不被发现
- 改 `SESSION_SECRET` 会让所有现有登录失效（所有人需要重新输邀请码）
- KV 数据可以在 Vercel KV 控制台直接 Browse 查看/编辑（应急时手动改邀请码也行）

## 关于 https://minipuma.xyz/#admin

- 这个 URL **不会**在任何公开页面出现链接，只有知道的人才能访问
- 建议把它**收藏到自己的浏览器书签**
- 如果担心 URL 被猜到，可以以后改成更隐蔽的（比如改代码里 `'#admin'` 为 `'#mp-x9k7'` 之类），重新部署即可

## KV 用量

Vercel KV 免费档：
- 30,000 commands / 月（足够小规模用）
- 每次有人访问页面时会触发 1 个 KV 读（/api/me 心跳）
- 每 30 秒触发 1 次 /api/me，所以一个在线用户每小时约 120 个读
- 几十个用户日活完全免费够用

如果将来用量变大，KV 付费档也便宜（$0.20 / 100k commands）。

---

## 出问题怎么排查

- **登录失败**：F12 打开开发者工具 → Network 标签 → 看 `/api/login` 的响应。如果 500 错误，去 Vercel 项目 → Functions 标签看日志。
- **管理员后台显示"加载中"不动**：可能是 KV 没接好，去 Storage 标签确认 KV 已连接到该项目，并重新 Redeploy。
- **环境变量改了不生效**：必须 Redeploy（环境变量只在新部署生效）。
