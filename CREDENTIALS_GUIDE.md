# Polymarket CLOB 凭证指南

## 什么是 CLOB 凭证？

CLOB（中央限价订单簿）凭证是允许您执行以下操作的 API 密钥：
- 在 Polymarket 上下单
- 取消订单
- 查看您的未结订单
- 访问需要身份验证的端点

## 如何生成凭证

### 方法 1：使用自动化脚本（推荐）

1. **将您的私钥添加到 `.env`**：
   ```bash
   PRIVATE_KEY=0xYourPrivateKeyHere
   ```

2. **运行凭证生成器**：
   ```bash
   npm run gen-creds
   ```

3. **您的凭证将显示并保存到 `.credentials.json`**

### 方法 2：手动生成

如果您更喜欢手动生成凭证：

```typescript
import { ClobClient } from '@polymarket/clob-client';
import { Wallet } from '@ethersproject/wallet';

const wallet = new Wallet('0xYourPrivateKey');
const client = new ClobClient('https://clob.polymarket.com', 137, wallet);

// 生成凭证（使用您的钱包签名一条消息）
const creds = await client.createOrDeriveApiKey();

console.log('API Key:', creds.apiKey);
console.log('Secret:', creds.secret);
console.log('Passphrase:', creds.passphrase);

// 使用凭证进行身份验证的请求
client.setApiCreds(creds);
```

## 如何获取您的私钥

### MetaMask
1. 点击您的账户
2. 选择"账户详情"
3. 点击"导出私钥"
4. 输入您的密码
5. 复制私钥（以 `0x` 开头）

### Magic/Email 钱包（Polymarket）
1. 访问 https://reveal.magic.link/polymarket
2. 输入您的电子邮件
3. 按照身份验证步骤操作
4. 复制显示的私钥

### 硬件钱包
- 硬件钱包（Ledger、Trezor）无法导出私钥
- 请使用浏览器钱包连接而非此机器人

## 理解凭证

### API Key（API 密钥）
- 您的 API 访问的公共标识符
- 可以安全地与 Polymarket API 共享
- 示例：`7c8f3e2a-1b4d-4e9f-a3c2-9d7e6f5a4b3c`

### Secret（密钥）
- 用于签名 API 请求
- **切勿分享**
- 与 API 密钥一起用于身份验证

### Passphrase（密码短语）
- 额外的安全层
- **切勿分享**
- 所有身份验证请求都需要

## 重要安全注意事项

⚠️ **关键安全警告：**

1. **切勿将凭证提交到 Git**
   - `.env` 和 `.credentials.json` 文件已在 `.gitignore` 中
   - 切勿公开分享这些文件

2. **保护好您的私钥**
   - 任何拥有您私钥的人都可以控制您的钱包
   - 切勿在公共频道或不安全的应用程序中粘贴它

3. **凭证是确定性的**
   - 相同的私钥总是生成相同的凭证
   - 您可以随时安全地重新生成它们

4. **首先使用小额进行测试**
   - 在交易大额之前，先用小额交易测试
   - 验证一切按预期工作

## 在代码中使用凭证

### 选项 1：自动凭证生成（此机器人使用）

```typescript
const client = new ClobClient(host, chainId, wallet);
const creds = await client.createOrDeriveApiKey();
client.setApiCreds(creds);

// 现在您可以进行身份验证的请求
await client.getOpenOrders();
```

### 选项 2：使用保存的凭证

```typescript
import { ApiKeyCreds } from '@polymarket/clob-client';

const creds: ApiKeyCreds = {
    apiKey: process.env.CLOB_API_KEY!,
    secret: process.env.CLOB_SECRET!,
    passphrase: process.env.CLOB_PASS_PHRASE!
};

const client = new ClobClient(host, chainId, wallet, creds);

// 客户端现在已通过身份验证
```

## 凭证生命周期

### 创建新凭证
```typescript
const creds = await client.createApiKey();
```

### 派生现有凭证
```typescript
const creds = await client.deriveApiKey();
```

### 创建或派生（推荐）
```typescript
// 如果存在则派生，如果是新的则创建
const creds = await client.createOrDeriveApiKey();
```

### 查看您的 API 密钥
```typescript
const apiKeys = await client.getApiKeys();
console.log(apiKeys);
```

### 删除 API 密钥
```typescript
await client.deleteApiKey();
```

## 故障排除

### "未提供私钥"
- 确保您的 `.env` 文件包含 `PRIVATE_KEY=0x...`
- 确保私钥以 `0x` 开头
- 检查 `.env` 文件是否在项目根目录中

### "生成凭证失败"
- 检查您的互联网连接
- 验证私钥是否正确（`0x` 后面有 64 个十六进制字符）
- 确保您在 Polygon 主网上（chainId: 137）

### "身份验证失败"
- 使用 `npm run gen-creds` 重新生成凭证
- 确保您使用的是该钱包的正确凭证
- 检查凭证是否未在服务器上被删除

## 测试您的凭证

生成凭证后，您可以测试它们：

```bash
# 运行主机器人（将自动使用凭证）
npm run dev

# 检查特定功能
npm run allowance  # 检查 USDC 授权额度
npm run market     # 查找当前市场
```

## 高级：签名类型

创建 CLOB 客户端时，您可以指定签名类型：

```typescript
const signatureType = 0; // 0: EOA (MetaMask, 硬件), 1: Magic/Email, 2: 代理

const client = new ClobClient(
    host,
    chainId,
    wallet,
    creds,
    signatureType,
    funderAddress  // 可选：用于代理钱包
);
```

- **类型 0**：标准钱包（MetaMask、私钥、硬件）
- **类型 1**：电子邮件/Magic 钱包
- **类型 2**：代理/智能合约钱包

## 相关文件

- `src/generate_credentials.ts` - 凭证生成脚本
- `src/_gen_credential.ts` - 凭证管理器类
- `.env.example` - 环境变量示例
- `.credentials.json` - 生成的凭证（自动创建，git 忽略）

## 有问题？

- [Polymarket 文档](https://docs.polymarket.com)
- [CLOB API 文档](https://docs.polymarket.com/#clob-api)
- [GitHub 问题](https://github.com/Polymarket/clob-client)

