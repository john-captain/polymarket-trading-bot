/**
 * WebSocket 实时订单簿监控模块
 * 
 * 功能：
 * 1. 实时订阅市场订单簿变化
 * 2. 检测套利机会 (价格和 < 1 或 > 1)
 * 3. 记录机会到日志文件
 * 
 * WebSocket API:
 * - 端点: wss://ws-subscriptions-clob.polymarket.com/ws/market
 * - 订阅: { type: "market", assets_ids: [...token_ids...] }
 */

import WebSocket from 'ws';
import * as fs from 'fs';
import * as path from 'path';

// ============== 类型定义 ==============

interface MarketSubscription {
    conditionId: string;
    question: string;
    yesTokenId: string;
    noTokenId: string;
    category?: string;
}

interface BookUpdate {
    event_type: string;
    asset_id: string;
    market: string;
    price?: string;
    side?: string;
    size?: string;
    timestamp?: string;
    hash?: string;
    // 订单簿快照
    bids?: Array<{ price: string; size: string }>;
    asks?: Array<{ price: string; size: string }>;
}

interface ArbitrageAlert {
    timestamp: Date;
    market: string;
    question: string;
    yesPrice: number;
    noPrice: number;
    priceSum: number;
    spread: number;  // (1 - priceSum) * 100
    type: 'LONG' | 'SHORT';  // LONG: priceSum < 1, SHORT: priceSum > 1
    profit: number;  // 预估利润
}

// ============== 日志工具 ==============

const LOG_DIR = path.join(__dirname, '../logs');
const OPPORTUNITY_LOG = path.join(LOG_DIR, 'arbitrage_opportunities.log');

function ensureLogDir() {
    if (!fs.existsSync(LOG_DIR)) {
        fs.mkdirSync(LOG_DIR, { recursive: true });
    }
}

function logOpportunity(alert: ArbitrageAlert) {
    ensureLogDir();
    
    const line = [
        `[${alert.timestamp.toISOString()}]`,
        alert.type === 'LONG' ? '📈做多' : '📉做空',
        `价差=${alert.spread.toFixed(4)}%`,
        `价格和=${alert.priceSum.toFixed(6)}`,
        `YES=$${alert.yesPrice.toFixed(4)}`,
        `NO=$${alert.noPrice.toFixed(4)}`,
        `利润=$${alert.profit.toFixed(4)}`,
        `市场=${alert.question.substring(0, 50)}`,
        `(${alert.market})`
    ].join(' ') + '\n';

    // 追加到日志文件
    fs.appendFileSync(OPPORTUNITY_LOG, line);
    console.log('📝 套利机会已记录:', line.trim());
}

function log(message: string) {
    const timestamp = new Date().toLocaleString('zh-CN');
    console.log(`[${timestamp}] ${message}`);
}

// ============== WebSocket 监控类 ==============

export class WebSocketMonitor {
    private ws: WebSocket | null = null;
    private subscriptions: Map<string, MarketSubscription> = new Map();  // tokenId -> market info
    private prices: Map<string, number> = new Map();  // tokenId -> best ask price
    private isRunning: boolean = false;
    private reconnectAttempts: number = 0;
    private maxReconnectAttempts: number = 10;
    private reconnectDelay: number = 5000;
    private pingInterval: NodeJS.Timeout | null = null;
    
    // 配置
    private minSpread: number = 0.1;  // 最小价差阈值 (%)
    private tradeAmount: number = 10;  // 模拟交易金额
    
    // 回调
    private onAlert?: (alert: ArbitrageAlert) => void;
    private onLog?: (message: string) => void;
    
    // WebSocket 端点
    private wsUrl: string = 'wss://ws-subscriptions-clob.polymarket.com/ws/market';

    constructor(options?: {
        minSpread?: number;
        tradeAmount?: number;
        wsUrl?: string;
    }) {
        if (options?.minSpread) this.minSpread = options.minSpread;
        if (options?.tradeAmount) this.tradeAmount = options.tradeAmount;
        if (options?.wsUrl) this.wsUrl = options.wsUrl;
        
        ensureLogDir();
    }

    setOnAlert(callback: (alert: ArbitrageAlert) => void) {
        this.onAlert = callback;
    }

    setOnLog(callback: (message: string) => void) {
        this.onLog = callback;
    }

    private emit(message: string) {
        log(message);
        this.onLog?.(message);
    }

    /**
     * 添加市场订阅
     */
    addMarket(market: MarketSubscription) {
        // 用 YES token 作为 key
        this.subscriptions.set(market.yesTokenId, market);
        // 也记录 NO token 的映射
        this.subscriptions.set(market.noTokenId, {
            ...market,
            // 标记这是 NO token，用于价格计算
        });
        
        this.emit(`📊 添加市场监控: ${market.question.substring(0, 40)}...`);
    }

    /**
     * 批量添加市场
     */
    addMarkets(markets: MarketSubscription[]) {
        markets.forEach(m => this.addMarket(m));
        this.emit(`📊 共添加 ${markets.length} 个市场监控`);
    }

    /**
     * 启动 WebSocket 连接
     */
    async start() {
        if (this.isRunning) {
            this.emit('⚠️ WebSocket 已在运行中');
            return;
        }

        this.isRunning = true;
        this.reconnectAttempts = 0;
        await this.connect();
    }

    /**
     * 停止监控
     */
    stop() {
        this.isRunning = false;
        if (this.pingInterval) {
            clearInterval(this.pingInterval);
            this.pingInterval = null;
        }
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        this.emit('⏹️ WebSocket 监控已停止');
    }

    /**
     * 建立 WebSocket 连接
     */
    private async connect() {
        try {
            this.emit(`🔌 连接 WebSocket: ${this.wsUrl}`);
            
            this.ws = new WebSocket(this.wsUrl);

            this.ws.on('open', () => {
                this.emit('✅ WebSocket 连接成功');
                this.reconnectAttempts = 0;
                this.subscribe();
                this.startPing();
            });

            this.ws.on('message', (data: Buffer) => {
                this.handleMessage(data.toString());
            });

            this.ws.on('error', (error: Error) => {
                this.emit(`❌ WebSocket 错误: ${error.message}`);
            });

            this.ws.on('close', (code: number, reason: Buffer) => {
                this.emit(`🔌 WebSocket 断开: code=${code}, reason=${reason.toString()}`);
                if (this.pingInterval) {
                    clearInterval(this.pingInterval);
                    this.pingInterval = null;
                }
                this.attemptReconnect();
            });

        } catch (error: any) {
            this.emit(`❌ WebSocket 连接失败: ${error.message}`);
            this.attemptReconnect();
        }
    }

    /**
     * 发送订阅消息
     */
    private subscribe() {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

        // 获取所有 token IDs
        const assetIds = Array.from(this.subscriptions.keys());
        
        if (assetIds.length === 0) {
            this.emit('⚠️ 没有市场可订阅');
            return;
        }

        const subscriptionMessage = {
            type: 'market',
            assets_ids: assetIds,
            initial_dump: true  // 请求初始订单簿快照
        };

        this.ws.send(JSON.stringify(subscriptionMessage), (err) => {
            if (err) {
                this.emit(`❌ 订阅失败: ${err.message}`);
            } else {
                this.emit(`📡 已订阅 ${assetIds.length} 个 tokens`);
            }
        });
    }

    /**
     * 启动心跳
     */
    private startPing() {
        this.pingInterval = setInterval(() => {
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                this.ws.send('PING');
            }
        }, 30000);  // 每 30 秒发送心跳
    }

    /**
     * 尝试重连
     */
    private attemptReconnect() {
        if (!this.isRunning) return;
        
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            this.emit(`❌ 达到最大重连次数 (${this.maxReconnectAttempts})，停止重连`);
            return;
        }

        this.reconnectAttempts++;
        const delay = this.reconnectDelay * this.reconnectAttempts;
        this.emit(`🔄 ${delay / 1000} 秒后尝试重连 (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
        
        setTimeout(() => {
            if (this.isRunning) {
                this.connect();
            }
        }, delay);
    }

    /**
     * 处理 WebSocket 消息
     */
    private handleMessage(data: string) {
        // 忽略 PONG 响应
        if (data === 'PONG') return;

        try {
            const messages: BookUpdate[] = JSON.parse(data);
            
            // 可能是数组或单个对象
            const updates = Array.isArray(messages) ? messages : [messages];
            
            for (const update of updates) {
                this.processUpdate(update);
            }
        } catch (error: any) {
            // 可能是非 JSON 消息
            if (data !== 'PONG' && !data.startsWith('PING')) {
                // this.emit(`📨 收到消息: ${data.substring(0, 100)}`);
            }
        }
    }

    /**
     * 处理订单簿更新
     * 
     * 注意：WebSocket 返回的是订单簿数据 (asks/bids)，不是市场价格
     * - asks[0].price 是最佳卖价（买入时的价格）
     * - bids[0].price 是最佳买价（卖出时的价格）
     * - 市场价格 ≈ (best_ask + best_bid) / 2 = midpoint
     */
    private processUpdate(update: BookUpdate) {
        const assetId = update.asset_id;
        if (!assetId) return;

        // 计算中间价作为市场价格
        let marketPrice: number | null = null;
        
        if (update.asks && update.asks.length > 0 && update.bids && update.bids.length > 0) {
            const bestAsk = parseFloat(update.asks[0].price);
            const bestBid = parseFloat(update.bids[0].price);
            // 使用中间价作为市场价格
            marketPrice = (bestAsk + bestBid) / 2;
        } else if (update.asks && update.asks.length > 0) {
            // 只有 asks，使用 ask 价格
            marketPrice = parseFloat(update.asks[0].price);
        } else if (update.bids && update.bids.length > 0) {
            // 只有 bids，使用 bid 价格
            marketPrice = parseFloat(update.bids[0].price);
        }

        if (marketPrice && marketPrice > 0 && marketPrice < 1) {
            const oldPrice = this.prices.get(assetId);
            this.prices.set(assetId, marketPrice);
            
            // 价格变化时检查套利
            if (oldPrice !== marketPrice) {
                this.checkArbitrage(assetId);
            }
        }

        // 处理价格更新事件
        if (update.event_type === 'price_change' && update.price) {
            const price = parseFloat(update.price);
            if (price > 0 && price < 1) {
                this.prices.set(assetId, price);
                this.checkArbitrage(assetId);
            }
        }
    }

    /**
     * 检查套利机会
     */
    private checkArbitrage(tokenId: string) {
        const market = this.subscriptions.get(tokenId);
        if (!market) return;

        // 获取 YES 和 NO 的价格
        const yesPrice = this.prices.get(market.yesTokenId);
        const noPrice = this.prices.get(market.noTokenId);

        // 需要两个价格都有
        if (yesPrice === undefined || noPrice === undefined) return;

        const priceSum = yesPrice + noPrice;
        const spread = (1 - priceSum) * 100;  // 正=做多机会，负=做空机会

        // 检查是否有套利机会
        if (Math.abs(spread) >= this.minSpread) {
            const type = priceSum < 1 ? 'LONG' : 'SHORT';
            
            // 计算预期利润
            let profit = 0;
            if (type === 'LONG') {
                // 做多利润 = 投入 × (1 - 价格和) / 价格和
                profit = this.tradeAmount * (1 - priceSum) / priceSum;
            } else {
                // 做空利润 = 投入 × (价格和 - 1)
                profit = this.tradeAmount * (priceSum - 1);
            }

            const alert: ArbitrageAlert = {
                timestamp: new Date(),
                market: market.conditionId,
                question: market.question,
                yesPrice,
                noPrice,
                priceSum,
                spread,
                type,
                profit
            };

            // 记录到日志文件
            logOpportunity(alert);
            
            // 触发回调
            this.onAlert?.(alert);

            this.emit(`🎯 发现套利！${type} 价差=${spread.toFixed(2)}% 利润=$${profit.toFixed(4)}`);
        }
    }

    /**
     * 获取当前状态
     */
    getStatus() {
        return {
            isRunning: this.isRunning,
            connected: this.ws?.readyState === WebSocket.OPEN,
            subscriptions: this.subscriptions.size / 2,  // 每个市场有 2 个 token
            pricesTracked: this.prices.size,
            reconnectAttempts: this.reconnectAttempts
        };
    }

    /**
     * 获取所有当前价格
     */
    getPrices(): Map<string, number> {
        return new Map(this.prices);
    }
}

// ============== 独立运行测试 ==============

async function main() {
    console.log('='.repeat(60));
    console.log('  WebSocket 实时订单簿监控测试');
    console.log('='.repeat(60));

    // 先获取一些活跃市场
    console.log('\n📡 获取活跃市场...');
    
    const response = await fetch(
        'https://gamma-api.polymarket.com/markets?active=true&closed=false&limit=20',
        {
            headers: {
                'User-Agent': 'Mozilla/5.0',
                'Accept': 'application/json'
            }
        }
    );
    
    const markets = await response.json() as any[];
    
    // 解析市场数据
    const subscriptions: MarketSubscription[] = [];
    
    for (const market of markets) {
        try {
            let tokenIds = market.clobTokenIds || [];
            if (typeof tokenIds === 'string') tokenIds = JSON.parse(tokenIds);
            
            let outcomes = market.outcomes || [];
            if (typeof outcomes === 'string') outcomes = JSON.parse(outcomes);
            
            if (tokenIds.length >= 2) {
                // 找到 YES 和 NO 的索引
                let yesIndex = outcomes.findIndex((o: string) => 
                    o.toLowerCase().includes('yes')
                );
                let noIndex = outcomes.findIndex((o: string) => 
                    o.toLowerCase().includes('no')
                );
                
                if (yesIndex === -1) yesIndex = 0;
                if (noIndex === -1) noIndex = 1;
                
                subscriptions.push({
                    conditionId: market.conditionId,
                    question: market.question,
                    yesTokenId: tokenIds[yesIndex],
                    noTokenId: tokenIds[noIndex],
                    category: market.category
                });
            }
        } catch (e) {
            // 忽略解析错误
        }
    }

    console.log(`✅ 解析到 ${subscriptions.length} 个市场`);

    // 创建监控器
    const monitor = new WebSocketMonitor({
        minSpread: 0.1,  // 0.1% 价差就记录
        tradeAmount: 10
    });

    // 设置回调
    monitor.setOnAlert((alert) => {
        console.log('\n🎯 套利警报:');
        console.log(`  市场: ${alert.question}`);
        console.log(`  类型: ${alert.type}`);
        console.log(`  YES: $${alert.yesPrice.toFixed(4)}`);
        console.log(`  NO: $${alert.noPrice.toFixed(4)}`);
        console.log(`  价格和: ${alert.priceSum.toFixed(6)}`);
        console.log(`  价差: ${alert.spread.toFixed(4)}%`);
        console.log(`  预期利润: $${alert.profit.toFixed(4)}`);
    });

    // 添加市场
    monitor.addMarkets(subscriptions);

    // 启动监控
    await monitor.start();

    // 运行直到手动停止
    console.log('\n⏳ 监控运行中... 按 Ctrl+C 停止\n');
    
    // 定期打印状态
    setInterval(() => {
        const status = monitor.getStatus();
        console.log(`📊 状态: 连接=${status.connected}, 订阅=${status.subscriptions}个市场, 价格=${status.pricesTracked}个`);
    }, 30000);

    // 优雅退出
    process.on('SIGINT', () => {
        console.log('\n\n🛑 正在停止...');
        monitor.stop();
        process.exit(0);
    });
}

// 如果直接运行此文件
if (require.main === module) {
    main().catch(console.error);
}

export { MarketSubscription, ArbitrageAlert, OPPORTUNITY_LOG };
