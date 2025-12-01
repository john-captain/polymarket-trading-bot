/**
 * 套利策略测试脚本
 * 
 * 用途：命令行独立运行，测试市场数据获取和套利机会检测
 * 运行：npx ts-node src/test_arbitrage.ts
 * 
 * 功能：
 * 1. 获取活跃市场
 * 2. 计算价格和与价差
 * 3. 检测套利机会（做多/做空）
 * 4. 模拟下单（不实际执行）
 * 5. 记录价格偏离市场到日志文件
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

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

// ============== 类型定义 ==============

enum ArbitrageType {
    LONG = 'LONG',       // 做多: 价格和 < 1
    SHORT = 'SHORT',     // 做空: 价格和 > 1
    NONE = 'NONE'
}

enum MarketType {
    BINARY = 'BINARY',
    MULTI_OUTCOME = 'MULTI_OUTCOME'
}

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
    tokens: TokenInfo[];
    priceSum: number;
    spread: number;
    arbitrageType: ArbitrageType;
    category: string;
}

// ============== 工具函数 ==============

function log(message: string) {
    const timestamp = new Date().toLocaleString('zh-CN');
    console.log(`[${timestamp}] ${message}`);
}

function logSection(title: string) {
    console.log('\n' + '='.repeat(60));
    console.log(`  ${title}`);
    console.log('='.repeat(60));
}

// 延迟函数
const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

// ============== API 调用 ==============

async function fetchWithRetry(url: string, retries = 3): Promise<any> {
    for (let i = 0; i < retries; i++) {
        try {
            const response = await fetch(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Accept': 'application/json'
                }
            });
            
            if (response.status === 429) {
                log(`⏳ API 限速，等待 ${(i + 1) * 2} 秒...`);
                await delay((i + 1) * 2000);
                continue;
            }
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            
            return await response.json();
        } catch (error: any) {
            if (i === retries - 1) throw error;
            await delay(1000);
        }
    }
    throw new Error('请求失败');
}

/**
 * 获取 token 的最佳买入价格 (best ask)
 */
async function getTokenPrice(tokenId: string): Promise<{ ask: number; bid: number }> {
    try {
        // 添加小延迟避免限速
        await delay(100);
        const data = await fetchWithRetry(`https://clob.polymarket.com/book?token_id=${tokenId}`);
        
        const asks = data.asks || [];
        const bids = data.bids || [];
        
        const ask = asks.length > 0 ? parseFloat(asks[0].price) : 0;
        const bid = bids.length > 0 ? parseFloat(bids[0].price) : 0;
        
        return { ask, bid };
    } catch (error) {
        return { ask: 0, bid: 0 };
    }
}

/**
 * 获取活跃市场列表 - 全量扫描所有市场
 */
async function fetchActiveMarkets(limit = 50): Promise<MarketInfo[]> {
    log(`📡 正在全量扫描所有活跃市场...`);
    
    const tradeAmount = parseFloat(process.env.ARB_TRADE_AMOUNT || '10');
    
    try {
        const result: MarketInfo[] = [];
        const pageSize = 500;  // Gamma API 单次最大返回 500
        let offset = 0;
        let hasMore = true;
        let totalFetched = 0;
        let opportunitiesPrefiltered = 0;

        // 分页获取所有市场
        while (hasMore) {
            const data = await fetchWithRetry(
                `https://gamma-api.polymarket.com/markets?active=true&closed=false&limit=${pageSize}&offset=${offset}`
            );
            
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
                        const marketInfo = await parseMarket(market);
                        if (marketInfo) {
                            result.push(marketInfo);
                            opportunitiesPrefiltered++;
                            
                            // 记录价格偏离市场到日志文件
                            const spread = (1 - priceSum) * 100;
                            const profit = priceSum < 1 
                                ? tradeAmount * (1 - priceSum) / priceSum
                                : tradeAmount * (priceSum - 1);
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
                log(`  📈 已扫描 ${totalFetched} 个市场，发现 ${opportunitiesPrefiltered} 个潜在机会...`);
            }

            // 小延迟避免 API 限速
            await delay(100);
        }

        log(`📊 扫描完成: 共 ${totalFetched} 个市场，${opportunitiesPrefiltered} 个价格偏离市场`);
        
        // 记录扫描结果到日志文件
        const minSpread = parseFloat(process.env.ARB_MIN_SPREAD || '1.0');
        const qualifiedOpportunities = result.filter(m => Math.abs(m.spread) >= minSpread).length;
        logScanResult(totalFetched, opportunitiesPrefiltered, qualifiedOpportunities);
        
        // 按价差绝对值排序
        result.sort((a, b) => Math.abs(b.spread) - Math.abs(a.spread));
        
        return result;
    } catch (error: any) {
        log(`❌ 获取市场失败: ${error.message}`);
        return [];
    }
}

/**
 * 解析市场数据 - 使用 Gamma API 的 outcomePrices
 */
async function parseMarket(market: any): Promise<MarketInfo | null> {
    try {
        let tokenIds = market.clobTokenIds || [];
        if (typeof tokenIds === 'string') {
            tokenIds = JSON.parse(tokenIds);
        }
        
        let outcomes = market.outcomes || [];
        if (typeof outcomes === 'string') {
            outcomes = JSON.parse(outcomes);
        }

        // 使用 Gamma API 返回的价格（更准确）
        let outcomePrices = market.outcomePrices || [];
        if (typeof outcomePrices === 'string') {
            outcomePrices = JSON.parse(outcomePrices);
        }

        if (tokenIds.length < 2) return null;
        if (outcomePrices.length < 2) return null;

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
        
        // 价差: 正=做多机会, 负=做空机会
        const spread = (1 - priceSum) * 100;
        
        // 判断套利类型
        let arbitrageType = ArbitrageType.NONE;
        if (priceSum > 0 && priceSum < 1) {
            arbitrageType = ArbitrageType.LONG;
        } else if (priceSum > 1) {
            arbitrageType = ArbitrageType.SHORT;
        }

        const category = market.category || market.tags?.[0] || 'Other';

        return {
            conditionId: market.conditionId || '',
            question: market.question || '',
            slug: market.slug || '',
            marketType,
            tokens,
            priceSum,
            spread,
            arbitrageType,
            category
        };
    } catch (error) {
        return null;
    }
}

/**
 * 计算预期利润
 */
function calculateProfit(market: MarketInfo, tradeAmount: number): number {
    const totalInvestment = tradeAmount * market.tokens.length;
    
    if (market.arbitrageType === ArbitrageType.LONG) {
        // 做多利润 = 投入 × (1 - 价格和) / 价格和
        return totalInvestment * (1 - market.priceSum) / market.priceSum;
    } else if (market.arbitrageType === ArbitrageType.SHORT) {
        // 做空利润 = 投入 × (价格和 - 1)
        return totalInvestment * (market.priceSum - 1);
    }
    
    return 0;
}

/**
 * 模拟下单
 */
function simulateTrade(market: MarketInfo, tradeAmount: number) {
    const profit = calculateProfit(market, tradeAmount);
    const arbTypeText = market.arbitrageType === ArbitrageType.LONG ? '📈 做多' : '📉 做空';
    const action = market.arbitrageType === ArbitrageType.LONG ? '买入' : '卖出';
    
    console.log('\n' + '🎯'.repeat(25));
    console.log(`\n${arbTypeText} 模拟交易`);
    console.log(`市场: ${market.question}`);
    console.log(`类型: ${market.marketType}`);
    console.log(`分类: ${market.category}`);
    console.log(`\n📊 价格详情:`);
    
    market.tokens.forEach(t => {
        const shares = tradeAmount / t.price;
        console.log(`  ${t.outcome}: $${t.price.toFixed(4)} → ${action} ${shares.toFixed(2)} 份 ($${tradeAmount})`);
    });
    
    console.log(`\n💰 交易统计:`);
    console.log(`  价格和: $${market.priceSum.toFixed(4)}`);
    console.log(`  价差: ${market.spread.toFixed(2)}%`);
    console.log(`  总投入: $${(tradeAmount * market.tokens.length).toFixed(2)}`);
    console.log(`  预期利润: $${profit.toFixed(4)}`);
    console.log('\n' + '🎯'.repeat(25));
}

// ============== 主函数 ==============

async function main() {
    logSection('Polymarket 套利策略测试');
    
    log('📋 配置参数:');
    const minSpread = parseFloat(process.env.ARB_MIN_SPREAD || '1.0');
    const minProfit = parseFloat(process.env.ARB_MIN_PROFIT || '0.02');
    const tradeAmount = parseFloat(process.env.ARB_TRADE_AMOUNT || '10.0');
    
    console.log(`  最小价差: ${minSpread}%`);
    console.log(`  最小利润: $${minProfit}`);
    console.log(`  每边金额: $${tradeAmount}`);
    
    // 获取市场
    logSection('获取活跃市场');
    const markets = await fetchActiveMarkets(100);
    
    if (markets.length === 0) {
        log('❌ 未获取到任何市场数据');
        return;
    }
    
    // 显示前 20 个市场的价差
    logSection('市场价差排行 (前20)');
    console.log('\n序号 | 价差% | 价格和 | 类型 | 市场');
    console.log('-'.repeat(80));
    
    markets.slice(0, 20).forEach((m, i) => {
        const typeIcon = m.arbitrageType === ArbitrageType.LONG ? '📈' : 
                        m.arbitrageType === ArbitrageType.SHORT ? '📉' : '➖';
        const spreadStr = m.spread.toFixed(2).padStart(6);
        const sumStr = m.priceSum.toFixed(4);
        const question = m.question.length > 40 ? m.question.substring(0, 40) + '...' : m.question;
        console.log(`${String(i + 1).padStart(2)}   | ${spreadStr} | ${sumStr} | ${typeIcon} | ${question}`);
    });
    
    // 检测套利机会
    logSection('套利机会检测');
    
    const opportunities = markets.filter(m => {
        if (m.arbitrageType === ArbitrageType.NONE) return false;
        if (Math.abs(m.spread) < minSpread) return false;
        
        const profit = calculateProfit(m, tradeAmount);
        return profit >= minProfit;
    });
    
    log(`\n🔍 符合条件的套利机会: ${opportunities.length} 个`);
    log(`   (价差 >= ${minSpread}%, 利润 >= $${minProfit})`);
    
    if (opportunities.length === 0) {
        log('\n⚠️ 当前没有符合条件的套利机会');
        log('   这是正常的，说明市场效率较高');
        
        // 显示最接近的机会
        logSection('最接近阈值的市场 (Top 5)');
        
        const nearMiss = markets
            .filter(m => m.priceSum > 0 && m.priceSum !== 1)
            .slice(0, 5);
        
        nearMiss.forEach((m, i) => {
            const profit = calculateProfit(m, tradeAmount);
            console.log(`\n${i + 1}. ${m.question}`);
            console.log(`   价格和: $${m.priceSum.toFixed(4)}, 价差: ${m.spread.toFixed(2)}%`);
            console.log(`   预期利润: $${profit.toFixed(4)}`);
            m.tokens.forEach(t => {
                console.log(`   - ${t.outcome}: $${t.price.toFixed(4)}`);
            });
        });
    } else {
        // 模拟前 3 个机会
        logSection('模拟交易演示');
        
        opportunities.slice(0, 3).forEach(m => {
            simulateTrade(m, tradeAmount);
        });
    }
    
    // 统计信息
    logSection('市场统计');
    
    const stats = {
        total: markets.length,
        binary: markets.filter(m => m.marketType === MarketType.BINARY).length,
        multiOutcome: markets.filter(m => m.marketType === MarketType.MULTI_OUTCOME).length,
        longOpps: markets.filter(m => m.arbitrageType === ArbitrageType.LONG).length,
        shortOpps: markets.filter(m => m.arbitrageType === ArbitrageType.SHORT).length,
        avgSpread: markets.reduce((sum, m) => sum + m.spread, 0) / markets.length
    };
    
    console.log(`\n📊 市场类型:`);
    console.log(`  二元市场: ${stats.binary}`);
    console.log(`  多结果市场: ${stats.multiOutcome}`);
    console.log(`\n📈 套利方向:`);
    console.log(`  做多机会 (价格和<1): ${stats.longOpps}`);
    console.log(`  做空机会 (价格和>1): ${stats.shortOpps}`);
    console.log(`\n📉 价差统计:`);
    console.log(`  平均价差: ${stats.avgSpread.toFixed(2)}%`);
    
    logSection('测试完成');
    log('✅ 所有数据已输出，未执行实际交易');
}

// 运行
main().catch(error => {
    console.error('❌ 程序错误:', error);
    process.exit(1);
});
