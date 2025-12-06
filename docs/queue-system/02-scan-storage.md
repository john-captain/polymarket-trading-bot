# 扫描配置与存储方案

> 本文档包含 PRD 第四至五章：扫描配置设计、存储方案设计

---

## 四、扫描配置设计

> **⚠️ 重要说明**：现有系统已实现大部分扫描配置功能，队列系统需**复用**而非重新开发。

### 4.1 现有实现梳理（必须复用）

以下功能已在 `/markets/sync` 和 `/markets/scan` 页面实现：

#### 4.1.1 `/markets/sync` 页面 - 市场同步（已实现 ✅）

**文件**: `src/app/(dashboard)/markets/sync/page.tsx` (824 行)

| 功能 | 状态 | 实现位置 |
|------|------|----------|
| 排序方式选择 (11种) | ✅ 已实现 | `SYNC_ORDER_OPTIONS`, `syncOrderBy` |
| 市场状态筛选 (活跃/关闭/全部) | ✅ 已实现 | `syncClosed` |
| 每次同步数量 (20/50/100) | ✅ 已实现 | `syncLimit` |
| 流动性范围 (min/max) | ✅ 已实现 | `syncLiquidityMin/Max` |
| 交易量范围 (min/max) | ✅ 已实现 | `syncVolumeMin/Max` |
| 结束时间范围 | ✅ 已实现 | `syncEndDateMin/Max` |
| 开始时间范围 | ✅ 已实现 | `syncStartDateMin/Max` |
| 标签ID筛选 | ✅ 已实现 | `syncTagId` |
| 包含相关标签 | ✅ 已实现 | `syncRelatedTags` |
| 常用标签快捷按钮 | ✅ 已实现 | 政治/体育/加密货币/流行文化/商业/科学等 |
| 高级筛选展开/收起 | ✅ 已实现 | `showAdvancedFilters` |
| 分页同步 (继续下一批) | ✅ 已实现 | `syncOffset`, `continueSync()` |

**已实现的 API 参数构建**:
```typescript
// 来自 buildSyncParams() 函数
params.order        // 排序字段
params.ascending    // 排序方向
params.closed       // 市场状态
params.liquidity_num_min/max  // 流动性范围
params.volume_num_min/max     // 交易量范围
params.end_date_min/max       // 结束日期范围
params.start_date_min/max     // 开始日期范围
params.tag_id       // 标签ID
params.related_tags // 包含相关标签
```

#### 4.1.2 `/markets/scan` 页面 - 套利扫描（已实现 ✅）

**文件**: `src/app/(dashboard)/markets/scan/page.tsx` (762 行)

| 功能 | 状态 | 实现位置 |
|------|------|----------|
| 最小交易量筛选 | ✅ 已实现 | `minVolumeFilter` |
| 最小流动性筛选 | ✅ 已实现 | `minLiquidity` |
| 最小价差筛选 | ✅ 已实现 | `minSpreadFilter` |
| 市场分类筛选 | ✅ 已实现 | `category` |
| 排除受限市场 | ✅ 已实现 | `excludeRestricted` |
| 仅二元市场 | ✅ 已实现 | `onlyBinaryMarkets` |
| 启动/停止扫描 | ✅ 已实现 | `startMutation`, `stopMutation` |
| 手动扫描 | ✅ 已实现 | `scanMutation` |
| 自动刷新 | ✅ 已实现 | `autoRefresh` |
| 设置保存到后端 | ✅ 已实现 | `updateSettingsMutation` |
| 套利机会列表 | ✅ 已实现 | `filteredMarkets` |
| 执行套利交易 | ✅ 已实现 | `executeMutation` |
| 模拟交易模式 | ✅ 已实现 | `simulate` 参数 |

### 4.2 队列系统需要复用的内容

队列系统的扫描队列应**直接复用**现有实现，而不是重新开发：

```typescript
// ❌ 不要这样做 - 重复造轮子
class ScanQueue {
  private buildParams() {
    // 重新实现参数构建...
  }
}

// ✅ 应该这样做 - 复用现有实现
import { buildSyncParams } from '@/lib/scan-config' // 抽取现有逻辑

class ScanQueue {
  private getScanConfig(): ScanConfig {
    // 从全局状态或数据库读取配置
    return getCurrentScanConfig()
  }
  
  async scan() {
    const config = this.getScanConfig()
    const params = buildSyncParams(config) // 复用现有参数构建逻辑
    // ...
  }
}
```

### 4.3 需要新增/整合的功能

| 功能 | 现状 | 需要做的事 |
|------|------|------------|
| **配置持久化** | 部分实现 (内存) | 完善数据库存储，支持重启恢复 |
| **队列集成** | 未实现 | 扫描结果发送到存储队列和策略队列 |
| **扫描调度** | setInterval | 改为队列调度器控制 |
| **背压控制** | 未实现 | 存储队列满时暂停扫描 |
| **订单簿并发控制** | 固定值 | 可配置并发数 |

### 4.4 配置项完整列表（合并现有+新增）

| 配置项 | 字段名 | 类型 | 默认值 | 来源 |
|--------|--------|------|--------|------|
| **排序方式** | `orderBy` | string | "volume" | ✅ 已有 (sync页面) |
| **排序方向** | `ascending` | boolean | false | ✅ 已有 (sync页面) |
| **市场状态** | `closed` | string | "false" | ✅ 已有 (sync页面) |
| **每次数量** | `limit` | number | 100 | ✅ 已有 (sync页面) |
| **流动性范围** | `liquidity_num_min/max` | number | - | ✅ 已有 (sync页面) |
| **交易量范围** | `volume_num_min/max` | number | - | ✅ 已有 (sync页面) |
| **日期范围** | `end_date_min/max` | string | - | ✅ 已有 (sync页面) |
| **标签ID** | `tag_id` | number | - | ✅ 已有 (sync页面) |
| **包含相关标签** | `related_tags` | boolean | false | ✅ 已有 (sync页面) |
| **最小价差** | `minSpread` | number | 1.0 | ✅ 已有 (scan页面) |
| **排除受限** | `excludeRestricted` | boolean | false | ✅ 已有 (scan页面) |
| **仅二元市场** | `onlyBinaryMarkets` | boolean | false | ✅ 已有 (scan页面) |
| **最大页数** | `maxPages` | number | 10 | 🆕 新增 |
| **订单簿并发** | `orderbookConcurrency` | number | 20 | 🆕 新增 |
| **扫描间隔** | `scanInterval` | number | 5000 | 🆕 新增 (队列调度) |

### 4.5 重构建议：抽取公共扫描配置模块

为避免代码重复，建议创建统一的扫描配置模块：

```typescript
// src/lib/scan-config.ts (新建)

export interface ScanConfig {
  // 来自 /markets/sync 页面
  orderBy: string
  ascending: boolean
  closed: string
  limit: number
  liquidityNumMin?: number
  liquidityNumMax?: number
  volumeNumMin?: number
  volumeNumMax?: number
  endDateMin?: string
  endDateMax?: string
  startDateMin?: string
  startDateMax?: string
  tagId?: number
  relatedTags: boolean
  
  // 来自 /markets/scan 页面
  minSpread: number
  excludeRestricted: boolean
  onlyBinaryMarkets: boolean
  
  // 新增 (队列系统)
  maxPages: number
  orderbookConcurrency: number
  scanInterval: number
}

// 默认配置
export const defaultScanConfig: ScanConfig = {
  orderBy: 'volume',
  ascending: false,
  closed: 'false',
  limit: 100,
  relatedTags: false,
  minSpread: 1.0,
  excludeRestricted: false,
  onlyBinaryMarkets: false,
  maxPages: 10,
  orderbookConcurrency: 20,
  scanInterval: 5000,
}

// 从现有 buildSyncParams 抽取
export function buildGammaApiParams(config: ScanConfig): Record<string, any> {
  const params: Record<string, any> = {
    limit: config.limit,
    order: config.orderBy,
    ascending: config.ascending,
  }
  
  if (config.closed !== 'all') {
    params.closed = config.closed === 'true'
  }
  if (config.liquidityNumMin) params.liquidity_num_min = config.liquidityNumMin
  if (config.liquidityNumMax) params.liquidity_num_max = config.liquidityNumMax
  if (config.volumeNumMin) params.volume_num_min = config.volumeNumMin
  if (config.volumeNumMax) params.volume_num_max = config.volumeNumMax
  if (config.endDateMin) params.end_date_min = config.endDateMin
  if (config.endDateMax) params.end_date_max = config.endDateMax
  if (config.startDateMin) params.start_date_min = config.startDateMin
  if (config.startDateMax) params.start_date_max = config.startDateMax
  if (config.tagId) params.tag_id = config.tagId
  if (config.relatedTags) params.related_tags = true
  
  return params
}

// 全局配置状态管理
let currentConfig: ScanConfig = { ...defaultScanConfig }

export function getScanConfig(): ScanConfig {
  return { ...currentConfig }
}

export function updateScanConfig(partial: Partial<ScanConfig>): void {
  currentConfig = { ...currentConfig, ...partial }
}
```

---

## 五、存储方案设计

### 5.1 分层存储策略

为优化 10000+ 市场数据的存储性能，采用**分层存储**策略：

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        扫描获取市场数据                                   │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        过滤层 (根据扫描配置)                              │
│              volume < minVolume 或 liquidity < minLiquidity → 跳过       │
└─────────────────────────────────────────────────────────────────────────┘
                                    │ 过滤后 ~2000-3000
                                    ▼
                    ┌───────────────┴───────────────┐
                    │                               │
                    ▼                               ▼
┌──────────────────────────────┐    ┌──────────────────────────────┐
│       markets 表              │    │   market_price_history 表    │
│   基础信息 (静态字段)          │    │   价格信息 (每次扫描追加)      │
│                              │    │                              │
│   INSERT IGNORE              │    │   INSERT (批量追加)           │
│   已存在自动跳过               │    │   100条/批                   │
└──────────────────────────────┘    └──────────────────────────────┘
```

### 5.2 表字段分类

#### markets 表 - 静态字段（只插入一次）

| 字段 | 说明 | 是否变化 |
|------|------|----------|
| condition_id | 市场ID | ❌ 不变 |
| question | 问题描述 | ❌ 不变 |
| slug | URL标识 | ❌ 不变 |
| category | 分类 | ❌ 不变 |
| outcomes | 结果选项 JSON | ❌ 不变 |
| tokens | Token IDs JSON | ❌ 不变 |
| end_date | 结束日期 | ❌ 不变 |
| start_date | 开始日期 | ❌ 不变 |
| image | 图片URL | ❌ 不变 |
| market_type | 市场类型 | ❌ 不变 |
| enable_order_book | 是否有订单簿 | ❌ 不变 |

#### market_price_history 表 - 动态字段（每次追加）

| 字段 | 说明 | 变化频率 |
|------|------|----------|
| outcome_prices | 结果价格 JSON | ✅ 每次 |
| volume | 总交易量 | ✅ 每次 |
| volume_24hr | 24h交易量 | ✅ 每次 |
| liquidity | 流动性 | ✅ 每次 |
| best_bid | 最佳买价 | ✅ 每次 |
| best_ask | 最佳卖价 | ✅ 每次 |
| spread | 价差 | ✅ 每次 |
| last_trade_price | 最后成交价 | ✅ 每次 |
| recorded_at | 记录时间 | ✅ 每次 |

### 5.3 写入逻辑

```typescript
async function saveMarketData(markets: Market[]) {
  const BATCH_SIZE = 100
  
  // 1. 基础信息：批量插入，已存在的跳过
  for (let i = 0; i < markets.length; i += BATCH_SIZE) {
    const batch = markets.slice(i, i + BATCH_SIZE)
    const sql = `
      INSERT IGNORE INTO markets 
      (condition_id, question, slug, category, outcomes, tokens, 
       end_date, start_date, image, market_type, enable_order_book, created_at)
      VALUES ?
    `
    await pool.query(sql, [batch.map(m => [
      m.conditionId, m.question, m.slug, m.category, 
      JSON.stringify(m.outcomes), JSON.stringify(m.tokens),
      m.endDate, m.startDate, m.image, m.marketType, m.enableOrderBook, new Date()
    ])])
  }
  
  // 2. 价格历史：批量追加
  for (let i = 0; i < markets.length; i += BATCH_SIZE) {
    const batch = markets.slice(i, i + BATCH_SIZE)
    const sql = `
      INSERT INTO market_price_history 
      (condition_id, outcome_prices, volume, volume_24hr, liquidity, 
       best_bid, best_ask, spread, last_trade_price, recorded_at)
      VALUES ?
    `
    await pool.query(sql, [batch.map(m => [
      m.conditionId, JSON.stringify(m.outcomePrices), m.volume, m.volume24hr, 
      m.liquidity, m.bestBid, m.bestAsk, m.spread, m.lastTradePrice, new Date()
    ])])
  }
}
```

### 5.4 查询最新价格

```sql
-- 获取市场及其最新价格
SELECT m.*, h.*
FROM markets m
INNER JOIN market_price_history h ON m.condition_id = h.condition_id
WHERE h.id = (
  SELECT MAX(id) 
  FROM market_price_history 
  WHERE condition_id = m.condition_id
)
ORDER BY h.volume DESC
LIMIT 100;
```

### 5.5 定期清理

```sql
-- 定时任务：只保留最近 7 天的价格历史
DELETE FROM market_price_history 
WHERE recorded_at < DATE_SUB(NOW(), INTERVAL 7 DAY);

-- 或保留每个市场最近 100 条记录
DELETE h FROM market_price_history h
WHERE h.id NOT IN (
  SELECT id FROM (
    SELECT id FROM market_price_history h2
    WHERE h2.condition_id = h.condition_id
    ORDER BY recorded_at DESC
    LIMIT 100
  ) tmp
);
```

### 5.6 性能预估

| 指标 | 优化前 | 优化后 |
|------|--------|--------|
| 每轮处理市场 | 10000+ | ~3000 (过滤后) |
| markets 表写入 | 10000 UPDATE | ~100 INSERT (仅新市场) |
| history 表写入 | - | ~3000 INSERT |
| 数据库 IO 次数 | 10000+ | ~60 (批量100条) |
| 预估写入耗时 | 30-60秒 | 3-5秒 |

---

**上一章**: [01-architecture.md](./01-architecture.md) - 系统架构设计  
**下一章**: [03-strategy-queues.md](./03-strategy-queues.md) - 策略队列系统设计 ⭐核心
