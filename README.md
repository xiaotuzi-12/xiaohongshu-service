# 🐰 小兔 · 小红书客服自动回复

自动接收小红书客服消息 → AI 智能回复 → 自动发送

## 🚂 部署到 Railway（免费）

### 第一步：把代码推到 GitHub

```bash
# 1. 在 GitHub 新建一个仓库（设为 Private）
# 2. 在终端执行：
cd xiaohongshu-service
git init
git add .
git commit -m "first commit"
git remote add origin https://github.com/你的用户名/你的仓库名.git
git push -u origin main
```

### 第二步：在 Railway 部署

1. 打开 [Railway.app](https://railway.app) → 用 GitHub 登录
2. 点击 **New Project** → **Deploy from GitHub repo**
3. 选择刚才推送的仓库
4. **关键：配置环境变量**
   - 点击项目 → **Variables** 选项卡
   - 添加以下变量（不要直接在代码里写死）：

| 变量名 | 值 |
|--------|-----|
| `XHS_APP_ID` | `90ec83e8bccd4c5e8ac0` |
| `XHS_APP_SECRET` | `292846d4716c97f2d926d5c9b94d8d3` |
| `XHS_SHOP_ID` | `699ff6f1d475330015fdffdc` |
| `AI_API_KEY` | 你的 DeepSeek / 其他AI的 Key |

5. Railway 会自动检测 Node.js、安装依赖、启动服务
6. 部署完成后，点击 **Settings** → **Domains** → 生成一个 `xxx.railway.app` 的域名

### 第三步：配置小红书开放平台

1. 回到 [小红书开放平台](https://open.xiaohongshu.com)
2. 进入你的应用 → **消息推送配置**
3. **回调 URL** 填：`https://你的域名.railway.app/webhook`
4. 提交验证 → 通过 ✅

### 第四步：测试

给你的店铺发一条私信 → 等几秒 → 收到自动回复！

## 📝 注意事项

- Railway 免费版闲置约30分钟后会休眠，但客户发消息会**自动唤醒**（延迟几秒）
- 如果不想休眠，最低 $5/月 即可永不休眠
- 建议先去 [DeepSeek](https://platform.deepseek.com/) 注册拿 API Key（免费送500万token）
- 也可以换成通义千问、ChatGPT 等任何 OpenAI 兼容接口
