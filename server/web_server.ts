/**
 * Web 服务器 - 提供简洁的交易界面
 */
import express, { Request, Response } from 'express';
import path from 'path';
import { Wallet } from '@ethersproject/wallet';
import { BalanceChecker } from './balance_checker';
import { MarketFinder } from './market_finder';
import { BinanceOracle } from './binance_oracle';
import { ArbitrageBot } from './arbitrage_bot';
import * as dotenv from 'dotenv';
import * as db from './db';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const app = express();
const PORT = process.env.WEB_PORT || 3000;

// 中间件
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// 全局状态
let wallet: Wallet;
let balanceChecker: BalanceChecker;
let marketFinder: MarketFinder;
let binanceOracle: BinanceOracle;
let arbitrageBot: ArbitrageBot;
let botStatus = {
    isRunning: false,
    startTime: null as Date | null,
    tradesCount: 0,
    lastTrade: null as Date | null
};
let currentPrices = {
    btc: 0,
    up: 0.5,
    down: 0.5
};
let currentMarket: any = null;
let logs: string[] = [];

// 套利机器人状态
let arbitrageStatus = {
    isRunning: false,
    startTime: null as Date | null,
    scanCount: 0,
    opportunityCount: 0,
    tradeCount: 0,
    totalProfit: 0
};
let arbitrageLogs: string[] = [];
let arbitrageMarkets: any[] = [];
let lastOpportunity: any = null;
let isScanning = false;  // 扫描锁，防止并发扫描

// 套利设置
let arbitrageSettings = {
    minSpread: parseFloat(process.env.ARB_MIN_SPREAD || '1.0'),
    tradeAmount: parseFloat(process.env.ARB_TRADE_AMOUNT || '10.0'),
    scanInterval: parseInt(process.env.ARB_SCAN_INTERVAL || '60000'),  // 默认 60 秒（扫描需要时间）
    autoTrade: false
};

// 设置
let settings = {
    tradeAmount: parseFloat(process.env.DEFAULT_TRADE_AMOUNT || '5.0'),
    takeProfit: parseFloat(process.env.TAKE_PROFIT_AMOUNT || '0.01'),
    stopLoss: parseFloat(process.env.STOP_LOSS_AMOUNT || '0.005'),
    threshold: parseFloat(process.env.PRICE_DIFFERENCE_THRESHOLD || '0.015'),
    cooldown: parseInt(process.env.TRADE_COOLDOWN || '30')
};

// 添加套利日志
function addArbitrageLog(message: string) {
    const timestamp = new Date().toLocaleString('zh-CN');
    const logEntry = `[${timestamp}] ${message}`;
    arbitrageLogs.unshift(logEntry);
    if (arbitrageLogs.length > 100) arbitrageLogs.pop();
    console.log(`[套利] ${logEntry}`);
}

// 添加日志
function addLog(message: string) {
    const timestamp = new Date().toLocaleString('zh-CN');
    const logEntry = `[${timestamp}] ${message}`;
    logs.unshift(logEntry);
    if (logs.length > 100) logs.pop();
    console.log(logEntry);
}

// 初始化
async function initialize() {
    addLog('🚀 Web 服务器初始化中...');
    
    // 初始化数据库
    try {
        await db.initDatabase();
        addLog('✅ MySQL 数据库连接成功');
    } catch (error: any) {
        addLog(`⚠️ MySQL 数据库连接失败: ${error.message}`);
    }
    
    // 初始化钱包
    const privateKey = process.env.PRIVATE_KEY;
    if (!privateKey) {
        addLog('❌ 未找到 PRIVATE_KEY');
        return;
    }
    wallet = new Wallet(privateKey);
    addLog(`💰 钱包地址: ${wallet.address.slice(0, 10)}...`);
    
    balanceChecker = new BalanceChecker();
    marketFinder = new MarketFinder();
    binanceOracle = new BinanceOracle();
    
    // 设置 Binance 预言机回调
    binanceOracle.onPrice((prices) => {
        currentPrices.up = prices.UP;
        currentPrices.down = prices.DOWN;
    });
    
    // 连接 Binance
    binanceOracle.connect();
    
    // 获取初始市场信息
    try {
        currentMarket = await marketFinder.findCurrentBitcoinMarket();
        addLog(`✅ 找到市场: ${currentMarket?.question || '未知'}`);
    } catch (error) {
        addLog('⚠️ 暂时无法获取市场信息');
    }
    
    addLog('✅ 初始化完成');
}

// ============== API 路由 ==============

// 获取余额
app.get('/api/balance', async (req: Request, res: Response) => {
    try {
        if (!wallet) {
            res.json({ success: false, error: '钱包未初始化' });
            return;
        }
        const balance = await balanceChecker.checkBalances(wallet);
        res.json({
            success: true,
            data: {
                usdc: balance.usdc,
                matic: balance.matic,
                address: balance.address
            }
        });
    } catch (error: any) {
        addLog(`❌ 获取余额失败: ${error.message}`);
        res.json({ success: false, error: error.message });
    }
});

// 获取市场信息
app.get('/api/market', async (req: Request, res: Response) => {
    try {
        if (!currentMarket) {
            currentMarket = await marketFinder.findCurrentBitcoinMarket();
        }
        res.json({
            success: true,
            data: {
                question: currentMarket?.question || '未找到市场',
                upToken: currentMarket?.upTokenId || '',
                downToken: currentMarket?.downTokenId || '',
                conditionId: currentMarket?.conditionId || ''
            }
        });
    } catch (error: any) {
        addLog(`❌ 获取市场失败: ${error.message}`);
        res.json({ success: false, error: error.message });
    }
});

// 获取实时价格
app.get('/api/prices', (req: Request, res: Response) => {
    res.json({
        success: true,
        data: {
            btc: currentPrices.btc,
            up: currentPrices.up,
            down: currentPrices.down,
            hourlyOpen: binanceOracle.getHourlyOpen()
        }
    });
});

// 获取机器人状态
app.get('/api/bot/status', (req: Request, res: Response) => {
    res.json({
        success: true,
        data: {
            isRunning: botStatus.isRunning,
            startTime: botStatus.startTime,
            tradesCount: botStatus.tradesCount,
            lastTrade: botStatus.lastTrade
        }
    });
});

// 启动机器人
app.post('/api/bot/start', (req: Request, res: Response) => {
    if (botStatus.isRunning) {
        res.json({ success: false, error: '机器人已在运行' });
        return;
    }
    
    botStatus.isRunning = true;
    botStatus.startTime = new Date();
    addLog('🤖 自动交易机器人已启动');
    
    res.json({ success: true, message: '机器人已启动' });
});

// 停止机器人
app.post('/api/bot/stop', (req: Request, res: Response) => {
    if (!botStatus.isRunning) {
        res.json({ success: false, error: '机器人未在运行' });
        return;
    }
    
    botStatus.isRunning = false;
    addLog('⏹️ 自动交易机器人已停止');
    
    res.json({ success: true, message: '机器人已停止' });
});

// 获取设置
app.get('/api/settings', (req: Request, res: Response) => {
    res.json({
        success: true,
        data: settings
    });
});

// 保存设置
app.post('/api/settings', (req: Request, res: Response) => {
    const { tradeAmount, takeProfit, stopLoss, threshold, cooldown } = req.body;
    
    if (tradeAmount !== undefined) settings.tradeAmount = parseFloat(tradeAmount);
    if (takeProfit !== undefined) settings.takeProfit = parseFloat(takeProfit);
    if (stopLoss !== undefined) settings.stopLoss = parseFloat(stopLoss);
    if (threshold !== undefined) settings.threshold = parseFloat(threshold);
    if (cooldown !== undefined) settings.cooldown = parseInt(cooldown);
    
    addLog(`⚙️ 设置已更新: 金额=$${settings.tradeAmount}, 止盈=$${settings.takeProfit}, 止损=$${settings.stopLoss}`);
    
    res.json({ success: true, data: settings });
});

// 获取日志
app.get('/api/logs', (req: Request, res: Response) => {
    res.json({
        success: true,
        data: logs.slice(0, 50)
    });
});

// 刷新市场
app.post('/api/market/refresh', async (req: Request, res: Response) => {
    try {
        currentMarket = await marketFinder.findCurrentBitcoinMarket();
        addLog(`🔄 市场已刷新: ${currentMarket?.question || '未知'}`);
        res.json({ success: true, data: currentMarket });
    } catch (error: any) {
        res.json({ success: false, error: error.message });
    }
});

// ============== 套利 API 路由 ==============

// 套利页面
app.get('/arbitrage', (req: Request, res: Response) => {
    res.sendFile(path.join(__dirname, '../public/arbitrage.html'));
});

// 获取套利统计（从数据库）
app.get('/api/arbitrage/stats', async (req: Request, res: Response) => {
    try {
        // 从数据库获取累计统计
        const scanStats = await db.getScanStats();
        const tradeStats = await db.getTradeStats();
        
        // 获取最近一次扫描的市场数
        const recentScans = await db.getScanHistory(1);
        const lastScanMarkets = recentScans.length > 0 ? recentScans[0].total_markets : 0;
        
        res.json({
            success: true,
            data: {
                isRunning: arbitrageStatus.isRunning,
                startTime: arbitrageStatus.startTime,
                // 从数据库获取累计数据
                scanCount: scanStats.totalScans,
                opportunityCount: scanStats.totalOpportunities,
                tradeCount: tradeStats.totalTrades,
                totalProfit: tradeStats.totalProfit,
                // 额外数据
                totalMarkets: lastScanMarkets,
                deviatedMarkets: Math.round(scanStats.avgDeviatedMarkets),
                lastScanTime: scanStats.lastScanTime
            }
        });
    } catch (error: any) {
        // 如果数据库查询失败，返回内存中的数据
        res.json({
            success: true,
            data: {
                isRunning: arbitrageStatus.isRunning,
                startTime: arbitrageStatus.startTime,
                scanCount: arbitrageStatus.scanCount,
                opportunityCount: arbitrageStatus.opportunityCount,
                tradeCount: arbitrageStatus.tradeCount,
                totalProfit: arbitrageStatus.totalProfit,
                totalMarkets: 0,
                deviatedMarkets: 0
            }
        });
    }
});

// 获取套利市场列表（从数据库获取）
app.get('/api/arbitrage/markets', async (req: Request, res: Response) => {
    try {
        // 从数据库获取最新扫描的价格偏离市场
        const dbMarkets = await db.getLatestDeviationMarkets(15);
        
        // 转换为前端需要的格式
        const markets = dbMarkets.map(m => ({
            question: m.market_question,
            slug: m.market_slug,
            conditionId: m.condition_id,
            upPrice: parseFloat(String(m.yes_price)) || 0,
            downPrice: parseFloat(String(m.no_price)) || 0,
            priceSum: parseFloat(String(m.price_sum)) || 0,
            spread: parseFloat(String(m.spread)) || 0,
            deviationType: m.deviation_type
        }));
        
        res.json({
            success: true,
            data: markets
        });
    } catch (error: any) {
        console.error('获取市场数据失败:', error.message);
        // 如果数据库失败，回退到内存数据
        res.json({
            success: true,
            data: arbitrageMarkets
        });
    }
});

// 获取最新套利机会
app.get('/api/arbitrage/opportunity', (req: Request, res: Response) => {
    res.json({
        success: true,
        data: lastOpportunity
    });
});

// 启动套利扫描
let arbitrageScanInterval: NodeJS.Timeout | null = null;

app.post('/api/arbitrage/start', async (req: Request, res: Response) => {
    if (arbitrageStatus.isRunning) {
        res.json({ success: false, error: '套利扫描已在运行' });
        return;
    }
    
    try {
        // 初始化套利机器人（如果还没有）
        if (!arbitrageBot) {
            arbitrageBot = new ArbitrageBot();
            await arbitrageBot.initialize();
        }
        
        arbitrageStatus.isRunning = true;
        arbitrageStatus.startTime = new Date();
        addArbitrageLog('🚀 套利扫描已启动');
        
        // 确保扫描间隔不要太短（全量扫描需要 50-70 秒，间隔至少 90 秒）
        const actualInterval = Math.max(arbitrageSettings.scanInterval, 90000);
        addArbitrageLog(`⏱️ 扫描间隔: ${actualInterval}ms`);
        
        // 立即执行第一次扫描
        scanMarketsOnce();
        
        // 开始定期扫描
        arbitrageScanInterval = setInterval(scanMarketsOnce, actualInterval);
        
        res.json({ success: true, message: '套利扫描已启动' });
    } catch (error: any) {
        addArbitrageLog(`❌ 启动失败: ${error.message}`);
        res.json({ success: false, error: error.message });
    }
});

// 单次扫描函数
async function scanMarketsOnce() {
    if (!arbitrageStatus.isRunning) return;
    
    // 防止并发扫描
    if (isScanning) {
        addArbitrageLog(`⏳ 上一次扫描还在进行中，跳过本次`);
        return;
    }
    
    isScanning = true;
    const scanStartTime = Date.now();
    
    try {
        arbitrageStatus.scanCount++;
        
        // 获取市场列表
        const markets = await arbitrageBot.fetchActiveMarkets();
        const { totalMarkets, deviatedMarkets } = arbitrageBot.lastScanStats;
        addArbitrageLog(`📊 获取到 ${markets.length} 个价格偏离市场 (共扫描 ${totalMarkets} 个)`);
        
        // 即使没有偏离市场也保存扫描记录
        const scanDuration = Date.now() - scanStartTime;
        
        if (markets.length === 0) {
            // 保存扫描历史（无偏离市场）
            try {
                const scanId = await db.saveScanHistory({
                    total_markets: totalMarkets,
                    deviated_markets: 0,
                    opportunities_found: 0,
                    scan_duration_ms: scanDuration
                });
                addArbitrageLog(`💾 扫描记录已保存 (ID: ${scanId}, 无套利机会)`);
            } catch (dbError: any) {
                addArbitrageLog(`⚠️ 保存扫描历史失败: ${dbError.message}`);
            }
            return;
        }
        
        const newMarkets: any[] = [];
        const deviationMarkets: db.PriceDeviationMarket[] = [];
        let opportunitiesFound = 0;
        
        for (const market of markets.slice(0, 20)) {
            if (market.upPrice > 0 && market.downPrice > 0) {
                const marketData = {
                    question: market.question,
                    upPrice: market.upPrice,
                    downPrice: market.downPrice,
                    priceSum: market.priceSum,
                    spread: market.spread,
                    slug: market.slug || '',
                    conditionId: market.conditionId || '',
                    timestamp: new Date()
                };
                newMarkets.push(marketData);
                
                // 记录价格偏离市场
                if (Math.abs(market.spread) > 0.1) {
                    deviationMarkets.push({
                        market_question: market.question,
                        market_slug: market.slug || '',
                        condition_id: market.conditionId || '',
                        yes_price: market.upPrice,
                        no_price: market.downPrice,
                        price_sum: market.priceSum,
                        spread: market.spread,
                        deviation_type: market.spread > 0 ? 'LONG' : 'SHORT'
                    });
                }
                
                // 套利机会检测：只关注价格和 < 1 的情况
                // spread > 0 表示价格和 < 1
                if (market.spread > 0 && market.spread >= arbitrageSettings.minSpread) {
                    const totalInvestment = arbitrageSettings.tradeAmount * 2;
                    const profit = totalInvestment * (1 - market.priceSum) / market.priceSum;
                    
                    arbitrageStatus.opportunityCount++;
                    opportunitiesFound++;
                    
                    lastOpportunity = {
                        market: market,
                        upPrice: market.upPrice,
                        downPrice: market.downPrice,
                        priceSum: market.priceSum,
                        spread: market.spread,
                        profit: profit,
                        question: market.question,
                        timestamp: new Date()
                    };
                    
                    // 保存套利机会到数据库
                    try {
                        await db.saveArbitrageOpportunity({
                            market_question: market.question,
                            market_slug: market.slug || '',
                            condition_id: market.conditionId || '',
                            yes_price: market.upPrice,
                            no_price: market.downPrice,
                            price_sum: market.priceSum,
                            spread: market.spread,
                            opportunity_type: 'LONG',
                            expected_profit: profit
                        });
                    } catch (dbError: any) {
                        console.error('保存套利机会失败:', dbError.message);
                    }
                    
                    addArbitrageLog(`💡 发现套利机会: ${market.question.slice(0, 25)}... 价差=${market.spread.toFixed(2)}% 利润=$${profit.toFixed(4)}`);
                    
                    if (arbitrageSettings.autoTrade) {
                        addArbitrageLog(`⚠️ 模拟交易模式 - 不执行实际交易`);
                        arbitrageStatus.tradeCount++;
                        arbitrageStatus.totalProfit += profit;
                        
                        // 保存模拟交易记录
                        try {
                            await db.saveTradeRecord({
                                market_question: market.question,
                                trade_type: 'LONG',
                                total_investment: totalInvestment,
                                expected_profit: profit,
                                status: 'SIMULATED'
                            });
                        } catch (dbError: any) {
                            console.error('保存交易记录失败:', dbError.message);
                        }
                    }
                }
            }
        }
        
        if (newMarkets.length > 0) {
            arbitrageMarkets = newMarkets;
        }
        
        // 保存扫描历史到数据库（有偏离市场的情况）
        const finalScanDuration = Date.now() - scanStartTime;
        try {
            const scanId = await db.saveScanHistory({
                total_markets: totalMarkets,
                deviated_markets: deviationMarkets.length,
                opportunities_found: opportunitiesFound,
                scan_duration_ms: finalScanDuration
            });
            addArbitrageLog(`💾 扫描记录已保存到数据库 (ID: ${scanId})`);
            
            // 保存价格偏离市场
            if (deviationMarkets.length > 0) {
                await db.savePriceDeviationMarkets(deviationMarkets, scanId);
            }
        } catch (dbError: any) {
            console.error('保存扫描历史失败:', dbError.message);
            addArbitrageLog(`⚠️ 保存扫描历史失败: ${dbError.message}`);
        }
        
    } catch (error: any) {
        addArbitrageLog(`❌ 扫描错误: ${error.message}`);
    } finally {
        isScanning = false;  // 确保解锁
    }
}

// 停止套利扫描
app.post('/api/arbitrage/stop', (req: Request, res: Response) => {
    if (!arbitrageStatus.isRunning) {
        res.json({ success: false, error: '套利扫描未在运行' });
        return;
    }
    
    arbitrageStatus.isRunning = false;
    if (arbitrageScanInterval) {
        clearInterval(arbitrageScanInterval);
        arbitrageScanInterval = null;
    }
    addArbitrageLog('⏹️ 套利扫描已停止');
    
    res.json({ success: true, message: '套利扫描已停止' });
});

// 获取套利设置
app.get('/api/arbitrage/settings', (req: Request, res: Response) => {
    res.json({
        success: true,
        data: arbitrageSettings
    });
});

// 保存套利设置
app.post('/api/arbitrage/settings', (req: Request, res: Response) => {
    const { minSpread, tradeAmount, scanInterval, autoTrade } = req.body;
    
    if (minSpread !== undefined) arbitrageSettings.minSpread = parseFloat(minSpread);
    if (tradeAmount !== undefined) arbitrageSettings.tradeAmount = parseFloat(tradeAmount);
    if (scanInterval !== undefined) {
        const newInterval = Math.max(parseInt(scanInterval), 10000); // 最小 10 秒
        arbitrageSettings.scanInterval = newInterval;
        
        // 如果正在运行，重启扫描以应用新间隔
        if (arbitrageStatus.isRunning && arbitrageScanInterval) {
            clearInterval(arbitrageScanInterval);
            arbitrageScanInterval = setInterval(scanMarketsOnce, newInterval);
            addArbitrageLog(`⏱️ 扫描间隔已更新为 ${newInterval}ms`);
        }
    }
    if (autoTrade !== undefined) arbitrageSettings.autoTrade = autoTrade === true || autoTrade === 'true';
    
    addArbitrageLog(`⚙️ 套利设置已更新: 最小价差=${arbitrageSettings.minSpread}%, 金额=$${arbitrageSettings.tradeAmount}`);
    
    res.json({ success: true, data: arbitrageSettings });
});

// 获取套利日志（内存中的实时日志）
app.get('/api/arbitrage/logs', (req: Request, res: Response) => {
    res.json({
        success: true,
        data: arbitrageLogs.slice(0, 50)
    });
});

// 获取套利机会日志文件
app.get('/api/arbitrage/logs/opportunities', (req: Request, res: Response) => {
    const fs = require('fs');
    const logPath = path.join(__dirname, '../logs/arbitrage_opportunities.log');
    
    try {
        if (fs.existsSync(logPath)) {
            const content = fs.readFileSync(logPath, 'utf-8');
            // 返回最近的 200 行
            const lines = content.split('\n').filter((line: string) => line.trim());
            const recentLines = lines.slice(-200);
            res.json({
                success: true,
                data: recentLines.join('\n'),
                totalLines: lines.length
            });
        } else {
            res.json({
                success: true,
                data: '暂无记录',
                totalLines: 0
            });
        }
    } catch (error) {
        res.json({
            success: false,
            error: '读取日志文件失败'
        });
    }
});

// 获取扫描历史日志文件
app.get('/api/arbitrage/logs/scan-history', (req: Request, res: Response) => {
    const fs = require('fs');
    const logPath = path.join(__dirname, '../logs/scan_history.log');
    
    try {
        if (fs.existsSync(logPath)) {
            const content = fs.readFileSync(logPath, 'utf-8');
            // 返回最近的 100 行
            const lines = content.split('\n').filter((line: string) => line.trim());
            const recentLines = lines.slice(-100);
            res.json({
                success: true,
                data: recentLines.join('\n'),
                totalLines: lines.length
            });
        } else {
            res.json({
                success: true,
                data: '暂无扫描记录',
                totalLines: 0
            });
        }
    } catch (error) {
        res.json({
            success: false,
            error: '读取日志文件失败'
        });
    }
});

// ============== 数据库历史记录 API ==============

// 获取套利机会历史（从数据库）
app.get('/api/db/opportunities', async (req: Request, res: Response) => {
    try {
        const limit = parseInt(req.query.limit as string) || 50;
        const opportunities = await db.getRecentOpportunities(limit);
        res.json({ success: true, data: opportunities });
    } catch (error: any) {
        res.json({ success: false, error: error.message });
    }
});

// 获取价格偏离市场历史（从数据库）
app.get('/api/db/deviations', async (req: Request, res: Response) => {
    try {
        const limit = parseInt(req.query.limit as string) || 100;
        const markets = await db.getRecentDeviationMarkets(limit);
        res.json({ success: true, data: markets });
    } catch (error: any) {
        res.json({ success: false, error: error.message });
    }
});

// 获取扫描历史（从数据库）
app.get('/api/db/scans', async (req: Request, res: Response) => {
    try {
        const limit = parseInt(req.query.limit as string) || 100;
        const scans = await db.getScanHistory(limit);
        res.json({ success: true, data: scans });
    } catch (error: any) {
        res.json({ success: false, error: error.message });
    }
});

// 获取交易记录（从数据库）
app.get('/api/db/trades', async (req: Request, res: Response) => {
    try {
        const limit = parseInt(req.query.limit as string) || 50;
        const trades = await db.getTradeRecords(limit);
        res.json({ success: true, data: trades });
    } catch (error: any) {
        res.json({ success: false, error: error.message });
    }
});

// 获取统计数据（从数据库）
app.get('/api/db/stats', async (req: Request, res: Response) => {
    try {
        const [scanStats, tradeStats] = await Promise.all([
            db.getScanStats(),
            db.getTradeStats()
        ]);
        res.json({ 
            success: true, 
            data: {
                scan: scanStats,
                trade: tradeStats
            }
        });
    } catch (error: any) {
        res.json({ success: false, error: error.message });
    }
});

// 主页
app.get('/', (req: Request, res: Response) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
});

// 启动服务器
app.listen(PORT, async () => {
    console.log('='.repeat(60));
    console.log('🌐 Polymarket 交易机器人 Web 界面');
    console.log('='.repeat(60));
    console.log(`📍 访问地址: http://localhost:${PORT}`);
    console.log('='.repeat(60));
    
    await initialize();
});

// 定期更新 BTC 价格
setInterval(async () => {
    try {
        const response = await fetch('https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT');
        const data = await response.json() as { price: string };
        currentPrices.btc = parseFloat(data.price);
    } catch (error) {
        // 静默失败
    }
}, 5000);
