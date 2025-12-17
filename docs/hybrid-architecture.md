# Polymarket 混合架构方案

## 架构概览

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           Python 层 (数据 + 策略)                            │
├─────────────────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │ 数据采集    │  │ 套利检测    │  │ 策略引擎    │  │ FastAPI 管理界面    │ │
│  │ - Gamma API │  │ - 价格偏离  │  │ - 决策逻辑  │  │ - REST API         │ │
│  │ - CLOB 价格 │  │ - 机会评估  │  │ - 风控规则  │  │ - WebSocket 推送   │ │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────────────┘ │
│                                │                                             │
│                    ┌───────────▼───────────┐                                │
│                    │   Redis 消息队列      │                                │
│                    │   (信号传递层)        │                                │
│                    └───────────┬───────────┘                                │
└────────────────────────────────│────────────────────────────────────────────┘
                                 │
                    ┌────────────▼────────────┐
                    │   HTTP API / Redis      │
                    └────────────┬────────────┘
                                 │
┌────────────────────────────────│────────────────────────────────────────────┐
│                           TypeScript 层 (交易执行)                           │
├────────────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────┐  ┌─────────────────────┐  ┌─────────────────────┐ │
│  │ 订单执行服务        │  │ 合约交互服务        │  │ Next.js 前端        │ │
│  │ - @polymarket/clob  │  │ - ethers.js         │  │ - 现有仪表盘        │ │
│  │ - 下单/取消         │  │ - 铸造/合并         │  │ - 实时监控          │ │
│  └─────────────────────┘  └─────────────────────┘  └─────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
                                 │
                    ┌────────────▼────────────┐
                    │      MySQL 数据库       │
                    │  (共享数据存储)         │
                    └─────────────────────────┘
```

---

## 目录结构

```
polymarket-trading-bot/
├── python/                          # Python 数据层
│   ├── pyproject.toml               # Poetry 依赖管理
│   ├── .env                         # 环境变量
│   ├── src/
│   │   ├── __init__.py
│   │   ├── config/
│   │   │   ├── __init__.py
│   │   │   └── settings.py          # 配置管理 (pydantic-settings)
│   │   ├── api/
│   │   │   ├── __init__.py
│   │   │   ├── gamma_client.py      # Gamma API 客户端
│   │   │   ├── clob_client.py       # CLOB 价格客户端
│   │   │   └── ts_bridge.py         # TypeScript 服务调用
│   │   ├── db/
│   │   │   ├── __init__.py
│   │   │   ├── database.py          # SQLAlchemy 连接
│   │   │   └── models.py            # ORM 模型
│   │   ├── collectors/
│   │   │   ├── __init__.py
│   │   │   ├── market_collector.py  # 市场数据采集
│   │   │   └── price_collector.py   # 价格数据采集
│   │   ├── detectors/
│   │   │   ├── __init__.py
│   │   │   ├── arbitrage.py         # 套利检测
│   │   │   └── opportunity.py       # 机会评估
│   │   ├── strategies/
│   │   │   ├── __init__.py
│   │   │   ├── base.py              # 策略基类
│   │   │   ├── mint_split.py        # 铸造拆分策略
│   │   │   └── arbitrage_long.py    # 做多套利策略
│   │   ├── risk/
│   │   │   ├── __init__.py
│   │   │   └── manager.py           # 风控管理
│   │   ├── web/
│   │   │   ├── __init__.py
│   │   │   ├── main.py              # FastAPI 应用
│   │   │   ├── routes/
│   │   │   │   ├── markets.py
│   │   │   │   ├── opportunities.py
│   │   │   │   └── signals.py
│   │   │   └── websocket.py         # WebSocket 推送
│   │   └── tasks/
│   │       ├── __init__.py
│   │       ├── scheduler.py         # APScheduler 定时任务
│   │       └── workers.py           # Celery 异步任务 (可选)
│   ├── scripts/
│   │   ├── check_arbitrage.py       # 套利检测脚本
│   │   └── backtest.py              # 回测脚本
│   └── tests/
│       └── ...
│
├── src/                             # TypeScript 执行层 (现有)
│   ├── app/
│   │   ├── api/
│   │   │   ├── execute/             # 新增：执行接口
│   │   │   │   ├── order/route.ts   # 下单执行
│   │   │   │   ├── mint/route.ts    # 铸造执行
│   │   │   │   └── merge/route.ts   # 合并执行
│   │   │   └── ...
│   │   └── ...
│   └── lib/
│       ├── executor/                # 新增：执行器
│       │   ├── order-executor.ts    # 订单执行器
│       │   └── contract-executor.ts # 合约执行器
│       └── ...
│
├── docker-compose.yml               # Docker 编排
├── Makefile                         # 常用命令
└── README.md
```

---

## 技术栈

### Python 层

| 组件 | 技术选型 | 说明 |
|------|----------|------|
| **运行时** | Python 3.11+ | 类型提示、性能优化 |
| **包管理** | Poetry | 依赖锁定、虚拟环境 |
| **Web 框架** | FastAPI | 高性能、自动文档 |
| **数据库 ORM** | SQLAlchemy 2.0 | 异步支持、类型安全 |
| **配置管理** | pydantic-settings | 环境变量验证 |
| **HTTP 客户端** | httpx | 异步、HTTP/2 |
| **定时任务** | APScheduler | 轻量级调度 |
| **消息队列** | Redis (可选) | Python ↔ TS 通信 |
| **数据分析** | pandas, numpy | 数据处理 |
| **日志** | loguru | 简洁、彩色 |
| **测试** | pytest | 单元测试 |

### TypeScript 层

| 组件 | 技术选型 | 说明 |
|------|----------|------|
| **运行时** | Node.js 20+ | 现有 |
| **Web 框架** | Next.js 15 | 现有 |
| **交易 SDK** | @polymarket/clob-client | 官方 SDK |
| **合约交互** | ethers.js v6 | 铸造/合并 |
| **进程管理** | PM2 | 现有 |

### 共享基础设施

| 组件 | 技术 | 说明 |
|------|------|------|
| **数据库** | MySQL 8.0 | 共享存储 |
| **缓存** | Redis | 消息队列 + 缓存 |
| **容器化** | Docker Compose | 开发/部署 |

---

## 模块功能说明

### Python 模块

#### 1. 数据采集 (`collectors/`)

```python
# market_collector.py
class MarketCollector:
    """从 Gamma API 采集市场数据"""
    
    async def collect_markets(self, active_only: bool = True) -> List[Market]:
        """获取所有市场"""
        
    async def sync_to_db(self) -> SyncResult:
        """同步到数据库"""

# price_collector.py        
class PriceCollector:
    """从 CLOB API 采集价格数据"""
    
    async def collect_prices(self, token_ids: List[str]) -> List[Price]:
        """批量获取价格"""
        
    async def run_continuous(self, interval: int = 60):
        """连续采集模式"""
```

#### 2. 套利检测 (`detectors/`)

```python
# arbitrage.py
class ArbitrageDetector:
    """套利机会检测"""
    
    def detect_price_deviation(self, market_id: str) -> Optional[Opportunity]:
        """检测价格偏离"""
        # Yes价格 + No价格 != 1 时触发
        
    def evaluate_opportunity(self, opp: Opportunity) -> Score:
        """评估机会质量"""
        # 考虑：偏离幅度、流动性、手续费、滑点
        
    def should_execute(self, opp: Opportunity) -> bool:
        """是否应该执行"""
        # 风控检查 + 收益阈值
```

#### 3. 策略引擎 (`strategies/`)

```python
# base.py
class BaseStrategy(ABC):
    """策略基类"""
    
    @abstractmethod
    def analyze(self, market: Market) -> Optional[Signal]:
        """分析市场，生成信号"""
        
    @abstractmethod
    def calculate_position(self, signal: Signal) -> Position:
        """计算仓位大小"""

# mint_split.py
class MintSplitStrategy(BaseStrategy):
    """铸造拆分策略"""
    # 当 Yes + No > 1 时，铸造 $1 卖出两边
    
    def analyze(self, market: Market) -> Optional[Signal]:
        if market.yes_price + market.no_price > 1.005:  # 0.5% 阈值
            return Signal(
                type="MINT_SPLIT",
                market_id=market.id,
                expected_profit=self.calc_profit(market),
            )
```

#### 4. 风控管理 (`risk/`)

```python
# manager.py
class RiskManager:
    """风控管理"""
    
    # 仓位限制
    max_position_per_market: float = 1000  # 单市场最大 $1000
    max_total_position: float = 10000      # 总仓位最大 $10000
    
    # 频率限制
    max_trades_per_minute: int = 10
    
    # 亏损限制
    max_daily_loss: float = 500
    
    def check_order(self, order: Order) -> RiskCheckResult:
        """下单前风控检查"""
        
    def update_after_trade(self, trade: Trade):
        """交易后更新状态"""
```

#### 5. Web API (`web/`)

```python
# main.py
app = FastAPI(title="Polymarket Bot API")

# routes/opportunities.py
@router.get("/opportunities")
async def list_opportunities() -> List[Opportunity]:
    """获取当前套利机会"""

@router.post("/opportunities/{id}/execute")
async def execute_opportunity(id: str) -> ExecutionResult:
    """执行套利机会 -> 调用 TypeScript 服务"""
    
# websocket.py
@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    """实时推送机会"""
```

### TypeScript 模块

#### 1. 执行接口 (`api/execute/`)

```typescript
// order/route.ts
export async function POST(req: Request) {
  const { tokenId, side, price, size } = await req.json()
  
  // 使用官方 SDK 下单
  const clobClient = getClobClient()
  const order = await clobClient.createOrder({
    tokenID: tokenId,
    side,
    price,
    size,
  })
  
  return NextResponse.json({ success: true, order })
}

// mint/route.ts
export async function POST(req: Request) {
  const { conditionId, amount } = await req.json()
  
  // 调用合约铸造
  const executor = getContractExecutor()
  const tx = await executor.mint(conditionId, amount)
  
  return NextResponse.json({ success: true, txHash: tx.hash })
}
```

#### 2. 执行器 (`lib/executor/`)

```typescript
// order-executor.ts
export class OrderExecutor {
  private clobClient: ClobClient
  
  async createOrder(params: OrderParams): Promise<Order>
  async cancelOrder(orderId: string): Promise<void>
  async getOpenOrders(): Promise<Order[]>
}

// contract-executor.ts
export class ContractExecutor {
  private ctfContract: Contract
  
  async mint(conditionId: string, amount: bigint): Promise<TxReceipt>
  async merge(conditionId: string, amount: bigint): Promise<TxReceipt>
  async transfer(token: string, to: string, amount: bigint): Promise<TxReceipt>
}
```

---

## 通信方式

### 方案 A：HTTP 直接调用（简单）

```
Python 检测到机会 
    → HTTP POST /api/execute/order 
    → TypeScript 执行下单
    → 返回结果
```

```python
# python/src/api/ts_bridge.py
class TSBridge:
    """调用 TypeScript 执行服务"""
    
    base_url = "http://localhost:3000/api/execute"
    
    async def place_order(self, params: OrderParams) -> OrderResult:
        async with httpx.AsyncClient() as client:
            resp = await client.post(f"{self.base_url}/order", json=params.dict())
            return OrderResult(**resp.json())
    
    async def mint(self, condition_id: str, amount: float) -> TxResult:
        async with httpx.AsyncClient() as client:
            resp = await client.post(f"{self.base_url}/mint", json={
                "conditionId": condition_id,
                "amount": amount,
            })
            return TxResult(**resp.json())
```

### 方案 B：Redis 消息队列（解耦）

```
Python 发布信号到 Redis
    → TypeScript 订阅并执行
    → 结果写回 Redis/MySQL
```

```python
# Python 发布
redis.publish("trading:signals", json.dumps({
    "type": "MINT_SPLIT",
    "market_id": "xxx",
    "amount": 100,
}))
```

```typescript
// TypeScript 订阅
redis.subscribe("trading:signals", async (message) => {
  const signal = JSON.parse(message)
  await executeSignal(signal)
})
```

**推荐：先用方案 A（HTTP），后期可升级到方案 B**

---

## 数据流

```
1. 数据采集
   Gamma API ──→ Python MarketCollector ──→ MySQL (markets 表)
   CLOB API  ──→ Python PriceCollector  ──→ MySQL (market_prices 表)

2. 套利检测
   MySQL ──→ Python ArbitrageDetector ──→ 机会列表
   
3. 策略决策
   机会列表 ──→ Python Strategy ──→ 交易信号
   
4. 风控检查
   交易信号 ──→ Python RiskManager ──→ 通过/拒绝
   
5. 执行交易
   交易信号 ──→ HTTP ──→ TypeScript Executor ──→ Polymarket
   
6. 结果记录
   执行结果 ──→ MySQL (trades 表)
```

---

## 部署方案

### 开发环境

```yaml
# docker-compose.yml
version: '3.8'

services:
  # Python 服务
  python-bot:
    build: ./python
    volumes:
      - ./python:/app
    environment:
      - DATABASE_URL=mysql://...
      - TS_SERVICE_URL=http://ts-service:3000
    depends_on:
      - mysql
      - redis

  # TypeScript 服务 (现有)
  ts-service:
    build: .
    ports:
      - "3000:3000"
    environment:
      - DATABASE_URL=mysql://...
    depends_on:
      - mysql

  mysql:
    image: mysql:8.0
    volumes:
      - mysql_data:/var/lib/mysql
    environment:
      - MYSQL_DATABASE=polymarket
      
  redis:
    image: redis:7-alpine
    
volumes:
  mysql_data:
```

### 生产环境

```
┌─────────────────────────────────────────────┐
│              Nginx (反向代理)                │
│         polymarket.wukongbc.com             │
├─────────────────────────────────────────────┤
│  /api/*  → TypeScript (PM2)                 │
│  /py/*   → Python (Gunicorn)                │
│  /       → Next.js SSR                      │
└─────────────────────────────────────────────┘
```

---

## 开发步骤

### 阶段 1：基础设施 (1-2 天)
- [ ] 创建 Python 项目结构
- [ ] 配置 Poetry 依赖
- [ ] 实现数据库连接 (SQLAlchemy)
- [ ] 实现配置管理 (pydantic-settings)

### 阶段 2：数据采集 (2-3 天)
- [ ] 实现 Gamma API 客户端
- [ ] 实现 CLOB 价格客户端
- [ ] 实现数据采集调度
- [ ] 验证数据写入 MySQL

### 阶段 3：套利检测 (2-3 天)
- [ ] 实现价格偏离检测
- [ ] 实现机会评估逻辑
- [ ] 实现检测脚本

### 阶段 4：策略引擎 (3-5 天)
- [ ] 实现策略基类
- [ ] 实现铸造拆分策略
- [ ] 实现做多套利策略
- [ ] 实现风控管理

### 阶段 5：执行桥接 (2-3 天)
- [ ] TypeScript 新增执行接口
- [ ] Python 实现 TS Bridge
- [ ] 端到端测试

### 阶段 6：Web 界面 (2-3 天)
- [ ] FastAPI 应用
- [ ] 机会列表 API
- [ ] WebSocket 实时推送

### 阶段 7：部署优化 (1-2 天)
- [ ] Docker 配置
- [ ] 监控告警
- [ ] 日志收集

**总计：约 15-20 天**

---

## 常用命令

```makefile
# Makefile

# Python
py-install:
	cd python && poetry install

py-dev:
	cd python && poetry run uvicorn src.web.main:app --reload

py-check:
	cd python && poetry run python scripts/check_arbitrage.py

py-test:
	cd python && poetry run pytest

# TypeScript
ts-dev:
	npm run dev

ts-build:
	npm run build

# 全部
dev:
	make -j2 py-dev ts-dev

# Docker
up:
	docker-compose up -d

down:
	docker-compose down

logs:
	docker-compose logs -f
```

---

## 关键依赖

### Python (pyproject.toml)

```toml
[tool.poetry.dependencies]
python = "^3.11"
fastapi = "^0.109.0"
uvicorn = {extras = ["standard"], version = "^0.27.0"}
sqlalchemy = {extras = ["asyncio"], version = "^2.0.25"}
aiomysql = "^0.2.0"
pydantic-settings = "^2.1.0"
httpx = {extras = ["socks"], version = "^0.26.0"}
redis = "^5.0.1"
apscheduler = "^3.10.4"
pandas = "^2.1.4"
loguru = "^0.7.2"

[tool.poetry.group.dev.dependencies]
pytest = "^7.4.4"
pytest-asyncio = "^0.23.3"
```

### TypeScript (新增依赖)

```json
{
  "dependencies": {
    "ioredis": "^5.3.2"  // 如果用 Redis 方案
  }
}
```

---

## 注意事项

1. **API Key 安全**：Python 和 TypeScript 共享同一套凭证，存放在 `.env`
2. **数据库连接**：两边使用同一个 MySQL，注意连接池配置
3. **错误处理**：Python 调用 TS 失败时要有重试和降级策略
4. **监控**：两个服务都需要健康检查端点
5. **日志**：统一日志格式，方便排查问题
