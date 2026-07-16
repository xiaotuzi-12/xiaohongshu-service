/**
 * 🐰 小兔 · 小红书客服自动回复服务
 * 
 * 模式：Webhook 推送接收
 * 部署到 Railway 或其他云平台
 */

// ============================================================
// 全局未捕获异常处理（防止进程意外退出）
// ============================================================
process.on('uncaughtException', (err) => {
  console.error('📕 [FATAL] 未捕获异常:', err.message);
  console.error(err.stack);
});

process.on('unhandledRejection', (reason) => {
  console.error('📕 [FATAL] 未处理的 Promise 拒绝:', reason);
});

// ============================================================
// 依赖加载
// ============================================================
try {
  require('dotenv').config();
  console.log('📗 [OK] dotenv 加载完成');
} catch (e) {
  console.log('📘 [INFO] dotenv 未安装（线上环境正常）');
}

const express = require('express');
const crypto = require('crypto');
const axios = require('axios');

// ============================================================
// 配置区
// ============================================================
const CONFIG = {
  appId: process.env.XHS_APP_ID || '',
  appSecret: process.env.XHS_APP_SECRET || '',
  shopId: process.env.XHS_SHOP_ID || '',

  port: parseInt(process.env.PORT || '3000'),

  webhookPath: process.env.WEBHOOK_PATH || '/webhook',

  aiReply: process.env.AI_REPLY !== 'false',

  aiEndpoint: process.env.AI_ENDPOINT || 'https://api.deepseek.com/v1/chat/completions',
  aiApiKey: process.env.AI_API_KEY || '',
  aiModel: process.env.AI_MODEL || 'deepseek-chat',

  tokenUrl: process.env.XHS_TOKEN_URL || 'https://open-api.xiaohongshu.com/openapi/token',
  sendMsgUrl: process.env.XHS_SEND_MSG_URL || 'https://open-api.xiaohongshu.com/openapi/customer_service/send_msg',

  systemPrompt: process.env.AI_SYSTEM_PROMPT ||
    '你是一个专业、友好、耐心的小红书店铺客服助手。回答简洁亲切，语气温柔，使用中文回复。根据客户的提问给出有帮助的回应。',
};

// ============================================================
// 全局状态
// ============================================================
let accessToken = '';
let tokenExpiresAt = 0;
const app = express();

// ============================================================
// 日志工具
// ============================================================
function log(level, msg, data = null) {
  const time = new Date().toLocaleString('zh-CN', { hour12: false });
  const prefix = { info: '📗', warn: '📙', error: '📕', success: '📗', ai: '🤖', webhook: '🔔' }[level] || '📘';
  console.log(`${prefix} [${time}] ${msg}`);
  if (data) {
    const str = typeof data === 'string' ? data : JSON.stringify(data, null, 0).substring(0, 500);
    console.log(`   └─ ${str}`);
  }
}

// ============================================================
// 启动日志（输出环境信息）
// ============================================================
log('info', '🚀 小红书客服服务启动中...');
log('info', `📋 配置检查:`);
log('info', `   App ID: ${CONFIG.appId ? '✅ 已配置' : '❌ 未配置'}`);
log('info', `   App Secret: ${CONFIG.appSecret ? '✅ 已配置' : '❌ 未配置'}`);
log('info', `   Shop ID: ${CONFIG.shopId ? '✅ 已配置' : '❌ 未配置'}`);
log('info', `   AI Key: ${CONFIG.aiApiKey ? '✅ 已配置' : '⚠️ 未配置（使用默认回复）'}`);
log('info', `   Port: ${CONFIG.port}`);
log('info', `   Webhook Path: ${CONFIG.webhookPath}`);

// ============================================================
// 获取小红书 access_token
// ============================================================
async function refreshToken() {
  try {
    log('info', '🔄 正在获取小红书 access_token...');

    const params = new URLSearchParams();
    params.append('app_id', CONFIG.appId);
    params.append('app_secret', CONFIG.appSecret);
    params.append('grant_type', 'authorization_self');
    params.append('shop_id', CONFIG.shopId);

    const resp = await axios.post(CONFIG.tokenUrl, params, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 10000,
    });

    const data = resp.data;

    if (data.access_token) {
      accessToken = data.access_token;
      // 默认 2 小时过期，提前 10 分钟刷新
      tokenExpiresAt = Date.now() + (data.expires_in || 7200) * 1000 - 600000;
      log('success', `✅ access_token 获取成功，有效期 ${data.expires_in || 7200} 秒`);
      return true;
    }

    log('error', `❌ 获取 token 失败: ${JSON.stringify(data)}`);
    return false;
  } catch (err) {
    log('error', `❌ 获取 token 请求失败: ${err.message}`);
    return false;
  }
}

// ============================================================
// 签名验证
// ============================================================
function verifySignature(params) {
  const { timestamp, nonce, signature } = params;
  if (!timestamp || !nonce || !signature) {
    log('warn', '⚠️ 签名验证参数不完整');
    return false;
  }

  // 小红书常见签名方式：HMAC-SHA256(app_secret, timestamp + nonce)
  const signStr = timestamp + nonce;
  const expectedSig = crypto
    .createHmac('sha256', CONFIG.appSecret)
    .update(signStr)
    .digest('hex');

  if (expectedSig === signature) return true;

  // 备选：SHA256(timestamp + nonce + app_secret)
  const expectedSig2 = crypto
    .createHash('sha256')
    .update(timestamp + nonce + CONFIG.appSecret)
    .digest('hex');

  return expectedSig2 === signature;
}

// ============================================================
// 调用 AI 生成回复
// ============================================================
async function generateAIReply(customerMsg) {
  // 如果没有配置 AI Key，用默认回复
  if (!CONFIG.aiApiKey) {
    const replies = [
      '亲，感谢您的咨询！我已经收到您的问题，会尽快为您处理～',
      '您好呀！感谢您的耐心等待，您的问题我已经记录下来了，会尽快给您答复哦～',
      '亲亲您好～感谢您的留言，我会尽快帮您处理，请稍等哦！',
    ];
    return replies[Math.floor(Math.random() * replies.length)];
  }

  try {
    const resp = await axios.post(
      CONFIG.aiEndpoint,
      {
        model: CONFIG.aiModel,
        messages: [
          { role: 'system', content: CONFIG.systemPrompt },
          { role: 'user', content: `顾客发来消息：${customerMsg}\n\n请用亲切友好的语气回复顾客。` },
        ],
        max_tokens: 300,
        temperature: 0.7,
      },
      {
        headers: {
          'Authorization': `Bearer ${CONFIG.aiApiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 15000,
      }
    );

    const reply = resp.data.choices?.[0]?.message?.content;
    if (reply) return reply.trim();

    log('warn', '⚠️ AI 返回格式异常', resp.data);
    return '亲，感谢您的咨询！我会尽快为您处理～';
  } catch (err) {
    log('error', `❌ AI 调用失败: ${err.message}`);
    return '亲，感谢您的咨询！我会尽快为您处理～';
  }
}

// ============================================================
// 发送消息到小红书
// ============================================================
async function sendMessage(toUserId, content) {
  try {
    const resp = await axios.post(
      CONFIG.sendMsgUrl,
      {
        shop_id: CONFIG.shopId,
        to_user_id: toUserId,
        msg_type: 'text',
        content: JSON.stringify({ text: content }),
      },
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        timeout: 10000,
      }
    );

    log('success', `✅ 消息发送成功 → ${toUserId.substring(0, 8)}...`);
    return true;
  } catch (err) {
    log('error', `❌ 发送消息失败: ${err.message}`);
    // 如果 token 过期，尝试刷新后重试
    return false;
  }
}

// ============================================================
// 处理收到的消息
// ============================================================
async function processMessage(body) {
  log('info', '📨 开始处理消息...');

  // 确保 token 有效
  if (!accessToken || Date.now() >= tokenExpiresAt) {
    const ok = await refreshToken();
    if (!ok) {
      log('error', '❌ 无法获取 token，跳过本次消息处理');
      return;
    }
  }

  // 解析消息内容 - 小红书推送格式需要根据实际情况调整
  const msgContent = body?.content || body?.text || JSON.stringify(body);
  const fromUser = body?.from_user_id || body?.sender_id || body?.open_id || '';

  if (!fromUser) {
    log('warn', '⚠️ 未找到用户 ID，无法回复');
    return;
  }

  log('info', `💬 来自 ${fromUser.substring(0, 8)}... : ${msgContent.substring(0, 100)}`);

  // AI 生成回复
  log('ai', '🤖 AI 思考中...');
  const reply = await generateAIReply(msgContent);
  log('ai', `💡 AI 回复: ${reply.substring(0, 100)}`);

  // 发送回复
  await sendMessage(fromUser, reply);
}

// ============================================================
// Express 路由
// ============================================================

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/**
 * GET / 根路径 — 健康检查
 */
app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    name: '小红书客服自动回复服务',
    version: '1.0.0',
    time: new Date().toISOString(),
    config: {
      appId: CONFIG.appId ? '✅' : '❌',
      ai: CONFIG.aiApiKey ? '✅' : '⚠️',
      token: accessToken ? '✅' : '❌',
    },
  });
});

/**
 * GET /webhook — URL 验证
 */
app.get(CONFIG.webhookPath, (req, res) => {
  const { echostr, timestamp, nonce, signature } = req.query;
  log('webhook', `📥 URL 验证请求`, { timestamp, nonce });

  if (echostr) {
    log('success', '✅ 返回 echostr');
    return res.status(200).send(echostr);
  }

  res.status(400).send('missing echostr');
});

/**
 * POST /webhook — 接收消息推送
 */
app.post(CONFIG.webhookPath, async (req, res) => {
  log('webhook', '📩 收到消息推送');
  res.status(200).json({ code: 0, message: 'ok' });

  processMessage(req.body).catch(err => {
    log('error', `❌ 处理消息异常: ${err.message}`);
  });
});

/**
 * GET /health — 详细健康检查
 */
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    time: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    config: {
      appId: CONFIG.appId ? '✅ 已配置' : '❌ 未配置',
      appSecret: CONFIG.appSecret ? '✅ 已配置' : '❌ 未配置',
      shopId: CONFIG.shopId ? '✅ 已配置' : '❌ 未配置',
      ai: CONFIG.aiApiKey ? '✅ 已配置' : '⚠️ 未配置（使用默认回复）',
      token: accessToken ? '✅ 已获取' : '❌ 未获取',
      aiReply: CONFIG.aiReply ? '✅ 已开启' : '❌ 已关闭',
    },
  });
});

// ============================================================
// 启动服务
// ============================================================
function startServer() {
  try {
    app.listen(CONFIG.port, '0.0.0.0', () => {
      log('success', `🎉 服务启动成功！`);
      log('success', `   🌍 端口: ${CONFIG.port}`);
      log('success', `   🔗 Webhook: http://localhost:${CONFIG.port}${CONFIG.webhookPath}`);
      log('success', `   ❤️  健康检查: http://localhost:${CONFIG.port}/health`);
    });
  } catch (err) {
    log('error', `❌ 服务启动失败: ${err.message}`);
    process.exit(1);
  }
}

startServer();
