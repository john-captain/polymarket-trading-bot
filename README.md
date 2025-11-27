# Polymarket TypeScript 交易机器人

一个专业的基于 TypeScript 的 Polymarket 交易机器人，具有完整的凭证管理、订单执行、市场分析和**自动化套利交易**功能。

## 功能特性

- 🔐 **凭证管理**：安全的私钥处理和 API 身份验证
- 💰 **授权额度控制**：管理用于交易的 USDC 代币授权额度
- 📊 **市场分析**：实时买卖价差和价格数据
- 🎯 **订单执行**：下市价单和限价单
- 🔍 **市场发现**：自动检测当前比特币市场
- 📈 **价格跟踪**：从订单簿获取实时价格更新
- 🤖 **自动交易机器人**：带风险管理的自动化套利交易
![Screenshot](./run.png)

![Screenshot](./tx.png)
## 两种操作模式

### 1. 手动交易（交互式 CLI）
使用交互式菜单手动下单、查看价格和管理您的账户。

### 2. 自动化交易机器人
全自动机器人：
- 监控软件预言机与市场之间的价格差异
- 在检测到盈利机会时执行交易
- 自动设置止盈和止损订单
- 使用可配置参数管理风险

## 安装

```bash
# 安装依赖
npm install

# 创建 .env 文件
# 编辑您的私钥和配置
```

## 配置

编辑 `.env` 文件：

```env
PRIVATE_KEY=your_private_key_here
CLOB_API_URL=https://clob.polymarket.com
POLYGON_CHAIN_ID=137

# 自动交易参数
SOFTWARE_WS_URL=ws://45.130.166.119:5001
PRICE_DIFFERENCE_THRESHOLD=0.015
STOP_LOSS_AMOUNT=0.005
TAKE_PROFIT_AMOUNT=0.01
DEFAULT_TRADE_AMOUNT=5.0
TRADE_COOLDOWN=30
```

## 使用方法

### 生成 CLOB 凭证（首次设置）

```bash
npm run gen-creds
```

### 运行自动交易机器人

```bash
npm run auto-trade
```

这将启动全自动套利交易机器人。查看 `PROFIT_STRATEGY.md` 了解交易逻辑的详细解释。

### 运行手动交互式机器人

```bash
npm run dev
```

### 单独脚本

```bash
# 检查凭证
npm run credentials

# 检查钱包余额
npm run check-balance

# 检查授权额度
npm run allowance

# 查找当前比特币市场
npm run market

# 获取买卖价格（需要Token ID 作为参数）
npm run bid-ask <token_id>

# 下单（交互式）
npm run order
```

### 生产环境构建

```bash
# 编译 TypeScript
npm run build

# 运行编译后的版本
npm start
```

## 项目结构

```
polymarket-ts-bot/
├── src/
│   ├── main.ts                  # 交互式 CLI 交易界面
│   ├── auto_trading_bot.ts      # 自动化套利机器人
│   ├── _gen_credential.ts       # 凭证管理
│   ├── allowance.ts             # 代币授权额度管理
│   ├── bid_asker.ts             # 买卖价格获取
│   ├── market_order.ts          # 订单执行
│   ├── market_finder.ts         # 市场发现
│   └── generate_credentials.ts  # 凭证生成工具
├── .env                         # 环境变量（私有）
├── .credentials.json            # 生成的 API 凭证
├── package.json                 # 依赖和脚本
├── PROFIT_STRATEGY.md          # 详细交易策略指南
└── CREDENTIALS_GUIDE.md        # 如何生成凭证
```

## 自动交易机器人逻辑

自动化机器人实现价格套利策略：

1. **价格监控**：比较软件预言机价格与 Polymarket 市场价格
2. **机会检测**：当价格差异超过阈值时触发交易
3. **三单执行**：
   - 市价买入：以当前价格购买代币
   - 限价止盈卖出：当价格上涨时卖出
   - 限价止损卖出：当价格下跌时卖出
4. **风险管理**：可配置的止损和止盈水平

**阅读 `PROFIT_STRATEGY.md` 了解机器人如何盈利的完整解释。**

## 交易策略概览

### 工作原理

```
软件预言机计算上涨代币价值：$0.75
市场以 $0.70 出售上涨代币
差额：$0.05（高于 $0.015 阈值）

机器人执行：
1. 买入 @ $0.70（市价单）
2. 卖出 @ $0.71（止盈 +$0.01）
3. 卖出 @ $0.695（止损 -$0.005）

预期结果：
- 70% 概率：止盈成交 → +$0.01 利润
- 30% 概率：止损成交 → -$0.005 损失
- 净期望：正值
```

### 配置参数

| 参数 | 默认值 | 描述 |
|------|--------|------|
| PRICE_DIFFERENCE_THRESHOLD | 0.015 | 触发交易的最小价格差异 |
| TAKE_PROFIT_AMOUNT | 0.01 | 高于买入价的利润目标 |
| STOP_LOSS_AMOUNT | 0.005 | 低于买入价的最大损失 |
| DEFAULT_TRADE_AMOUNT | 5.0 | 每笔交易的 USDC 金额 |
| TRADE_COOLDOWN | 30 | 交易之间的秒数 |

## 模块

### 1. 凭证生成器（`_gen_credential.ts`）

管理钱包凭证和 API 身份验证。

```typescript
import { CredentialGenerator } from './_gen_credential';

const generator = new CredentialGenerator();
generator.displayInfo();
```

### 2. 授权额度管理器（`allowance.ts`）

控制用于交易的 USDC 代币授权额度。

```typescript
import { AllowanceManager } from './allowance';

const manager = new AllowanceManager();
await manager.checkAllowance();
await manager.setAllowance('1000'); // 设置 1000 USDC 授权额度
```

### 3. 买卖价格获取器（`bid_asker.ts`）

获取实时订单簿数据。

```typescript
import { BidAsker } from './bid_asker';

const bidAsker = new BidAsker();
const data = await bidAsker.getPriceData(tokenId);
console.log(data.bidAsk.midpoint);
```

### 4. 市价单执行器（`market_order.ts`）

下单和管理订单。

```typescript
import { MarketOrderExecutor } from './market_order';

const executor = new MarketOrderExecutor();
await executor.placeMarketOrder({
    tokenId: 'TOKEN_ID',
    side: 'BUY',
    amount: 10 // 10 USDC
});
```

### 5. 市场查找器（`market_finder.ts`）

自动检测和搜索市场。

```typescript
import { MarketFinder } from './market_finder';

const finder = new MarketFinder();
const market = await finder.findCurrentBitcoinMarket();
console.log(market.tokens); // 上涨和下跌代币
```

## 安全功能

- ✅ 下单前的确认提示
- ✅ 价格验证和合理性检查
- ✅ 自动市场价格缓冲
- ✅ 私钥从不在日志中暴露
- ✅ 错误处理和恢复

## 开发

```bash
start-bot.ps1

```bash
# 监视模式（自动重载）
npm run dev

# 类型检查
npx tsc --noEmit

# 代码检查
npx eslint src/
```

## 安全注意事项

⚠️ **重要：**
- 切勿提交您的 `.env` 文件
- 保护好您的私钥
- 首先使用小额测试
- 在确认前审查所有交易

## 依赖

- `@polymarket/clob-client` - 官方 Polymarket CLOB 客户端
- `ethers` - 以太坊钱包和加密
- `axios` - HTTP 请求
- `dotenv` - 环境变量管理
- `typescript` - 类型安全和现代 JavaScript

## 许可证

ISC

## 支持

如有问题或疑问，请参考：
- [Polymarket 文档](https://docs.polymarket.com)
- [CLOB API 文档](https://docs.polymarket.com/#clob-api)

---

**免责声明**：使用风险自负。本软件按原样提供，不提供任何保证。始终先用小额测试。
