# 数据库与 API 设计

> 本文档包含 PRD 第七至八章：数据库设计、API 设计

---

## 七、数据库设计

### 7.1 新增/修改表

#### 7.1.1 套利机会表 (opportunities)

```sql
CREATE TABLE IF NOT EXISTS opportunities (
  id INT AUTO_INCREMENT PRIMARY KEY COMMENT '自增主键',
  condition_id VARCHAR(100) NOT NULL COMMENT '市场条件ID',
  question VARCHAR(500) NOT NULL COMMENT '市场问题',
  strategy_type ENUM('MINT_SPLIT', 'ARBITRAGE', 'MARKET_MAKING') NOT NULL COMMENT '策略类型',
  opportunity_type ENUM('LONG', 'SHORT', 'MINT', 'SPLIT') COMMENT '机会类型',
  price_sum DECIMAL(10, 6) COMMENT '价格总和',
  spread DECIMAL(10, 4) COMMENT '价差百分比',
  expected_profit DECIMAL(10, 4) COMMENT '预期利润',
  tokens JSON COMMENT 'Token详情 (JSON)',
  status ENUM('PENDING', 'EXECUTING', 'SUCCESS', 'FAILED', 'EXPIRED') DEFAULT 'PENDING' COMMENT '状态',
  trade_id INT COMMENT '关联的交易记录ID',
  error_message TEXT COMMENT '错误信息',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '发现时间',
  executed_at TIMESTAMP NULL COMMENT '执行时间',
  INDEX idx_condition_id (condition_id),
  INDEX idx_strategy_type (strategy_type),
  INDEX idx_status (status),
  INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='套利机会表';
```

#### 7.1.2 队列状态表 (queue_status) - 可选

```sql
CREATE TABLE IF NOT EXISTS queue_status (
  id INT AUTO_INCREMENT PRIMARY KEY,
  queue_name VARCHAR(50) NOT NULL COMMENT '队列名称',
  current_size INT DEFAULT 0 COMMENT '当前队列长度',
  max_size INT COMMENT '最大容量',
  processed_count BIGINT DEFAULT 0 COMMENT '已处理任务数',
  error_count INT DEFAULT 0 COMMENT '错误数',
  last_task_at TIMESTAMP NULL COMMENT '最后任务时间',
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_queue_name (queue_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='队列状态表';
```

### 7.2 现有表关系

```
┌─────────────────┐     ┌─────────────────┐
│     markets     │     │ market_price_   │
│   (市场数据)     │────►│    history      │
│                 │  1:N│  (价格历史)      │
└─────────────────┘     └─────────────────┘
         │
         │ 1:N
         ▼
┌─────────────────┐     ┌─────────────────┐
│  opportunities  │────►│  trade_records  │
│   (套利机会)     │  1:1│   (交易记录)     │
└─────────────────┘     └─────────────────┘
```

---

## 八、API 设计

### 8.1 新增 API

#### 8.1.1 队列状态 API

```
GET /api/queues/status

Response:
{
  "success": true,
  "data": {
    "scan": { "size": 0, "maxSize": 1, "pending": 0, "running": false },
    "storage": { "size": 150, "maxSize": 5000, "pending": 150, "running": true },
    "mintSplit": { "size": 0, "maxSize": 100, "pending": 0, "running": false },
    "arbitrage": { "size": 0, "maxSize": 100, "pending": 0, "running": false },
    "marketMaking": { "size": 0, "maxSize": 100, "pending": 0, "running": false },
    "order": { "size": 2, "maxSize": 50, "pending": 2, "running": true }
  }
}
```

#### 8.1.2 机会列表 API

```
GET /api/opportunities?status=PENDING&strategy=MINT_SPLIT&limit=50

Response:
{
  "success": true,
  "data": {
    "opportunities": [...],
    "total": 100,
    "stats": {
      "pending": 5,
      "executing": 1,
      "success": 80,
      "failed": 14
    }
  }
}
```

#### 8.1.3 队列控制 API

```
POST /api/queues/start
POST /api/queues/stop
POST /api/queues/pause
POST /api/queues/resume
```

#### 8.1.4 扫描配置 API

```
GET /api/scan/config
Response:
{
  "success": true,
  "data": {
    "limit": 500,
    "maxPages": 10,
    "category": "",
    "minVolume": 100,
    "minLiquidity": 50,
    ...
  }
}

POST /api/scan/config
Body: { "limit": 1000, "minVolume": 500, ... }
Response:
{
  "success": true,
  "message": "扫描配置已更新"
}
```

#### 8.1.5 策略配置 API (新增)

```
GET /api/strategies/config
Response:
{
  "success": true,
  "data": {
    "mintSplit": { "enabled": true, "minPriceSum": 1.005, ... },
    "arbitrage": { "long": { "enabled": true, ... }, "short": { "enabled": true, ... } },
    "marketMaking": { "enabled": false, "spreadPercent": 2, ... }
  }
}

POST /api/strategies/config
Body: { "strategy": "MINT_SPLIT", "config": { "minPriceSum": 1.01, "minProfit": 0.02 } }
Response:
{
  "success": true,
  "message": "Mint-Split 策略配置已更新"
}
```

#### 8.1.6 策略状态 API (新增)

```
GET /api/strategies/status
Response:
{
  "success": true,
  "data": {
    "mintSplit": {
      "enabled": true,
      "queue": { "size": 5, "pending": 5, "maxSize": 100 },
      "stats": { "processedToday": 150, "opportunitiesFound": 12, ... }
    },
    "arbitrage": { ... },
    "marketMaking": { ... },
    "orderQueue": { "size": 2, "pending": 2, "processing": true }
  }
}
```

### 8.2 修改现有 API

| API | 修改内容 |
|-----|----------|
| `/api/arbitrage/start` | 改为启动队列系统 |
| `/api/arbitrage/stop` | 改为停止队列系统 |
| `/api/arbitrage/stats` | 增加队列状态信息 |

---

## 附录：代码示例

### 队列使用示例

```typescript
import PQueue from 'p-queue'

// 创建队列
const storageQueue = new PQueue({
  concurrency: 10,        // 并发数
  timeout: 10000,         // 超时时间
  throwOnTimeout: true,   // 超时抛出错误
})

// 添加任务
storageQueue.add(async () => {
  await saveMarketToMySQL(market)
})

// 等待队列清空
await storageQueue.onIdle()

// 监听事件
storageQueue.on('active', () => {
  console.log(`队列大小: ${storageQueue.size}, 待处理: ${storageQueue.pending}`)
})
```

### 背压控制示例

```typescript
async function scanLoop() {
  while (isRunning) {
    // 检查背压
    while (storageQueue.size > storageQueue.maxSize * 0.8) {
      console.log('⏸️ 存储队列繁忙，等待...')
      await sleep(1000)
    }
    
    // 执行扫描
    const markets = await fetchMarkets()
    
    // 分发到队列
    for (const market of markets) {
      storageQueue.add(() => saveMarket(market))
      strategyDispatcher.dispatch(market)
    }
    
    // 最小间隔
    await sleep(2000)
  }
}
```

---

**上一章**: [03-strategy-queues.md](./03-strategy-queues.md) - 策略队列系统设计  
**下一章**: [05-pages-tasks.md](./05-pages-tasks.md) - 页面设计与任务列表
