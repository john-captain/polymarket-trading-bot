# 我在运行 Polymarket TypeScript 交易机器人上遇到的小问题

## 问题 1: USDC 余额显示为 $0.00，但钱包里明明有 10 USDC

### 问题描述
运行 `npm run check-balance` 或 `npm run dev` 后显示余额检查：
```
USDC: $0.00
MATIC: 36.5067 ($18.25 @ $0.50)

❌ USDC 不足: $0.00 (至少需要 $5.00)
```

但实际上钱包里有 10+ USDC。

### 原因分析
Polygon 网络上有**两种不同的 USDC 代币**：

1. **Bridged USDC (USDC.e)** - 合约地址: `0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174`
   - 旧版本，通过桥接从以太坊转移过来
   - **Polymarket 只接受这个版本的 USDC**
   - 代码默认检查的就是这个地址

2. **Native USDC** - 合约地址: `0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359`
   - Circle 官方在 Polygon 上发行的原生版本
   - 较新，但 Polymarket 暂时不支持

如果你的 USDC 是 Native USDC，机器人会显示余额为 $0.00，因为它只检查 Bridged USDC。

### 如何检查你有哪种 USDC

使用以下命令检查两种 USDC 的余额：

```bash
node -e "
const { ethers } = require('ethers');
const provider = new ethers.providers.JsonRpcProvider('https://polygon-rpc.com');
const USDC_BRIDGED = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174';
const USDC_NATIVE = '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359';
const address = '你的钱包地址';
const abi = ['function balanceOf(address) view returns (uint256)'];

Promise.all([
  new ethers.Contract(USDC_BRIDGED, abi, provider).balanceOf(address),
  new ethers.Contract(USDC_NATIVE, abi, provider).balanceOf(address)
]).then(([bridged, native]) => {
  console.log('Bridged USDC (Polymarket用):', ethers.utils.formatUnits(bridged, 6));
  console.log('Native USDC:', ethers.utils.formatUnits(native, 6));
});
"
```

### 解决方案

**方案 1: 在 DEX 上将 Native USDC 兑换成 Bridged USDC（推荐）**

1. 访问 Uniswap: https://app.uniswap.org
2. 连接钱包并切换到 **Polygon 网络**
3. 设置兑换：
   - From: USDC (Native) - `0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359`
   - To: USDC.e (Bridged) - `0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174`
   - Amount: 你要兑换的数量
4. 确认交易（费率通常 1:1，Gas 费约 0.001-0.01 MATIC）

**其他可用 DEX：**
- QuickSwap: https://quickswap.exchange
- 1inch: https://app.1inch.io

**方案 2: 直接购买/桥接 Bridged USDC**

如果你还没有 USDC，可以：
- 从交易所提现 USDC 到 Polygon 网络（确认是 USDC.e）
- 使用桥接工具从以太坊桥接 USDC 到 Polygon

### 验证兑换成功

兑换完成后，再次运行：
```bash
npm run check-balance
```

应该显示：
```
✅ USDC: $10.96
✅ MATIC: 36.5067
✅ 准备就绪，可以交易！
```

### 代码说明

`src/balance_checker.ts` 中的 USDC 地址配置是**正确的**，不需要修改：
```typescript
const USDC_ADDRESS = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174'; // Bridged USDC
```

这是因为 Polymarket 平台只支持 Bridged USDC 进行交易。

---

## 问题 2: 最小支持多大的订单
Polymarket 的最小订单金额是 $5 USDC，原因如下：
Gas 成本：Polygon 上的交易虽然便宜，但每笔仍需 Gas 费（~$0.001-0.01）
订单簿效率：太多小订单会让订单簿变得臃肿
市场流动性：小额订单对价格发现贡献有限
防止垃圾订单：避免恶意刷单


### 💡 建议的测试方案

```
# 1. 确保有至少 $5 Bridged USDC + 0.1 MATIC
npm run check-balance

# 2. 查看当前市场和价格
npm run market

# 3. 使用交互式界面下一单 $5 的限价单
npm run dev
# 选择 "8. 下限价单"
# 设置一个不太可能成交的价格（如 UP 代币买入价 $0.10）
# 观察订单是否成功提交
# 然后取消订单（选择 "10. 取消订单"）

# 4. 这样你就测试了整个流程，但钱不会真的花出去
```

