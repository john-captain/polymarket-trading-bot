# Polymarket 交易机器人 AI 代理指令

## 项目概述

这是一个用 TypeScript 编写的 **Polymarket 预测市场自动化套利交易机器人**。该机器人利用软件预言机（实时比特币价格数据）与 Polymarket 订单簿之间的价格差异，通过自动化风险管理执行盈利交易。

**核心策略**：当软件预言机价格 > 市场价格达到阈值时（默认 $0.015）买入被低估的代币，然后设置止盈（+$0.01）和止损（-$0.005）订单。

## 架构与数据流

### 1. 双重操作模式

**手动模式** (`src/main.ts`)：用于手动交易的交互式 CLI
- 菜单驱动界面，用于凭证、余额、市场发现、订单下达
- 使用 `readline` 进行用户提示
- 安全模式：执行交易前需要确认

**自动化模式** (`src/auto_trading_bot.ts`)：自主套利机器人
- **双 WebSocket 架构**：
  - 软件预言机 WS (`ws://45.130.166.119:5001`)：流式传输 `prob_up`/`prob_down`（0-100 刻度）
  - Polymarket CLOB WS (`wss://ws-subscriptions-clob.polymarket.com/ws/market`)：订单簿更新
- **交易执行流程**：
  1. 检测机会（软件价格 - 市场价格 ≥ 阈值）
  2. 执行 3 个同步订单：市价买单、限价止盈卖单、限价止损卖单
  3. 进入冷却期（默认 30 秒）
- **自动重连**：WebSocket 断开时自动重连（5 秒重试）

### 2. 关键组件与职责

**余额管理** (`balance_checker.ts`)：
- 通过 Polygon RPC 检查 USDC (0x2791Bca...4174) 和 MATIC 余额
- **关键**：机器人启动前验证资金充足（防止交易失败）
- 使用 ethers.js `Contract.balanceOf()` 查询 ERC20，`provider.getBalance()` 查询原生 MATIC

**市场发现** (`market_finder.ts`)：
- 自动生成比特币小时市场 slug：`bitcoin-up-or-down-{月份}-{日期}-{时间}-et`
- 如果基于 slug 的查找失败，则回退到搜索活跃市场
- 从 Gamma API 响应解析代币 ID（处理多种响应格式）

**订单执行** (`market_order.ts`)：
- 为市价单添加 1% 价格缓冲（买单 `buyPrice * 1.01`，卖单 `* 0.99`）
- 使用 `@polymarket/clob-client` 的 `createAndPostOrder()`，订单类型为 `OrderType.GTC`（Good-Till-Cancel）
- 最小价格单位固定为 `0.001`

**凭证** (`_gen_credential.ts`, `generate_credentials.ts`)：
- 使用钱包签名派生确定性 API 密钥（同一钱包 → 同一凭证）
- 存储在 `.credentials.json`（已加入 .gitignore）

### 3. 关键集成点

**Polygon 网络（链 ID 137）**：
- RPC：`https://polygon-rpc.com`
- USDC 合约：`0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174`（6 位小数）
- Gas 代币：MATIC（交易需要 0.05+ MATIC）

**Polymarket CLOB API**：
- 基础 URL：`https://clob.polymarket.com`
- 通过 `@polymarket/clob-client` 使用钱包派生的凭证进行身份验证
- 关键方法：`createAndPostOrder()`、`getOrderBook()`、`cancelOrder()`

**Gamma API**（只读市场数据）：
- 基础 URL：`https://gamma-api.polymarket.com`
- 用于市场发现，无需身份验证
- 返回市场 slug、代币 ID、结果

## 开发工作流

### 运行机器人

```bash
# 手动交互模式（中文界面）
npm run dev

# 自动化交易（生产环境 - 使用真实资金）
npm run auto-trade
# 或使用 PowerShell 包装器：
.\start-bot.ps1

# 余额检查（启动前验证）
npm run check-balance
```

### 首次设置流程

1. 将 `PRIVATE_KEY=0x...` 添加到 `.env`
2. 运行 `npm run gen-creds` 创建 API 凭证
3. 为钱包充值：Polygon 上的 USDC + MATIC
4. 运行 `npm run check-balance` 验证（机器人启动时自动检查）
5. 先用小额测试（$5-10）

### 调试

**WebSocket 连接问题**：
- 检查控制台是否有 "✅ ... WebSocket 已连接" 消息
- 如果价格卡在 $0.0000 → WebSocket 未接收数据
- 机器人每 5 秒自动重连，但防火墙可能阻止连接

**交易执行失败**：
- 阅读中文错误消息（所有用户界面文本都已本地化）
- 常见：「余额不足」、「未找到市场」
- 检查 `.env` 参数（特别是 `DEFAULT_TRADE_AMOUNT` 与实际 USDC 余额）

**余额检查失败**：
- Polygon RPC 可能有速率限制 → 重试或使用自定义 RPC_URL
- USDC 余额查询对 6 位小数代币使用 `formatUnits(balance, 6)`

## 项目特定约定

### 1. 中文本地化

**所有用户界面文本都使用中文**（控制台日志、错误、提示）：
```typescript
// 正确：
console.log('✅ 机器人启动成功！');
throw new Error('余额不足');

// 错误：
console.log('✅ Bot started successfully!');
```

代码注释和内部逻辑可以使用英文，但打印到控制台的任何内容都必须是中文。

### 2. 价格处理

**显示时始终使用 4 位小数精度**：
```typescript
console.log(`价格: $${price.toFixed(4)}`); // $0.7300
```

**软件预言机价格是 0-100 刻度**，需除以 100：
```typescript
this.softwarePrices.UP = message.prob_up / 100.0; // 75 → 0.75
```

### 3. 代币 ID 格式

代币 ID 是**长数字字符串**（不是十六进制地址）：
```typescript
// 正确：
tokenId: "74767151816109143033985302396646508973461696862933513382243898574910115069108"

// 错误：
tokenId: "0x..." // 这是钱包地址，不是代币 ID
```

### 4. 错误处理模式

**永远不要在日志中暴露私钥**：
```typescript
// 正确：
console.log(`私钥: ${'*'.repeat(60)} (已隐藏)`);

// 错误：
console.log(`Private Key: ${privateKey}`); // 安全违规
```

**缺少凭证时的优雅降级**：
```typescript
if (!this.hasPrivateKey) {
    console.log('⚠️  未找到私钥 - 以只读模式运行');
    // 继续有限功能
}
```

### 5. 环境变量默认值

所有 `.env` 参数都有合理的默认值（参见 `auto_trading_bot.ts` 构造函数）：
```typescript
this.priceThreshold = parseFloat(process.env.PRICE_DIFFERENCE_THRESHOLD || '0.015');
this.tradeAmount = parseFloat(process.env.DEFAULT_TRADE_AMOUNT || '5.0');
```

不要假设环境变量存在 — 始终提供回退值。

## 关键依赖

- `@polymarket/clob-client@^4.22.8` - Polymarket 官方 API 客户端（未经测试不要升级）
- `ethers@^5.7.2` - 版本 5.x（v6 有破坏性更改）
- `ws@^8.18.3` - 用于实时价格推送的 WebSocket 客户端
- `@ethersproject/*` - ethers.js 的对等依赖

## 测试与安全

**关键**：此机器人在 Polygon 主网上使用真实资金进行交易。

**交易前安全检查**（在 `auto_trading_bot.ts` 中强制执行）：
1. 余额验证（USDC ≥ 交易金额，MATIC ≥ 0.05）
2. 市场可用性检查
3. WebSocket 连接确认
4. 交易之间的冷却时间强制执行

**默认安全值**：
- 交易金额：$5（不会让小钱包破产）
- 止损：-$0.005（限制 $5 交易的下行风险为 0.07%）
- 冷却时间：30 秒（防止过度交易）

## 文档结构

- `README.md` - 用户指南（中文）
- `README_REAL.md` - 残酷诚实的指南，带有现实预期
- `PROFIT_STRATEGY.md` - 套利逻辑深入探讨（444 行）
- `CREDENTIALS_GUIDE.md` - API 密钥生成演练
- `QUICK_START.md` - 5 分钟设置指南
- `BALANCE_CHECK.md` - 余额验证功能文档

## 常见陷阱

1. **忘记余额检查**：机器人现在自动检查，但 `main.ts` 中的手动交易不会
2. **错误的网络**：必须使用 Polygon (137)，不是以太坊主网
3. **USDC vs USDC.e**：使用桥接 USDC (0x2791Bca...)，不是原生 USDC.e
4. **市场时机**：比特币市场是每小时的 — 如果在市场时段之间运行，机器人可能失败
5. **Gas 估算**：每笔交易花费约 0.001-0.01 MATIC（约 $0.0005-0.005），相应预算

## 理解的关键文件

1. `src/auto_trading_bot.ts`（504 行）- 核心自主交易引擎
2. `PROFIT_STRATEGY.md` - 解释交易参数背后的「为什么」
3. `.env` - 所有可配置参数（阈值、金额、冷却时间）
4. `src/balance_checker.ts` - 关键的启动前验证逻辑

---

**修改此代码库时**：先用小额测试，验证余额检查是否工作，确保所有用户界面文本都保持中文本地化。
