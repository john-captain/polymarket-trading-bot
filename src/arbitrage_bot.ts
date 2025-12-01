/**
 * 双边套利交易机器人 (Academic Paper Enhanced)
 * 
 * 基于论文 "Polymarket 预测市场中的套利行为" 优化
 * 
 * ============== 套利类型 ==============
 * 
 * 1. 市场再平衡套利 (Market Rebalancing Arbitrage)
 *    - 单条件套利: 同一市场 YES + NO 价格和 ≠ 1
 *      - 做多 (Long): 价格和 < 1 时，买入 YES + NO，等待结算获利
 *      - 做空 (Short): 价格和 > 1 时，卖出 YES + NO，锁定超额价值
 *    
 *    - 多条件套利 (NegRisk): 同一事件多个互斥结果
 *      - 例如: "谁将赢得选举" 有 A, B, C 三个选项
 *      - 所有 YES 价格和应 = 1，偏离时存在套利
 * 
 * 2. 组合套利 (Composite Arbitrage)
 *    - 跨市场套利: 利用逻辑依赖关系
 *      - 例如: "A队获胜" + "A队净胜2球以上" 
 *      - 后者为真时，前者必然为真
 * 
 * ============== 利润计算 ==============
 * 
 * 做多利润 = 投入金额 × (1 - 价格和) / 价格和
 * 做空利润 = 投入金额 × (价格和 - 1)
 * 
 * 论文数据: 2024年4月-2025年4月，约$4000万套利利润被实现
 * 最佳策略: 单条件套利，最低 $0.02 利润阈值
 * 
 * ============== 风险控制 ==============
 * 
 * - 最小利润阈值: $0.02 (覆盖 gas 费用)
 * - 最大滑点保护: 0.5%
 * - 同时下单，时间差 < 5秒
 * - 优先高流动性市场
 */

import { ClobClient, OrderType, Side } from '@polymarket/clob-client';
import { Wallet } from '@ethersproject/wallet';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';
import { BalanceChecker, BalanceInfo } from './balance_checker';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

// ============== 日志文件配置 ==============

const LOG_DIR = path.join(__dirname, '../logs');
const OPPORTUNITY_LOG = path.join(LOG_DIR, 'arbitrage_opportunities.log');
const SCAN_LOG = path.join(LOG_DIR, 'scan_history.log');

function ensureLogDir() {
    if (!fs.existsSync(LOG_DIR)) {
        fs.mkdirSync(LOG_DIR, { recursive: true });
    }
}

/**
 * 记录套利机会到日志文件 (追加模式)
 */
function logOpportunityToFile(market: any, priceSum: number, spread: number, profit: number) {
    ensureLogDir();
    
    const timestamp = new Date().toISOString();
    const type = priceSum < 1 ? '📈做多' : '📉做空';
    
    const line = [
        `[${timestamp}]`,
        type,
        `价差=${spread.toFixed(4)}%`,
        `价格和=${priceSum.toFixed(6)}`,
        `利润=$${profit.toFixed(4)}`,
        `流动性=$${(market.liquidity || 0).toFixed(2)}`,
        `市场=${(market.question || '').substring(0, 60)}`,
        `(${market.conditionId || ''})`
    ].join(' ') + '\n';

    fs.appendFileSync(OPPORTUNITY_LOG, line);
}

/**
 * 记录扫描结果到日志文件 (追加模式)
 */
function logScanResult(totalMarkets: number, deviatedMarkets: number, opportunities: number) {
    ensureLogDir();
    
    const timestamp = new Date().toISOString();
    const line = [
        `[${timestamp}]`,
        `扫描完成`,
        `总市场=${totalMarkets}`,
        `价格偏离=${deviatedMarkets}`,
        `套利机会=${opportunities}`
    ].join(' ') + '\n';

    fs.appendFileSync(SCAN_LOG, line);
    
    // 如果有价格偏离市场，额外记录到机会日志
    if (deviatedMarkets > 0) {
        const opportunityLine = `[${timestamp}] 📊 扫描统计: ${totalMarkets}个市场, ${deviatedMarkets}个价格偏离, ${opportunities}个套利机会\n`;
        fs.appendFileSync(OPPORTUNITY_LOG, opportunityLine);
    }
}

// ============== 套利策略类型 ==============

export enum ArbitrageType {
    LONG = 'LONG',       // 做多: 价格和 < 1，买入所有结果
    SHORT = 'SHORT',     // 做空: 价格和 > 1，卖出所有结果
    NONE = 'NONE'        // 无机会
}

export enum MarketType {
    BINARY = 'BINARY',           // 二元市场 (Yes/No)
    MULTI_OUTCOME = 'MULTI_OUTCOME'  // 多结果市场 (NegRisk)
}

// ============== 接口定义 ==============

interface TokenInfo {
    tokenId: string;
    outcome: string;
    price: number;
}

interface MarketInfo {
    conditionId: string;
    question: string;
    slug: string;
    marketType: MarketType;
    tokens: TokenInfo[];        // 所有结果的 token 信息
    upTokenId: string;          // 兼容旧接口
    downTokenId: string;        // 兼容旧接口
    upPrice: number;
    downPrice: number;
    priceSum: number;
    spread: number;             // 价差百分比 (正=做多机会, 负=做空机会)
    arbitrageType: ArbitrageType;
    liquidity: number;          // 市场流动性
    category: string;           // 市场分类
}

interface ArbitrageOpportunity {
    market: MarketInfo;
    upPrice: number;
    downPrice: number;
    priceSum: number;
    spread: number;
    profit: number;  // 预期利润 (USDC)
    timestamp: Date;
}

interface TradeResult {
    success: boolean;
    upOrderId?: string;
    downOrderId?: string;
    upPrice: number;
    downPrice: number;
    totalCost: number;
    expectedProfit: number;
    error?: string;
}

interface BotStats {
    startTime: Date;
    totalScans: number;
    opportunitiesFound: number;
    tradesExecuted: number;
    totalProfit: number;
    lastOpportunity: ArbitrageOpportunity | null;
}

// ============== 套利机器人类 ==============

export class ArbitrageBot {
    private wallet: Wallet;
    private client: ClobClient;
    private balanceChecker: BalanceChecker;
    private isRunning: boolean = false;
    
    // 配置参数
    private minSpread: number;           // 最小价差阈值 (%)
    private tradeAmount: number;         // 每边交易金额 (USDC)
    private scanInterval: number;        // 扫描间隔 (ms)
    private maxSlippage: number;         // 最大滑点 (%)
    
    // 统计数据
    private stats: BotStats;
    
    // 最后一次扫描的统计
    public lastScanStats = {
        totalMarkets: 0,
        deviatedMarkets: 0,
        scanDurationMs: 0
    };
    
    // 回调函数
    private onStatsUpdate?: (stats: BotStats) => void;
    private onOpportunity?: (opp: ArbitrageOpportunity) => void;
    private onTrade?: (result: TradeResult) => void;
    private onLog?: (message: string) => void;

    constructor() {
        const privateKey = process.env.PRIVATE_KEY;
        if (!privateKey || privateKey.length < 64) {
            throw new Error('❌ 未找到有效的 PRIVATE_KEY');
        }

        this.wallet = new Wallet(privateKey);
        this.client = new ClobClient(
            process.env.CLOB_API_URL || 'https://clob.polymarket.com',
            137,
            this.wallet
        );
        this.balanceChecker = new BalanceChecker();

        // 从环境变量读取配置
        this.minSpread = parseFloat(process.env.ARB_MIN_SPREAD || '1.0');  // 默认 1%
        this.tradeAmount = parseFloat(process.env.ARB_TRADE_AMOUNT || '10.0');  // 默认每边 $10
        this.scanInterval = parseInt(process.env.ARB_SCAN_INTERVAL || '1000');  // 默认 1秒
        this.maxSlippage = parseFloat(process.env.ARB_MAX_SLIPPAGE || '0.5');  // 默认 0.5%

        // 初始化统计
        this.stats = {
            startTime: new Date(),
            totalScans: 0,
            opportunitiesFound: 0,
            tradesExecuted: 0,
            totalProfit: 0,
            lastOpportunity: null
        };
    }

    // ============== 回调设置 ==============

    setOnStatsUpdate(callback: (stats: BotStats) => void) {
        this.onStatsUpdate = callback;
    }

    setOnOpportunity(callback: (opp: ArbitrageOpportunity) => void) {
        this.onOpportunity = callback;
    }

    setOnTrade(callback: (result: TradeResult) => void) {
        this.onTrade = callback;
    }

    setOnLog(callback: (message: string) => void) {
        this.onLog = callback;
    }

    private log(message: string) {
        const timestamp = new Date().toLocaleString('zh-CN');
        const logMessage = `[${timestamp}] ${message}`;
        console.log(logMessage);
        this.onLog?.(logMessage);
    }

    // ============== 核心功能 ==============

    /**
     * 初始化机器人 - 检查余额和凭证
     */
    async initialize(): Promise<void> {
        this.log('🔄 初始化套利机器人...');
        
        // 检查余额
        const balances = await this.balanceChecker.checkBalances(this.wallet);
        this.log(`💰 USDC: $${balances.usdc.toFixed(2)}, MATIC: ${balances.matic.toFixed(4)}`);
        
        this.log('✅ 套利机器人初始化完成');
    }

    async start() {
        this.log('='.repeat(60));
        this.log('🚀 启动双边套利机器人');
        this.log('='.repeat(60));
        this.log(`钱包: ${this.wallet.address}`);
        this.log(`最小价差: ${this.minSpread}%`);
        this.log(`每边金额: $${this.tradeAmount}`);
        this.log(`扫描间隔: ${this.scanInterval}ms`);
        this.log(`最大滑点: ${this.maxSlippage}%`);
        this.log('='.repeat(60));

        // 检查余额
        const balances = await this.balanceChecker.checkBalances(this.wallet);
        this.balanceChecker.displayBalances(balances);

        const requiredUsdc = this.tradeAmount * 2;  // 两边都要买
        if (balances.usdc < requiredUsdc) {
            this.log(`❌ USDC 不足！需要至少 $${requiredUsdc}, 当前 $${balances.usdc.toFixed(2)}`);
            throw new Error('余额不足');
        }

        this.isRunning = true;
        this.stats.startTime = new Date();
        
        this.log('\n✅ 机器人启动成功！开始监控套利机会...\n');
        
        // 启动监控循环
        this.monitorLoop();
    }

    stop() {
        this.isRunning = false;
        this.log('⏹️ 机器人已停止');
    }

    getStats(): BotStats {
        return { ...this.stats };
    }

    // ============== 监控循环 ==============

    private async monitorLoop() {
        while (this.isRunning) {
            try {
                this.stats.totalScans++;
                
                // 获取活跃市场
                const markets = await this.fetchActiveMarkets();
                
                // 检查每个市场的套利机会
                for (const market of markets) {
                    if (!this.isRunning) break;
                    
                    const opportunity = await this.checkArbitrageOpportunity(market);
                    
                    // 检查是否满足最小价差 (做多看正价差，做空看负价差绝对值)
                    const spreadOk = Math.abs(opportunity?.spread || 0) >= this.minSpread;
                    
                    if (opportunity && spreadOk) {
                        this.stats.opportunitiesFound++;
                        this.stats.lastOpportunity = opportunity;
                        
                        // 套利类型标签
                        const arbType = opportunity.market.arbitrageType;
                        const typeLabel = arbType === ArbitrageType.LONG ? '📈 做多' : '📉 做空';
                        const marketTypeLabel = opportunity.market.marketType === MarketType.MULTI_OUTCOME 
                            ? '(多结果)' : '(二元)';
                        
                        this.log('\n' + '🎯'.repeat(30));
                        this.log(`🎯 发现套利机会！${typeLabel} ${marketTypeLabel}`);
                        this.log(`市场: ${opportunity.market.question}`);
                        this.log(`分类: ${opportunity.market.category}`);
                        
                        // 显示所有结果价格
                        if (opportunity.market.marketType === MarketType.MULTI_OUTCOME) {
                            opportunity.market.tokens.forEach(t => {
                                this.log(`  ${t.outcome}: $${t.price.toFixed(4)}`);
                            });
                        } else {
                            this.log(`YES 价格: $${opportunity.upPrice.toFixed(4)}`);
                            this.log(`NO 价格: $${opportunity.downPrice.toFixed(4)}`);
                        }
                        
                        this.log(`价格和: $${opportunity.priceSum.toFixed(4)}`);
                        this.log(`价差: ${opportunity.spread.toFixed(2)}%`);
                        this.log(`预期利润: $${opportunity.profit.toFixed(4)}`);
                        this.log('🎯'.repeat(30) + '\n');
                        
                        this.onOpportunity?.(opportunity);
                        
                        // 执行交易 (当前为模拟模式，不实际下单)
                        // await this.executeTrade(opportunity);
                        this.log('⚠️ 模拟模式：未实际执行交易');
                    }
                }
                
                // 更新统计
                this.onStatsUpdate?.(this.stats);
                
            } catch (error: any) {
                this.log(`❌ 监控错误: ${error.message}`);
            }
            
            // 等待下次扫描
            await new Promise(resolve => setTimeout(resolve, this.scanInterval));
        }
    }

    // ============== 市场数据获取 ==============

    // 延迟函数
    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async fetchActiveMarkets(): Promise<MarketInfo[]> {
        try {
            const result: MarketInfo[] = [];
            const pageSize = 500;  // Gamma API 单次最大返回 500
            let offset = 0;
            let hasMore = true;
            let totalFetched = 0;
            let opportunitiesPrefiltered = 0;

            this.log(`📊 开始扫描所有市场 (分页获取)...`);

            // 分页获取所有市场
            while (hasMore) {
                const response = await fetch(
                    `https://gamma-api.polymarket.com/markets?active=true&closed=false&limit=${pageSize}&offset=${offset}`,
                    {
                        headers: {
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                            'Accept': 'application/json'
                        }
                    }
                );
                
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }
                
                const data: any = await response.json();
                const markets = Array.isArray(data) ? data : (data.data || []);
                
                if (markets.length === 0) {
                    hasMore = false;
                    break;
                }

                totalFetched += markets.length;

                // 直接在 API 层过滤：只处理价格和 != 1 的市场
                for (const market of markets) {
                    try {
                        let outcomePrices = market.outcomePrices || [];
                        if (typeof outcomePrices === 'string') {
                            outcomePrices = JSON.parse(outcomePrices);
                        }

                        if (outcomePrices.length < 2) continue;

                        // 计算价格和
                        const priceSum = outcomePrices.reduce((sum: number, p: string) => sum + parseFloat(p), 0);
                        
                        // 只处理价格和偏离1的市场 (有套利可能)
                        // 阈值: 0.1% 偏离，即 |priceSum - 1| > 0.001
                        if (Math.abs(priceSum - 1) > 0.001) {
                            const marketInfo = await this.parseMarket(market);
                            if (marketInfo) {
                                result.push(marketInfo);
                                opportunitiesPrefiltered++;
                                
                                // 记录价格偏离市场到日志文件
                                const spread = (1 - priceSum) * 100;
                                const profit = priceSum < 1 
                                    ? this.tradeAmount * (1 - priceSum) / priceSum
                                    : this.tradeAmount * (priceSum - 1);
                                logOpportunityToFile(market, priceSum, spread, profit);
                            }
                        }
                    } catch (e) {
                        // 忽略单个市场解析错误
                    }
                }

                // 下一页
                offset += pageSize;
                
                // 每获取 2000 个市场打印一次进度
                if (totalFetched % 2000 === 0) {
                    this.log(`  📈 已扫描 ${totalFetched} 个市场，发现 ${opportunitiesPrefiltered} 个潜在机会...`);
                }

                // 小延迟避免 API 限速
                await this.delay(100);
            }

            this.log(`📊 扫描完成: 共 ${totalFetched} 个市场，${opportunitiesPrefiltered} 个价格偏离市场`);
            
            // 更新最后扫描统计
            this.lastScanStats = {
                totalMarkets: totalFetched,
                deviatedMarkets: opportunitiesPrefiltered,
                scanDurationMs: Date.now() - Date.now() // 将在调用方计算
            };
            
            // 记录扫描结果到日志文件
            const qualifiedOpportunities = result.filter(m => Math.abs(m.spread) >= this.minSpread).length;
            logScanResult(totalFetched, opportunitiesPrefiltered, qualifiedOpportunities);
            
            // 按套利机会排序 (价差绝对值越大越优先)
            result.sort((a, b) => Math.abs(b.spread) - Math.abs(a.spread));
            
            return result;
        } catch (error: any) {
            this.log(`获取市场数据失败: ${error.message}`);
            return [];
        }
    }

    private async parseMarket(market: any): Promise<MarketInfo | null> {
        try {
            let tokenIds = market.clobTokenIds || [];
            if (typeof tokenIds === 'string') {
                tokenIds = JSON.parse(tokenIds);
            }
            
            let outcomes = market.outcomes || [];
            if (typeof outcomes === 'string') {
                outcomes = JSON.parse(outcomes);
            }

            // 直接使用 Gamma API 返回的价格（更准确）
            let outcomePrices = market.outcomePrices || [];
            if (typeof outcomePrices === 'string') {
                outcomePrices = JSON.parse(outcomePrices);
            }

            if (tokenIds.length < 2) return null;
            if (outcomePrices.length < 2) return null;

            // 判断市场类型
            const marketType = tokenIds.length > 2 ? MarketType.MULTI_OUTCOME : MarketType.BINARY;

            // 使用 Gamma API 返回的价格
            const tokens: TokenInfo[] = [];
            for (let i = 0; i < tokenIds.length; i++) {
                const price = parseFloat(outcomePrices[i]) || 0;
                tokens.push({
                    tokenId: String(tokenIds[i]),
                    outcome: outcomes[i] || `选项${i + 1}`,
                    price: price
                });
            }

            // 计算价格和
            const priceSum = tokens.reduce((sum, t) => sum + t.price, 0);
            
            // 计算价差和套利类型
            // 正价差 = 做多机会 (价格和 < 1)
            const spread = (1 - priceSum) * 100;
            
            let arbitrageType = ArbitrageType.NONE;
            if (priceSum > 0 && priceSum < 1) {
                arbitrageType = ArbitrageType.LONG;  // 价格和 < 1，买入所有
            }

            // 找到 Yes 和 No 的索引
            let upIndex = outcomes.findIndex((o: string) => 
                o.toLowerCase().includes('up') || o.toLowerCase().includes('yes')
            );
            let downIndex = outcomes.findIndex((o: string) => 
                o.toLowerCase().includes('down') || o.toLowerCase().includes('no')
            );

            if (upIndex === -1) upIndex = 0;
            if (downIndex === -1) downIndex = 1;

            const upTokenId = String(tokenIds[upIndex]);
            const downTokenId = String(tokenIds[downIndex]);
            const upPrice = tokens[upIndex]?.price || 0;
            const downPrice = tokens[downIndex]?.price || 0;

            // 获取市场分类和流动性
            const category = market.category || market.tags?.[0] || 'Other';
            const liquidity = parseFloat(market.liquidity || market.volume24hr || '0');

            // 获取事件 slug（用于生成正确的 Polymarket 链接）
            // 优先使用 events[0].slug，否则使用市场的 slug
            let eventSlug = market.slug || '';
            if (market.events && market.events.length > 0 && market.events[0].slug) {
                eventSlug = market.events[0].slug;
            }

            return {
                conditionId: market.conditionId || '',
                question: market.question || '',
                slug: eventSlug,
                marketType,
                tokens,
                upTokenId,
                downTokenId,
                upPrice,
                downPrice,
                priceSum,
                spread,
                arbitrageType,
                liquidity,
                category
            };
        } catch (error) {
            return null;
        }
    }

    private async getTokenPrice(tokenId: string, retries = 3): Promise<number> {
        for (let i = 0; i < retries; i++) {
            try {
                const response = await fetch(
                    `https://clob.polymarket.com/book?token_id=${tokenId}`,
                    {
                        headers: {
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                            'Accept': 'application/json'
                        }
                    }
                );
                
                // 处理 API 限速
                if (response.status === 429) {
                    await this.delay((i + 1) * 1000);
                    continue;
                }
                
                if (!response.ok) return 0;
                
                const data: any = await response.json();
                
                const asks = data.asks || [];
                
                // 使用 best ask 价格（买入价格）
                if (asks.length > 0) {
                    return parseFloat(asks[0].price);
                }
                
                // 如果没有 ask，尝试用 bid
                const bids = data.bids || [];
                if (bids.length > 0) {
                    return parseFloat(bids[0].price);
                }
                
                return 0;
            } catch (error) {
                if (i === retries - 1) return 0;
                await this.delay(500);
            }
        }
        return 0;
    }

    // ============== 套利检测 (论文优化版) ==============

    /**
     * 检测套利机会
     * 
     * 论文策略:
     * 1. 做多 (Long): 价格和 < 1 时，买入所有结果
     *    - 利润 = 投入 × (1 - 价格和) / 价格和
     * 2. 做空 (Short): 价格和 > 1 时，卖出所有结果 (需要持仓)
     *    - 利润 = 投入 × (价格和 - 1)
     * 
     * 最小利润阈值: $0.02 (覆盖 gas 费)
     */
    async checkArbitrageOpportunity(market: MarketInfo): Promise<ArbitrageOpportunity | null> {
        try {
            // 对于多结果市场，重新获取所有价格
            if (market.marketType === MarketType.MULTI_OUTCOME) {
                return this.checkMultiOutcomeArbitrage(market);
            }

            // 二元市场: 重新获取最新价格
            const [upPrice, downPrice] = await Promise.all([
                this.getTokenPrice(market.upTokenId),
                this.getTokenPrice(market.downTokenId)
            ]);

            if (upPrice <= 0 || downPrice <= 0) return null;

            const priceSum = upPrice + downPrice;
            const spread = (1 - priceSum) * 100;
            
            // 判断套利类型
            let arbitrageType = ArbitrageType.NONE;
            let profit = 0;
            const totalInvestment = this.tradeAmount * 2;

            if (priceSum < 1) {
                // 做多策略: 买入所有结果
                // 利润 = 投入 × (1 - 价格和) / 价格和
                arbitrageType = ArbitrageType.LONG;
                profit = totalInvestment * (1 - priceSum) / priceSum;
            } else if (priceSum > 1) {
                // 做空策略: 卖出所有结果 (需要已持有)
                // 利润 = 投入 × (价格和 - 1)
                arbitrageType = ArbitrageType.SHORT;
                profit = totalInvestment * (priceSum - 1);
            }

            // 论文建议: 最小利润 $0.02
            const minProfit = parseFloat(process.env.ARB_MIN_PROFIT || '0.02');
            
            // 检查是否满足最小价差和最小利润
            if (Math.abs(spread) >= this.minSpread && profit >= minProfit) {
                return {
                    market: { 
                        ...market, 
                        upPrice, 
                        downPrice, 
                        priceSum, 
                        spread,
                        arbitrageType
                    },
                    upPrice,
                    downPrice,
                    priceSum,
                    spread,
                    profit,
                    timestamp: new Date()
                };
            }

            return null;
        } catch (error) {
            return null;
        }
    }

    /**
     * 多结果市场套利检测 (NegRisk)
     * 
     * 论文指出: 多条件市场 (如选举预测) 往往有更多套利机会
     * 所有结果的 YES 价格和应等于 1
     */
    private async checkMultiOutcomeArbitrage(market: MarketInfo): Promise<ArbitrageOpportunity | null> {
        try {
            // 重新获取所有 token 价格
            const pricePromises = market.tokens.map(t => this.getTokenPrice(t.tokenId));
            const prices = await Promise.all(pricePromises);
            
            // 更新价格
            const updatedTokens = market.tokens.map((t, i) => ({ ...t, price: prices[i] }));
            const priceSum = prices.reduce((sum, p) => sum + p, 0);
            const spread = (1 - priceSum) * 100;
            
            // 计算利润
            const totalInvestment = this.tradeAmount * market.tokens.length;
            let profit = 0;
            let arbitrageType = ArbitrageType.NONE;

            if (priceSum < 1) {
                arbitrageType = ArbitrageType.LONG;
                profit = totalInvestment * (1 - priceSum) / priceSum;
            } else if (priceSum > 1) {
                arbitrageType = ArbitrageType.SHORT;
                profit = totalInvestment * (priceSum - 1);
            }

            const minProfit = parseFloat(process.env.ARB_MIN_PROFIT || '0.02');
            
            if (Math.abs(spread) >= this.minSpread && profit >= minProfit) {
                // 使用第一个和最后一个 token 作为 up/down 兼容
                const upPrice = prices[0];
                const downPrice = prices[prices.length - 1];
                
                return {
                    market: { 
                        ...market,
                        tokens: updatedTokens,
                        upPrice,
                        downPrice,
                        priceSum, 
                        spread,
                        arbitrageType
                    },
                    upPrice,
                    downPrice,
                    priceSum,
                    spread,
                    profit,
                    timestamp: new Date()
                };
            }

            return null;
        } catch (error) {
            return null;
        }
    }

    // ============== 交易执行 (论文优化版) ==============

    /**
     * 执行套利交易
     * 
     * 根据套利类型选择策略:
     * - LONG: 买入所有结果 (价格和 < 1)
     * - SHORT: 卖出所有结果 (价格和 > 1，需要持仓)
     */
    private async executeTrade(opportunity: ArbitrageOpportunity): Promise<TradeResult> {
        const arbType = opportunity.market.arbitrageType;
        const side = arbType === ArbitrageType.LONG ? Side.BUY : Side.SELL;
        const actionText = arbType === ArbitrageType.LONG ? '买入' : '卖出';
        
        this.log(`📊 执行${arbType === ArbitrageType.LONG ? '做多' : '做空'}套利交易...`);
        this.log(`策略: ${actionText}所有结果`);
        
        try {
            // 多结果市场处理
            if (opportunity.market.marketType === MarketType.MULTI_OUTCOME) {
                return this.executeMultiOutcomeTrade(opportunity, side);
            }

            // 二元市场处理
            const upShares = this.tradeAmount / opportunity.upPrice;
            const downShares = this.tradeAmount / opportunity.downPrice;

            // 添加滑点保护
            const slippageMultiplier = arbType === ArbitrageType.LONG 
                ? (1 + this.maxSlippage / 100)  // 买入时价格上限
                : (1 - this.maxSlippage / 100); // 卖出时价格下限
            
            const upPriceWithSlippage = opportunity.upPrice * slippageMultiplier;
            const downPriceWithSlippage = opportunity.downPrice * slippageMultiplier;

            this.log(`💰 ${actionText} YES: ${upShares.toFixed(4)} 份 @ $${opportunity.upPrice.toFixed(4)}`);
            this.log(`💰 ${actionText} NO: ${downShares.toFixed(4)} 份 @ $${opportunity.downPrice.toFixed(4)}`);

            // 同时下两个订单 (Promise.all 确保并行执行)
            const [upResult, downResult] = await Promise.all([
                this.client.createAndPostOrder(
                    {
                        tokenID: opportunity.market.upTokenId,
                        price: upPriceWithSlippage,
                        size: upShares,
                        side: side
                    },
                    { tickSize: '0.001', negRisk: false },
                    OrderType.GTC
                ),
                this.client.createAndPostOrder(
                    {
                        tokenID: opportunity.market.downTokenId,
                        price: downPriceWithSlippage,
                        size: downShares,
                        side: side
                    },
                    { tickSize: '0.001', negRisk: false },
                    OrderType.GTC
                )
            ]);

            const result: TradeResult = {
                success: true,
                upOrderId: upResult.orderID,
                downOrderId: downResult.orderID,
                upPrice: opportunity.upPrice,
                downPrice: opportunity.downPrice,
                totalCost: this.tradeAmount * 2,
                expectedProfit: opportunity.profit
            };

            this.stats.tradesExecuted++;
            this.stats.totalProfit += opportunity.profit;

            this.log(`✅ YES 订单: ${upResult.orderID}`);
            this.log(`✅ NO 订单: ${downResult.orderID}`);
            this.log(`💵 预期利润: $${opportunity.profit.toFixed(4)}`);

            this.onTrade?.(result);
            return result;

        } catch (error: any) {
            const result: TradeResult = {
                success: false,
                upPrice: opportunity.upPrice,
                downPrice: opportunity.downPrice,
                totalCost: 0,
                expectedProfit: 0,
                error: error.message
            };

            this.log(`❌ 交易失败: ${error.message}`);
            this.onTrade?.(result);
            return result;
        }
    }

    /**
     * 多结果市场交易执行
     * 
     * 同时买入/卖出所有结果
     */
    private async executeMultiOutcomeTrade(
        opportunity: ArbitrageOpportunity, 
        side: Side
    ): Promise<TradeResult> {
        const actionText = side === Side.BUY ? '买入' : '卖出';
        const tokens = opportunity.market.tokens;
        
        this.log(`📊 多结果市场: ${tokens.length} 个选项`);
        
        try {
            // 为每个 token 创建订单
            const orderPromises = tokens.map(token => {
                const shares = this.tradeAmount / token.price;
                const slippageMultiplier = side === Side.BUY 
                    ? (1 + this.maxSlippage / 100) 
                    : (1 - this.maxSlippage / 100);
                const priceWithSlippage = token.price * slippageMultiplier;
                
                this.log(`💰 ${actionText} ${token.outcome}: ${shares.toFixed(4)} 份 @ $${token.price.toFixed(4)}`);
                
                return this.client.createAndPostOrder(
                    {
                        tokenID: token.tokenId,
                        price: priceWithSlippage,
                        size: shares,
                        side: side
                    },
                    { tickSize: '0.001', negRisk: true },  // 多结果市场使用 negRisk
                    OrderType.GTC
                );
            });

            const results = await Promise.all(orderPromises);
            
            const result: TradeResult = {
                success: true,
                upOrderId: results[0]?.orderID,
                downOrderId: results[results.length - 1]?.orderID,
                upPrice: tokens[0].price,
                downPrice: tokens[tokens.length - 1].price,
                totalCost: this.tradeAmount * tokens.length,
                expectedProfit: opportunity.profit
            };

            this.stats.tradesExecuted++;
            this.stats.totalProfit += opportunity.profit;

            results.forEach((r, i) => {
                this.log(`✅ ${tokens[i].outcome} 订单: ${r.orderID}`);
            });
            this.log(`💵 预期利润: $${opportunity.profit.toFixed(4)}`);

            this.onTrade?.(result);
            return result;

        } catch (error: any) {
            const result: TradeResult = {
                success: false,
                upPrice: tokens[0]?.price || 0,
                downPrice: tokens[tokens.length - 1]?.price || 0,
                totalCost: 0,
                expectedProfit: 0,
                error: error.message
            };

            this.log(`❌ 多结果交易失败: ${error.message}`);
            this.onTrade?.(result);
            return result;
        }
    }
}

// ============== 主程序入口 ==============

async function main() {
    const bot = new ArbitrageBot();
    
    process.on('SIGINT', () => {
        console.log('\n正在关闭...');
        bot.stop();
        process.exit(0);
    });

    await bot.start();
}

// 如果直接运行此文件
if (require.main === module) {
    main().catch(console.error);
}
