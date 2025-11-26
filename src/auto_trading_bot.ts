import { ClobClient, OrderType, Side } from '@polymarket/clob-client';
import { Wallet } from '@ethersproject/wallet';
import WebSocket from 'ws';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { BalanceChecker, BalanceInfo } from './balance_checker';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

interface PriceData {
    UP: number;
    DOWN: number;
}

interface Trade {
    tokenType: string;
    tokenId: string;
    buyOrderId: string;
    takeProfitOrderId: string;
    stopLossOrderId: string;
    buyPrice: number;
    targetPrice: number;
    stopPrice: number;
    amount: number;
    timestamp: Date;
    status: string;
}

interface TradeOpportunity {
    tokenType: string;
    tokenId: string;
    softwarePrice: number;
    polymarketPrice: number;
    difference: number;
}

class AutoTradingBot {
    private wallet: Wallet;
    private client: ClobClient;
    private balanceChecker: BalanceChecker;
    private tokenIdUp: string | null = null;
    private tokenIdDown: string | null = null;
    
    private softwarePrices: PriceData = { UP: 0, DOWN: 0 };
    private polymarketPrices: Map<string, number> = new Map();
    
    private activeTrades: Trade[] = [];
    private lastTradeTime: number = 0;
    private lastBalanceCheck: number = 0;
    private balanceCheckInterval: number = 60000;
    
    private priceThreshold: number;
    private stopLossAmount: number;
    private takeProfitAmount: number;
    private tradeCooldown: number;
    private tradeAmount: number;
    
    private softwareWs: WebSocket | null = null;
    private polymarketWs: WebSocket | null = null;
    private isRunning: boolean = false;

    constructor() {
        const privateKey = process.env.PRIVATE_KEY;
        if (!privateKey || privateKey.length < 64) {
            console.error('❌ 环境变量中未找到 PRIVATE_KEY 或无效');
            console.error('请将您的私钥添加到 .env 文件中:');
            console.error('PRIVATE_KEY=0xYourPrivateKeyHere');
            throw new Error('.env 中未找到 PRIVATE_KEY');
        }

        this.wallet = new Wallet(privateKey);
        this.client = new ClobClient(
            process.env.CLOB_API_URL || 'https://clob.polymarket.com',
            137,
            this.wallet
        );
        this.balanceChecker = new BalanceChecker();

        this.priceThreshold = parseFloat(process.env.PRICE_DIFFERENCE_THRESHOLD || '0.015');
        this.stopLossAmount = parseFloat(process.env.STOP_LOSS_AMOUNT || '0.005');
        this.takeProfitAmount = parseFloat(process.env.TAKE_PROFIT_AMOUNT || '0.01');
        this.tradeCooldown = parseInt(process.env.TRADE_COOLDOWN || '30') * 1000;
        this.tradeAmount = parseFloat(process.env.DEFAULT_TRADE_AMOUNT || '5.0');
    }

    async start() {
        console.log('='.repeat(60));
        console.log('启动自动交易机器人...');
        console.log('='.repeat(60));
        console.log(`钱包: ${this.wallet.address}`);
        console.log(`阈值: $${this.priceThreshold.toFixed(4)}`);
        console.log(`止盈: +$${this.takeProfitAmount.toFixed(4)}`);
        console.log(`止损: -$${this.stopLossAmount.toFixed(4)}`);
        console.log(`交易金额: $${this.tradeAmount.toFixed(2)}`);
        console.log(`冷却时间: ${this.tradeCooldown / 1000}秒`);
        console.log('='.repeat(60));
        console.log('\n💰 正在检查钱包余额...');
        const balances = await this.checkAndDisplayBalances();
        
        const check = this.balanceChecker.checkSufficientBalance(balances, this.tradeAmount, 0.05);
        console.log('\n📊 余额检查:');
        check.warnings.forEach(w => console.log(`  ${w}`));
        
        if (!check.sufficient) {
            console.log('\n❌ 资金不足，无法开始交易！');
            console.log('请为您的钱包充值:');
            console.log(`  - USDC: 至少 $${this.tradeAmount.toFixed(2)}`);
            console.log(`  - MATIC: 至少 0.05 用于 Gas 费`);
            throw new Error('余额不足');
        }
        
        console.log('\n✅ 余额充足！');
        
        await this.initializeMarket();
        
        console.log('\n📡 正在连接数据源...');
        await this.connectSoftwareWebSocket();
        await this.connectPolymarketWebSocket();
        
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        this.isRunning = true;
        this.startMonitoring();
        
        console.log('\n✅ 机器人启动成功！');
        console.log('正在监控交易机会...\n');
    }

    private async checkAndDisplayBalances(): Promise<BalanceInfo> {
        const balances = await this.balanceChecker.checkBalances(this.wallet);
        this.balanceChecker.displayBalances(balances);
        return balances;
    }

    private async initializeMarket() {
        console.log('查找当前比特币市场...');
        
        const now = new Date();
        const month = now.toLocaleString('en-US', { month: 'long' }).toLowerCase();
        const day = now.getDate();
        const hour = now.getHours();
        const timeStr = hour === 0 ? '12am' : hour < 12 ? `${hour}am` : hour === 12 ? '12pm' : `${hour - 12}pm`;
        const slug = `bitcoin-up-or-down-${month}-${day}-${timeStr}-et`;
        
        console.log(`搜索市场: ${slug}`);
        
        const response = await fetch(`https://gamma-api.polymarket.com/markets?slug=${slug}`);
        const data: any = await response.json();
        
        let market = null;
        if (Array.isArray(data) && data.length > 0) {
            market = data[0];
        } else if (data.data && Array.isArray(data.data) && data.data.length > 0) {
            market = data.data[0];
        }
        
        if (!market) {
            console.log('未通过 slug 找到市场，搜索活跃市场...');
            const activeResponse = await fetch('https://gamma-api.polymarket.com/markets?active=true&limit=50&closed=false');
            const activeData: any = await activeResponse.json();
            const markets = Array.isArray(activeData) ? activeData : (activeData.data || []);
            
            market = markets.find((m: any) => {
                const q = (m.question || '').toLowerCase();
                return (q.includes('bitcoin') || q.includes('btc')) && q.includes('up') && q.includes('down');
            });
            
            if (!market) {
                throw new Error('未找到活跃的比特币市场');
            }
        }

        let tokenIds = market.clobTokenIds || [];
        if (typeof tokenIds === 'string') {
            tokenIds = JSON.parse(tokenIds);
        }
        
        let outcomes = market.outcomes || [];
        if (typeof outcomes === 'string') {
            outcomes = JSON.parse(outcomes);
        }

        if (tokenIds.length < 2) {
            throw new Error('市场必须至少有 2 个代币');
        }

        let upIndex = outcomes.findIndex((o: string) => o.toLowerCase().includes('up') || o.toLowerCase().includes('yes'));
        let downIndex = outcomes.findIndex((o: string) => o.toLowerCase().includes('down') || o.toLowerCase().includes('no'));

        if (upIndex === -1) upIndex = 0;
        if (downIndex === -1) downIndex = 1;

        this.tokenIdUp = String(tokenIds[upIndex]);
        this.tokenIdDown = String(tokenIds[downIndex]);

        console.log(`已找到市场: ${market.question}`);
        console.log(`UP 代币: ${this.tokenIdUp.substring(0, 20)}...`);
        console.log(`DOWN 代币: ${this.tokenIdDown.substring(0, 20)}...`);
    }

    private async connectSoftwareWebSocket() {
        const url = process.env.SOFTWARE_WS_URL || 'ws://45.130.166.119:5001';
        
        const connect = () => {
            if (!this.isRunning) return;
            
            this.softwareWs = new WebSocket(url);
            
            this.softwareWs.on('open', () => {
                console.log('✅ 软件 WebSocket 已连接');
            });

            this.softwareWs.on('message', (data) => {
                try {
                    const message = JSON.parse(data.toString());
                    const probUp = message.prob_up || 0;
                    const probDown = message.prob_down || 0;

                    this.softwarePrices.UP = probUp / 100.0;
                    this.softwarePrices.DOWN = probDown / 100.0;
                } catch (error) {
                }
            });

            this.softwareWs.on('error', (error) => {
                console.error('软件 WebSocket 错误:', error.message);
            });

            this.softwareWs.on('close', () => {
                console.log('软件 WebSocket 已关闭');
                if (this.isRunning) {
                    console.log('5秒后重新连接...');
                    setTimeout(connect, 5000);
                }
            });
        };
        
        connect();
    }

    private async connectPolymarketWebSocket() {
        const url = 'wss://ws-subscriptions-clob.polymarket.com/ws/market';
        
        const connect = () => {
            if (!this.isRunning) return;
            
            this.polymarketWs = new WebSocket(url);
            
            this.polymarketWs.on('open', () => {
                console.log('✅ Polymarket WebSocket 已连接');
                
                const subscribeMessage = {
                    action: 'subscribe',
                    subscriptions: [{
                        topic: 'clob_market',
                        type: '*',
                        filters: JSON.stringify([this.tokenIdUp, this.tokenIdDown])
                    }]
                };
                
                this.polymarketWs?.send(JSON.stringify(subscribeMessage));
            });

            this.polymarketWs.on('message', (data) => {
                try {
                    const message = JSON.parse(data.toString());
                    this.processPolymarketMessage(message);
                } catch (error) {
                }
            });

            this.polymarketWs.on('error', (error) => {
                console.error('Polymarket WebSocket 错误:', error.message);
            });

            this.polymarketWs.on('close', () => {
                console.log('Polymarket WebSocket 已关闭');
                if (this.isRunning) {
                    console.log('5秒后重新连接...');
                    setTimeout(connect, 5000);
                }
            });
        };
        
        connect();
    }

    private processPolymarketMessage(data: any) {
        try {
            const topic = data.topic;
            const payload = data.payload || {};

            if (topic === 'clob_market') {
                const assetId = payload.asset_id || '';
                
                if (payload.price) {
                    const price = parseFloat(payload.price);
                    if (price > 0) {
                        this.polymarketPrices.set(assetId, price);
                    }
                }

                const bids = payload.bids || [];
                const asks = payload.asks || [];
                if (bids.length > 0 && asks.length > 0) {
                    const bestBid = parseFloat(bids[0].price);
                    const bestAsk = parseFloat(asks[0].price);
                    const midPrice = (bestBid + bestAsk) / 2.0;
                    this.polymarketPrices.set(assetId, midPrice);
                }
            }
        } catch (error) {
        }
    }

    private startMonitoring() {
        let lastLogTime = 0;
        const logInterval = 30000;
        
        setInterval(async () => {
            if (!this.isRunning) return;

            const now = Date.now();
            
            if (now - this.lastBalanceCheck >= this.balanceCheckInterval) {
                console.log('\n💰 定期余额检查...');
                const balances = await this.checkAndDisplayBalances();
                const check = this.balanceChecker.checkSufficientBalance(balances, this.tradeAmount, 0.02);
                
                if (!check.sufficient) {
                    console.log('⚠️  警告: 检测到余额不足！');
                    check.warnings.forEach(w => console.log(`  ${w}`));
                }
                
                this.lastBalanceCheck = now;
                console.log('');
            }
            
            if (now - lastLogTime >= logInterval) {
                const upSoft = this.softwarePrices.UP.toFixed(4);
                const downSoft = this.softwarePrices.DOWN.toFixed(4);
                const upMarket = (this.polymarketPrices.get(this.tokenIdUp!) || 0).toFixed(4);
                const downMarket = (this.polymarketPrices.get(this.tokenIdDown!) || 0).toFixed(4);
                
                console.log(`[监控] 软件价格: UP=$${upSoft} DOWN=$${downSoft} | 市场价格: UP=$${upMarket} DOWN=$${downMarket}`);
                lastLogTime = now;
            }

            const opportunity = this.checkTradeOpportunity();
            if (opportunity) {
                console.log('\n' + '='.repeat(60));
                console.log('🎯 检测到交易机会！');
                console.log('='.repeat(60));
                console.log(`代币: ${opportunity.tokenType}`);
                console.log(`软件价格: $${opportunity.softwarePrice.toFixed(4)}`);
                console.log(`Polymarket 价格: $${opportunity.polymarketPrice.toFixed(4)}`);
                console.log(`差价: $${opportunity.difference.toFixed(4)} (阈值: $${this.priceThreshold.toFixed(4)})`);
                console.log('='.repeat(60));
                
                await this.executeTrade(opportunity);
            }
        }, 1000);
    }

    private checkTradeOpportunity(): TradeOpportunity | null {
        const currentTime = Date.now();
        const remainingCooldown = this.tradeCooldown - (currentTime - this.lastTradeTime);

        if (remainingCooldown > 0) {
            return null;
        }

        for (const tokenType of ['UP', 'DOWN']) {
            const softwarePrice = this.softwarePrices[tokenType as keyof PriceData];
            const tokenId = tokenType === 'UP' ? this.tokenIdUp : this.tokenIdDown;
            
            if (!tokenId) continue;

            const polyPrice = this.polymarketPrices.get(tokenId) || 0;
            const diff = softwarePrice - polyPrice;

            if (diff >= this.priceThreshold && softwarePrice > 0 && polyPrice > 0) {
                return {
                    tokenType,
                    tokenId,
                    softwarePrice,
                    polymarketPrice: polyPrice,
                    difference: diff
                };
            }
        }

        return null;
    }

    private async executeTrade(opportunity: TradeOpportunity) {
        console.log('\n📊 执行交易...');
        this.lastTradeTime = Date.now();

        try {
            const buyPrice = opportunity.polymarketPrice;
            const shares = this.tradeAmount / buyPrice;

            console.log(`💰 以 $${buyPrice.toFixed(4)} 买入 ${shares.toFixed(4)} 份额`);
            console.log(`⏳ 正在下单...`);

            const buyResult = await this.client.createAndPostOrder(
                {
                    tokenID: opportunity.tokenId,
                    price: buyPrice * 1.01,
                    size: shares,
                    side: Side.BUY
                },
                { tickSize: '0.001', negRisk: false },
                OrderType.GTC
            );

            console.log(`✅ 买入订单已下达: ${buyResult.orderID}`);

            const actualBuyPrice = buyPrice;
            const takeProfitPrice = Math.min(actualBuyPrice + this.takeProfitAmount, 0.99);
            const stopLossPrice = Math.max(actualBuyPrice - this.stopLossAmount, 0.01);

            console.log(`⏳ 等待 2 秒让持仓稳定...`);
            await new Promise(resolve => setTimeout(resolve, 2000));

            const takeProfitResult = await this.client.createAndPostOrder(
                {
                    tokenID: opportunity.tokenId,
                    price: takeProfitPrice,
                    size: shares,
                    side: Side.SELL
                },
                { tickSize: '0.001', negRisk: false },
                OrderType.GTC
            );

            const stopLossResult = await this.client.createAndPostOrder(
                {
                    tokenID: opportunity.tokenId,
                    price: stopLossPrice,
                    size: shares,
                    side: Side.SELL
                },
                { tickSize: '0.001', negRisk: false },
                OrderType.GTC
            );

            console.log(`✅ 止盈订单: ${takeProfitResult.orderID} @ $${takeProfitPrice.toFixed(4)}`);
            console.log(`✅ 止损订单: ${stopLossResult.orderID} @ $${stopLossPrice.toFixed(4)}`);

            const trade: Trade = {
                tokenType: opportunity.tokenType,
                tokenId: opportunity.tokenId,
                buyOrderId: buyResult.orderID,
                takeProfitOrderId: takeProfitResult.orderID,
                stopLossOrderId: stopLossResult.orderID,
                buyPrice: actualBuyPrice,
                targetPrice: takeProfitPrice,
                stopPrice: stopLossPrice,
                amount: this.tradeAmount,
                timestamp: new Date(),
                status: 'active'
            };

            this.activeTrades.push(trade);
            
            console.log('='.repeat(60));
            console.log('✅ 交易执行完成！');
            console.log(`总交易数: ${this.activeTrades.length}`);
            console.log('='.repeat(60));
            console.log(`⏰ 下次可交易时间: ${this.tradeCooldown / 1000} 秒后\n`);

        } catch (error: any) {
            console.error('='.repeat(60));
            console.error('❌ 交易执行失败！');
            console.error(`错误: ${error.message}`);
            console.error('='.repeat(60));
        }
    }

    stop() {
        this.isRunning = false;
        this.softwareWs?.close();
        this.polymarketWs?.close();
        console.log('机器人已停止');
    }
}

async function main() {
    const bot = new AutoTradingBot();
    
    process.on('SIGINT', () => {
        console.log('\n正在关闭...');
        bot.stop();
        process.exit(0);
    });

    await bot.start();
}

main().catch(console.error);

