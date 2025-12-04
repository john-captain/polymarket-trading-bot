# 市面上可用的预言机服务

## 概述

为 Polymarket 交易机器人寻找替代预言机，需要提供**实时比特币价格**和**概率计算**的服务。

---

## 🏆 推荐方案

### 1. Binance WebSocket API（免费 + 实时）⭐⭐⭐⭐⭐

**优点**：
- ✅ 完全免费
- ✅ 实时价格推送
- ✅ 超低延迟（< 100ms）
- ✅ 高可靠性（99.9%+ 正常运行时间）
- ✅ 无需认证
- ✅ 官方文档完善

**WebSocket URL**：
```
wss://stream.binance.com:9443/ws/btcusdt@ticker
```

**返回数据示例**：
```json
{
  "e": "24hrTicker",
  "s": "BTCUSDT",
  "c": "98567.00",  // 当前价格
  "o": "98000.00",  // 开盘价
  "h": "99000.00",  // 最高价
  "l": "97500.00",  // 最低价
  "v": "12345.67",  // 成交量
  "p": "567.00",    // 价格变化
  "P": "0.579"      // 价格变化百分比
}
```

**实现示例**：
```javascript
const WebSocket = require('ws');
const ws = new WebSocket('wss://stream.binance.com:9443/ws/btcusdt@ticker');

let openPrice = 0;

ws.on('message', (data) => {
    const ticker = JSON.parse(data);
    const currentPrice = parseFloat(ticker.c);
    const dailyOpen = parseFloat(ticker.o);
    
    // 如果是新的小时，记录开盘价
    if (openPrice === 0) {
        openPrice = currentPrice;
    }
    
    // 计算概率
    const priceChange = currentPrice - openPrice;
    const changePercent = (priceChange / openPrice) * 100;
    
    // 简单逻辑：价格变化 → 概率
    let probUp = 0.50; // 基础概率
    if (priceChange > 0) {
        probUp = 0.50 + Math.min(changePercent * 5, 0.40); // 最高90%
    } else {
        probUp = 0.50 - Math.min(Math.abs(changePercent) * 5, 0.40); // 最低10%
    }
    
    const probDown = 1 - probUp;
    
    console.log(`UP: ${probUp.toFixed(4)}, DOWN: ${probDown.toFixed(4)}`);
});
```

**官方文档**：
- https://binance-docs.github.io/apidocs/spot/en/#websocket-market-streams

---
