/**
 * Web 服务器 - 提供简洁的交易界面
 */
import express, { Request, Response } from 'express';
import path from 'path';
import { Wallet } from '@ethersproject/wallet';
import { BalanceChecker } from './balance_checker';
import { MarketFinder } from './market_finder';
import { BinanceOracle } from './binance_oracle';
import * as dotenv from 'dotenv';

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

// 设置
let settings = {
    tradeAmount: parseFloat(process.env.DEFAULT_TRADE_AMOUNT || '5.0'),
    takeProfit: parseFloat(process.env.TAKE_PROFIT_AMOUNT || '0.01'),
    stopLoss: parseFloat(process.env.STOP_LOSS_AMOUNT || '0.005'),
    threshold: parseFloat(process.env.PRICE_DIFFERENCE_THRESHOLD || '0.015'),
    cooldown: parseInt(process.env.TRADE_COOLDOWN || '30')
};

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
