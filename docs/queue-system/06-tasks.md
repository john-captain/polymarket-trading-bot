# 开发任务列表

> 本文档包含队列系统升级的完整任务清单，包括工时估算和任务依赖关系

---

## 一、开发阶段划分

```
Phase 0: 统一 API 请求层 ⭐前置基础 (预计 2-3 小时) ✅ 已完成
├── Task 0.1: 设计 API 客户端架构 ✅
├── Task 0.2: 实现 Gamma API 客户端 (市场数据) ✅
├── Task 0.3: 包装 CLOB API 客户端 (复用官方SDK) ✅
├── Task 0.4: 实现请求日志记录 (MySQL) ✅
├── Task 0.5: 实现限速控制和重试机制 ✅
└── Task 0.6: 创建 API 日志查看页面 (待完成)

Phase 1: 基础队列系统 (预计 4-6 小时)
├── Task 1.1: 队列类型定义和基础结构
├── Task 1.2: 扫描配置模块
├── Task 1.3: 扫描队列实现
├── Task 1.4: 存储队列实现 (批量写入)
└── Task 1.5: 背压控制实现

Phase 2: 策略队列系统 ⭐核心 (预计 10-12 小时)
│
├── Task 2.1: 策略分发器 (StrategyDispatcher) [2h]
│   ├── 2.1.1 分发规则引擎
│   ├── 2.1.2 策略启用/禁用管理
│   └── 2.1.3 分发统计追踪
│
├── Task 2.2: Mint-Split 策略队列 ⭐ [3h]
│   ├── 2.2.1 机会检测算法 (价格和 > 1)
│   ├── 2.2.2 订单生成逻辑 (铸造 + 多卖单)
│   ├── 2.2.3 最大可铸造量计算
│   ├── 2.2.4 滑点控制
│   └── 2.2.5 冷却时间管理
│
├── Task 2.3: Arbitrage 策略队列 ⭐ [3h]
│   ├── 2.3.1 LONG 机会检测 (买价和 < 1)
│   ├── 2.3.2 SHORT 机会检测 (卖价和 > 1)
│   ├── 2.3.3 订单生成逻辑 (双边买入/卖出)
│   ├── 2.3.4 SHORT 铸造判断
│   └── 2.3.5 利润阈值验证
│
├── Task 2.4: Market-Making 策略队列 ⭐ [3h]
│   ├── 2.4.1 做市状态管理 (订单 + 持仓)
│   ├── 2.4.2 价差计算和挂单价格
│   ├── 2.4.3 库存偏斜调整
│   ├── 2.4.4 订单刷新逻辑
│   └── 2.4.5 自动 Merge 赎回
│
├── Task 2.5: 交易执行队列 (OrderQueue) ⭐ [2h]
│   ├── 2.5.1 优先级队列实现
│   ├── 2.5.2 Mint-Split 执行器 (铸造+卖出)
│   ├── 2.5.3 Arbitrage 执行器 (双边下单)
│   ├── 2.5.4 Market-Making 执行器 (挂单/取消/Merge)
│   └── 2.5.5 执行结果记录
│
├── Task 2.6: 策略配置管理 [1h]
│   ├── 2.6.1 配置数据结构
│   ├── 2.6.2 内存 + 数据库存储
│   └── 2.6.3 配置热更新
│
└── Task 2.7: 策略状态监控 [1h]
    ├── 2.7.1 队列状态收集
    ├── 2.7.2 统计数据计算
    └── 2.7.3 错误追踪

Phase 3: 数据持久化 (预计 2-3 小时)
├── Task 3.1: 机会表设计和建表
├── Task 3.2: 机会记录 CRUD 函数
└── Task 3.3: 关联交易记录

Phase 4: API 开发 (预计 3-4 小时)
├── Task 4.1: 队列状态 API
├── Task 4.2: 机会列表 API
├── Task 4.3: 队列控制 API
├── Task 4.4: 策略配置 API
└── Task 4.5: 策略状态 API

Phase 5: 前端页面 (预计 10-12 小时)
├── Task 5.1: 机会列表页面
├── Task 5.2: 队列状态卡片组件
├── Task 5.3: 策略配置页面
├── Task 5.4: 修改现有扫描页面
└── Task 5.5: 侧边栏导航更新

Phase 6: 测试和优化 (预计 2-3 小时)
├── Task 6.1: 单元测试
├── Task 6.2: 集成测试
└── Task 6.3: 性能优化
```

---

## 二、详细任务清单

### Phase 0: 统一 API 请求层 ⭐前置基础 ✅ 已完成

> **实现说明**
> - **Gamma API**: 自建 `GammaClient`（无官方 SDK）
> - **CLOB API**: 包装官方 `@polymarket/clob-client` SDK，添加日志记录层
> - 统一日志记录到 MySQL `api_request_logs` 表

#### 0.1 架构设计 ✅

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           统一 API 请求层                                    │
│                        src/lib/api-client/                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                      ApiClient (基础类)                              │   │
│   │  - 代理配置 (HTTP/SOCKS)                                            │   │
│   │  - 请求拦截 (添加 headers)                                           │   │
│   │  - 响应拦截 (错误处理, 日志记录)                                      │   │
│   │  - 限速控制 (令牌桶算法)                                              │   │
│   │  - 重试机制 (指数退避)                                               │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                          │                                                  │
│          ┌───────────────┴───────────────┐                                 │
│          ▼                               ▼                                 │
│   ┌─────────────┐              ┌──────────────────────┐                    │
│   │ GammaClient │              │ ClobClientWrapper    │                    │
│   │ (自建)      │              │ (包装官方SDK)         │                    │
│   │ 市场数据     │              │ @polymarket/clob-client                   │
│   │ 无官方SDK    │              │ 订单簿/下单           │                    │
│   └─────────────┘              └──────────────────────┘                    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         api_request_logs 表                                 │
│  - 请求时间、接口、参数、响应、耗时、状态码、错误信息                            │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### 0.2 已创建文件列表 ✅

| 文件 | 说明 | 状态 |
|------|------|------|
| `src/lib/api-client/types.ts` | 类型定义 (300+ 行) | ✅ 完成 |
| `src/lib/api-client/base.ts` | ApiClient 基础类 (代理/限速/重试/日志) | ✅ 完成 |
| `src/lib/api-client/gamma.ts` | GammaClient (市场数据) | ✅ 完成 |
| `src/lib/api-client/clob.ts` | ClobClientWrapper (包装官方SDK) | ✅ 完成 |
| `src/lib/api-client/index.ts` | 统一导出 | ✅ 完成 |
| `src/lib/database.ts` | 添加日志 CRUD 函数 | ✅ 完成 |

#### 0.3 API 请求日志表设计 ✅

```sql
CREATE TABLE IF NOT EXISTS api_request_logs (
  id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '自增主键',
  
  -- 请求信息
  client_type ENUM('GAMMA', 'CLOB', 'RPC') NOT NULL COMMENT 'API 类型',
  endpoint VARCHAR(500) NOT NULL COMMENT '请求端点 (URL 路径)',
  method ENUM('GET', 'POST', 'PUT', 'DELETE') NOT NULL COMMENT 'HTTP 方法',
  request_params JSON COMMENT '请求参数 (query/body)',
  request_headers JSON COMMENT '请求头 (脱敏后)',
  
  -- 响应信息
  status_code INT COMMENT 'HTTP 状态码',
  response_data JSON COMMENT '响应数据 (可选, 大数据截断)',
  response_size INT COMMENT '响应大小 (bytes)',
  
  -- 执行信息
  duration_ms INT NOT NULL COMMENT '请求耗时 (毫秒)',
  success BOOLEAN NOT NULL DEFAULT TRUE COMMENT '是否成功',
  error_message TEXT COMMENT '错误信息',
  retry_count INT DEFAULT 0 COMMENT '重试次数',
  
  -- 上下文
  trace_id VARCHAR(36) COMMENT '追踪ID (关联业务操作)',
  source VARCHAR(100) COMMENT '调用来源 (如: scan-queue, order-queue)',
  
  -- 时间
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '请求时间',
  
  INDEX idx_client_type (client_type),
  INDEX idx_endpoint (endpoint(100)),
  INDEX idx_created_at (created_at),
  INDEX idx_success (success),
  INDEX idx_trace_id (trace_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='API 请求日志表';
```

#### 0.4 使用示例

```typescript
// 使用新的 API 客户端
import { 
  getGammaClient, 
  getClobClient, 
  initApiClients,
  generateTraceId 
} from '@/lib/api-client'

// 初始化（设置日志存储到数据库）
await initApiClients()

const traceId = generateTraceId()
const context = { traceId, source: 'scan-queue' }

// 扫描市场 (GammaClient - 自建，自动记录日志、限速、重试)
const gamma = getGammaClient()
const markets = await gamma.getMarkets({
  active: true,
  closed: false,
  limit: 100,
  order: 'volume',
  ascending: false,
}, context)

// 获取订单簿 (ClobClientWrapper - 包装官方SDK)
const clob = getClobClient()
const book = await clob.getOrderBook(tokenId, context)

// 下单 (官方SDK自动签名)
const order = await clob.createOrder({
  tokenId,
  side: 'BUY',
  price: 0.5,
  size: 10,
}, { tickSize: '0.01', negRisk: false }, context)
```

#### 0.5 SDK 使用说明

| API | 实现方式 | 说明 |
|-----|----------|------|
| **Gamma API** | `GammaClient` (自建) | Polymarket 没有官方 SDK |
| **CLOB API** | `ClobClientWrapper` (包装) | 复用官方 `@polymarket/clob-client` SDK |

**官方 SDK 提供的功能**（直接复用）：
- `getOrderBook()` - 获取订单簿
- `getPrice()` - 获取市场价格  
- `createAndPostOrder()` - 下单
- `cancelOrders()` - 取消订单
- `cancelAll()` - 取消所有订单
- `getOpenOrders()` - 获取开放订单
- `getBalanceAllowance()` - 获取余额授权

**我们添加的功能**：
- 统一日志记录到 MySQL
- 统一的响应格式
- 追踪 ID 关联

#### 0.6 配置参数

```typescript
// Gamma API 默认配置
const DEFAULT_GAMMA_CONFIG = {
  baseUrl: 'https://gamma-api.polymarket.com',
  timeout: 30000,
  rateLimit: {
    maxRequests: 10,     // 每秒最多 10 请求
    windowMs: 1000,
  },
  retry: {
    maxRetries: 3,
    initialDelayMs: 1000,
    maxDelayMs: 10000,
    retryOn: [429, 500, 502, 503, 504],
  },
}

// CLOB API 默认配置 (官方SDK内部处理限速)
const DEFAULT_CLOB_CONFIG = {
  baseUrl: 'https://clob.polymarket.com',
  timeout: 15000,
}
```

#### 0.7 剩余任务

| 任务ID | 任务描述 | 优先级 | 预估时间 | 状态 |
|--------|----------|--------|----------|------|
| T-005-API | API 日志查看页面 | P2 | 1h | 待完成 |
| T-005a | 创建 `/api/logs` API | P2 | 30min | 待完成 |
| T-005b | 在 Settings 页面添加日志 Tab | P2 | 30min | 待完成 |

---

### Phase 1: 基础队列系统

| 任务ID | 任务描述 | 优先级 | 预估时间 | 依赖 | 备注 |
|--------|----------|--------|----------|------|------|
| T-001 | 创建 `src/lib/queue/types.ts` 类型定义 | P0 | 30min | Phase 0 | 🆕 新建 |
| T-002 | 创建 `src/lib/queue/scheduler.ts` 调度器 | P0 | 1h | T-001 | 🆕 新建 |
| T-003 | 创建 `src/lib/queue/scan-queue.ts` | P0 | 1h | T-001,T-005 | 🆕 新建 |
| T-004 | 创建 `src/lib/queue/storage-queue.ts` | P0 | 1h | T-001 | 🆕 新建 |
| **T-005** | **创建 `src/lib/scan-config.ts` 公共模块** | **P0** | **1h** | - | **♻️ 从现有页面抽取** |
| T-005a | 从 `markets/sync/page.tsx` 抽取 `buildSyncParams()` | P0 | 20min | - | ♻️ 复用 |
| T-005b | 从 `markets/scan/page.tsx` 抽取过滤设置逻辑 | P0 | 20min | - | ♻️ 复用 |
| T-005c | 合并为统一的 `ScanConfig` 接口 | P0 | 20min | T-005a,b | 🆕 整合 |
| T-006 | 实现背压控制逻辑 | P0 | 45min | T-002,T-004 | 🆕 新建 |

---

### Phase 2: 策略队列系统 ⭐核心


| 任务ID | 任务描述 | 优先级 | 预估时间 | 依赖 |
|--------|----------|--------|----------|------|
| **T-010** | **策略分发器** | **P0** | **2h** | T-001 |
| T-010a | 实现分发规则引擎 (根据市场特征) | P0 | 45min | T-001 |
| T-010b | 实现策略启用/禁用管理 | P0 | 30min | T-010a |
| T-010c | 实现分发统计追踪 | P0 | 45min | T-010a |
| **T-011** | **Mint-Split 策略队列** | **P0** | **3h** | T-010 |
| T-011a | 实现机会检测算法 (价格和 > 阈值) | P0 | 45min | T-010 |
| T-011b | 实现订单生成逻辑 (铸造数量 + 卖单列表) | P0 | 45min | T-011a |
| T-011c | 实现最大可铸造量计算 (受限于卖一量) | P0 | 30min | T-011b |
| T-011d | 实现滑点控制和价格验证 | P0 | 30min | T-011c |
| T-011e | 实现市场冷却时间管理 | P0 | 30min | T-011d |
| **T-012** | **Arbitrage 策略队列** | **P0** | **3h** | T-010 |
| T-012a | 实现 LONG 机会检测 (买价和 < 1) | P0 | 45min | T-010 |
| T-012b | 实现 SHORT 机会检测 (卖价和 > 1) | P0 | 45min | T-012a |
| T-012c | 实现订单生成逻辑 (双边下单) | P0 | 30min | T-012b |
| T-012d | 实现 SHORT 铸造判断 (有持仓 vs 需铸造) | P0 | 30min | T-012c |
| T-012e | 实现利润阈值和价差验证 | P0 | 30min | T-012d |
| **T-013** | **Market-Making 策略队列** | **P0** | **3h** | T-010 |
| T-013a | 实现做市状态管理 (订单 + 持仓) | P0 | 45min | T-010 |
| T-013b | 实现价差计算和挂单价格 | P0 | 30min | T-013a |
| T-013c | 实现库存偏斜调整 | P0 | 30min | T-013b |
| T-013d | 实现订单刷新逻辑 (取消旧单+挂新单) | P0 | 30min | T-013c |
| T-013e | 实现自动 Merge 赎回 | P0 | 45min | T-013d |
| **T-014** | **交易执行队列** | **P0** | **2h** | T-011,T-012,T-013 |
| T-014a | 实现优先级队列 (紧急/高/普通) | P0 | 30min | T-001 |
| T-014b | 实现 Mint-Split 执行器 (铸造+批量卖出) | P0 | 30min | T-014a |
| T-014c | 实现 Arbitrage 执行器 (双边下单) | P0 | 30min | T-014b |
| T-014d | 实现 Market-Making 执行器 (挂单/取消/Merge) | P0 | 30min | T-014c |
| T-014e | 实现执行结果记录 (更新 opportunity + trade_records) | P0 | 20min | T-014d |
| **T-015** | **策略配置管理** | **P0** | **1h** | T-011,T-012,T-013 |
| T-015a | 定义三个策略的配置数据结构 | P0 | 20min | T-001 |
| T-015b | 实现配置存储 (内存 + 数据库) | P0 | 30min | T-015a |
| T-015c | 实现配置热更新 (不重启生效) | P0 | 10min | T-015b |
| **T-016** | **策略状态监控** | **P1** | **1h** | T-014 |
| T-016a | 实现队列状态收集 | P1 | 20min | T-014 |
| T-016b | 实现统计数据计算 (成功率/利润/损失) | P1 | 20min | T-016a |
| T-016c | 实现错误追踪 | P1 | 20min | T-016b |

---

### Phase 3-4: 数据持久化与 API

| 任务ID | 任务描述 | 优先级 | 预估时间 | 依赖 |
|--------|----------|--------|----------|------|
| T-020 | 创建 opportunities 表 SQL | P0 | 30min | - |
| T-021 | 在 database.ts 添加机会 CRUD 函数 | P0 | 1h | T-020 |
| T-022 | 创建 `/api/queues/status` API | P1 | 30min | T-002 |
| T-023 | 创建 `/api/opportunities` API | P1 | 45min | T-021 |
| T-024 | 创建 `/api/strategies/config` API | P1 | 45min | T-015 |
| T-025 | 创建 `/api/strategies/status` API | P1 | 30min | T-016 |
| T-026 | 修改 `/api/arbitrage/start` | P1 | 30min | T-002 |
| T-027 | 修改 `/api/arbitrage/stop` | P1 | 30min | T-002 |

---

### Phase 5: 前端页面 ⭐详细任务

#### T-028: 机会列表页面 (详细拆分)

| 任务ID | 任务描述 | 优先级 | 预估时间 | 依赖 | 备注 |
|--------|----------|--------|----------|------|------|
| **T-028** | **创建机会列表页面** | **P1** | **4h** | T-023 | ⭐ 核心页面 |
| T-028a | 创建页面基础布局 | P1 | 30min | T-023 | 页面骨架 |
| T-028b | 实现队列状态卡片区 (4个卡片) | P1 | 45min | T-022 | 实时刷新 |
| T-028c | 实现机会列表表格 | P1 | 45min | T-028a | 分页+排序 |
| T-028d | 实现筛选功能 (策略/状态/时间) | P1 | 30min | T-028c | 下拉选择 |
| T-028e | 实现搜索功能 (按市场问题) | P1 | 20min | T-028c | 模糊搜索 |
| T-028f | 实现启动/停止按钮 | P1 | 20min | T-026,T-027 | 调用队列API |
| T-028g | 实现底部统计栏 | P1 | 20min | T-028c | 今日汇总 |
| **T-028-detail** | **机会详情弹窗** | **P1** | **1.5h** | T-028c | ⭐ 重要 |
| T-028-d1 | 创建详情弹窗组件 | P1 | 20min | T-028c | Dialog基础 |
| T-028-d2 | 基本信息区 (策略/市场/时间) | P1 | 15min | T-028-d1 | 卡片展示 |
| T-028-d3 | 套利数据区 (价格和/利润/投入) | P1 | 15min | T-028-d1 | 数据格式化 |
| T-028-d4 | 各结果详情表格 (计划vs实际) | P1 | 20min | T-028-d1 | 状态图标 |
| T-028-d5 | 执行状态区 (步骤+错误信息) | P1 | 20min | T-028-d1 | 时间线展示 |
| T-028-d6 | 执行结果区 (实际利润/剩余持仓) | P1 | 10min | T-028-d1 | 盈亏高亮 |
| T-028-d7 | 关联记录区 (交易哈希链接) | P1 | 10min | T-028-d1 | 外链跳转 |

#### T-029: 队列状态卡片组件

| 任务ID | 任务描述 | 优先级 | 预估时间 | 依赖 |
|--------|----------|--------|----------|------|
| T-029 | 创建队列状态卡片组件 | P1 | 1h | T-022 |
| T-029a | 单个队列卡片 UI | P1 | 20min | T-022 |
| T-029b | 状态指示灯 (空闲/运行/暂停) | P1 | 15min | T-029a |
| T-029c | 进度显示 (当前/最大) | P1 | 15min | T-029a |
| T-029d | 轮询刷新逻辑 (5秒) | P1 | 10min | T-029a |

#### T-030: 策略配置页面 (详细拆分)

| 任务ID | 任务描述 | 优先级 | 预估时间 | 依赖 | 备注 |
|--------|----------|--------|----------|------|------|
| **T-030** | **创建策略配置页面** | **P1** | **4h** | T-024 | ⭐ 核心页面 |
| T-030a | 创建页面基础布局 | P1 | 30min | T-024 | 全局设置区 |
| T-030b | 实现策略卡片组件 (可折叠) | P1 | 45min | T-030a | 展开/折叠 |
| T-030c | 策略开关 (启用/禁用) | P1 | 20min | T-030b | Switch组件 |
| T-030d | 策略状态显示 (运行/停止/今日统计) | P1 | 30min | T-025 | 实时刷新 |
| **T-030-ms** | **Mint-Split 配置表单** | **P1** | **45min** | T-030b | |
| T-030-ms1 | 触发条件配置 (价格和/利润率/结果数) | P1 | 20min | T-030b | Input组件 |
| T-030-ms2 | 交易参数配置 (金额/滑点/冷却) | P1 | 15min | T-030b | Input组件 |
| T-030-ms3 | 参数校验 | P1 | 10min | T-030-ms1 | 范围检查 |
| **T-030-arb** | **Arbitrage 配置表单** | **P1** | **45min** | T-030b | |
| T-030-arb1 | LONG 配置 (启用/阈值/价差) | P1 | 15min | T-030b | 独立开关 |
| T-030-arb2 | SHORT 配置 (启用/阈值/价差) | P1 | 15min | T-030b | 独立开关 |
| T-030-arb3 | 交易参数配置 (金额/滑点/冷却) | P1 | 15min | T-030b | 共用参数 |
| **T-030-mm** | **Market-Making 配置表单** | **P1** | **45min** | T-030b | |
| T-030-mm1 | 做市参数配置 (价差/金额/间隔) | P1 | 15min | T-030b | Input组件 |
| T-030-mm2 | 风控参数配置 (持仓/资金/偏斜) | P1 | 15min | T-030b | Input组件 |
| T-030-mm3 | 其他设置 (Merge/单边) | P1 | 15min | T-030b | Checkbox |
| **T-030-save** | **配置保存功能** | **P1** | **30min** | T-030-ms,arb,mm | |
| T-030-save1 | 保存到数据库 | P1 | 15min | T-024 | POST API |
| T-030-save2 | 恢复默认值 | P1 | 15min | T-030-save1 | 确认弹窗 |

#### 其他页面任务

| 任务ID | 任务描述 | 优先级 | 预估时间 | 依赖 |
|--------|----------|--------|----------|------|
| T-031 | 修改扫描页面集成队列 | P1 | 1h | T-029 |
| T-032 | 更新侧边栏导航 | P2 | 15min | T-028 |
| T-033 | 创建 `src/lib/queue/index.ts` 统一导出 | P0 | 15min | T-014 |
| T-034 | 编写测试用例 | P2 | 2h | T-001~T-033 |

---

### Phase 5 补充: 市场列表页面重构 ⭐

> 将 `/markets/sync` 改造为纯展示的市场列表页面

| 任务ID | 任务描述 | 优先级 | 预估时间 | 依赖 | 备注 |
|--------|----------|--------|----------|------|------|
| **T-040** | **市场列表 API** | **P1** | **1.5h** | T-021 | 🆕 新建 |
| T-040a | 创建 `/api/markets/list` 分页查询 API | P1 | 30min | T-021 | 支持筛选排序 |
| T-040b | 创建 `/api/markets/[id]` 市场详情 API | P1 | 20min | T-021 | 返回完整信息 |
| T-040c | 创建 `/api/markets/[id]/history` 价格历史 API | P1 | 30min | T-021 | 返回历史数据 |
| T-040d | 创建 `/api/markets/stats` 统计 API | P1 | 20min | T-021 | 活跃数/总量等 |
| **T-041** | **重构市场列表页面** | **P1** | **3h** | T-040 | ♻️ 重构 |
| T-041a | 移除"开始同步"功能和相关代码 | P1 | 20min | - | 删除同步逻辑 |
| T-041b | 重构为纯数据展示页面 | P1 | 45min | T-041a | 读取数据库 |
| T-041c | 实现搜索功能 (问题/ID) | P1 | 30min | T-041b | 模糊搜索 |
| T-041d | 实现筛选功能 (状态/分类/标签) | P1 | 30min | T-041b | 多条件筛选 |
| T-041e | 实现高级筛选 (交易量/流动性范围) | P1 | 30min | T-041d | 可折叠面板 |
| T-041f | 实现排序功能 (交易量/流动性/时间) | P1 | 15min | T-041b | 多字段排序 |
| T-041g | 实现分页组件 | P1 | 20min | T-041b | 每页100条 |
| **T-042** | **市场详情弹窗** | **P1** | **1.5h** | T-040b | 🆕 新建 |
| T-042a | 创建详情弹窗组件 | P1 | 30min | T-040b | Dialog 组件 |
| T-042b | 展示基本信息 (问题/ID/分类/标签) | P1 | 15min | T-042a | 卡片布局 |
| T-042c | 展示交易数据 (交易量/流动性/价差) | P1 | 15min | T-042a | 数据格式化 |
| T-042d | 展示结果选项 (价格/买卖一/Token) | P1 | 15min | T-042a | 表格展示 |
| T-042e | 添加外链按钮 (跳转 Polymarket) | P1 | 10min | T-042a | 新窗口打开 |
| **T-043** | **价格历史图表** | **P2** | **1h** | T-040c | 🆕 新建 |
| T-043a | 集成图表库 (recharts) | P2 | 20min | - | 安装依赖 |
| T-043b | 实现价格走势折线图 | P2 | 30min | T-043a | Yes/No 双线 |
| T-043c | 添加时间范围选择 (7天/30天) | P2 | 10min | T-043b | 切换按钮 |

---

## 三、时间估算汇总

| 阶段 | 预估时间 | 核心任务 |
|------|----------|----------|
| **Phase 0: API 请求层** ⭐ | **4-5 小时** | **统一客户端、日志记录、限速重试** |
| Phase 1: 基础队列 | 4-6 小时 | 扫描队列、存储队列、背压控制 |
| **Phase 2: 策略队列** ⭐ | **10-12 小时** | **三策略 + 执行队列 + 配置管理** |
| Phase 3: 数据持久化 | 2-3 小时 | 机会表、CRUD |
| Phase 4: API 开发 | 3-4 小时 | 5 个 API |
| **Phase 5: 前端页面** ⭐ | **10-12 小时** | **机会列表页+详情弹窗+策略配置页** |
| Phase 5+: 市场列表重构 | 7 小时 | 列表展示、详情弹窗、价格图表 |
| Phase 6: 测试优化 | 2-3 小时 | 测试 + 性能 |
| **总计** | **42-52 小时** | |

### Phase 5 详细工时分解

| 任务 | 工时 | 说明 |
|------|------|------|
| T-028 机会列表页面 | 4h | 队列状态+列表+筛选+搜索 |
| T-028-detail 机会详情弹窗 | 1.5h | 完整执行信息+错误展示 |
| T-029 队列状态卡片 | 1h | 可复用组件 |
| T-030 策略配置页面 | 4h | 三策略配置表单 |
| T-031~T-034 其他 | 1.5h | 侧边栏+扫描页+测试 |

---

## 四、任务依赖关系图

```
Phase 0 (API层)
T-000 ──► T-001-API ──┬──► T-002-API ──► T-004-API
                      └──► T-003-API ──► T-004-API
                                    └──► T-005-API

Phase 1 (基础队列)
T-001 ──┬──► T-002 ──► T-006
        ├──► T-003
        └──► T-004
T-005 ──► T-003

Phase 2 (策略队列)
T-010 ──┬──► T-011 ──┐
        ├──► T-012 ──┼──► T-014 ──► T-016
        └──► T-013 ──┘
                 └──► T-015

Phase 3-4 (数据+API)
T-020 ──► T-021 ──┬──► T-023
                  └──► T-040
T-002 ──► T-022
T-015 ──► T-024
T-016 ──► T-025

Phase 5 (前端)
T-023 ──► T-028 ──► T-028-detail
T-022 ──► T-029 ──► T-031
T-024 ──► T-030
T-040 ──► T-041 ──► T-042 ──► T-043
```

---

**上一章**: [05-pages.md](./05-pages.md) - 页面设计  
**下一章**: [07-verification.md](./07-verification.md) - 风险评估与验收标准  
**返回索引**: [00-index.md](./00-index.md)
