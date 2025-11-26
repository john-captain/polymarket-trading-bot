/**
 * 从订单簿获取最佳买价和卖价
 */

import { ClobClient } from '@polymarket/clob-client';
import { Wallet } from '@ethersproject/wallet';
import * as dotenv from 'dotenv';

dotenv.config();

export interface BidAsk {
    bid: number | null;
    ask: number | null;
    midpoint: number | null;
    spread: number | null;
}

export class BidAsker {
    private client: ClobClient;

    constructor(privateKey?: string, host?: string, chainId?: number) {
        // 对于只读操作，我们可以使用一个虚拟钱包
        const key = privateKey || process.env.PRIVATE_KEY || '0x' + '1'.repeat(64);
        const apiHost = host || process.env.CLOB_API_URL || 'https://clob.polymarket.com';
        const chain = chainId || parseInt(process.env.POLYGON_CHAIN_ID || '137');

        const wallet = new Wallet(key);
        this.client = new ClobClient(apiHost, chain, wallet);
    }

    /**
     * 获取代币的订单簿
     */
    async getOrderBook(tokenId: string): Promise<any> {
        try {
            const orderBook = await this.client.getOrderBook(tokenId);
            return orderBook;
        } catch (error) {
            console.error(`❌ 获取 ${tokenId} 的订单簿时出错:`, error);
            return null;
        }
    }

    /**
     * 从订单簿获取最佳买价和卖价
     */
    async getBestBidAsk(tokenId: string): Promise<BidAsk> {
        try {
            const orderBook = await this.getOrderBook(tokenId);
            
            if (!orderBook) {
                return { bid: null, ask: null, midpoint: null, spread: null };
            }

            const bids = orderBook.bids || [];
            const asks = orderBook.asks || [];

            const bestBid = bids.length > 0 ? parseFloat(bids[0].price) : null;
            const bestAsk = asks.length > 0 ? parseFloat(asks[0].price) : null;

            let midpoint = null;
            let spread = null;

            if (bestBid !== null && bestAsk !== null) {
                midpoint = (bestBid + bestAsk) / 2;
                spread = bestAsk - bestBid;
            }

            return {
                bid: bestBid,
                ask: bestAsk,
                midpoint,
                spread
            };
        } catch (error) {
            console.error(`❌ 获取买价/卖价时出错:`, error);
            return { bid: null, ask: null, midpoint: null, spread: null };
        }
    }

    /**
     * 获取中间价
     */
    async getMidpoint(tokenId: string): Promise<number | null> {
        try {
            const midpoint = await this.client.getMidpoint(tokenId);
            return midpoint ? parseFloat(midpoint) : null;
        } catch (error) {
            console.error(`❌ 获取中间价时出错:`, error);
            return null;
        }
    }

    /**
     * 获取最后交易价格
     */
    async getLastTradePrice(tokenId: string): Promise<number | null> {
        try {
            const lastPrice = await this.client.getLastTradePrice(tokenId);
            return lastPrice ? parseFloat(lastPrice) : null;
        } catch (error) {
            console.error(`❌ 获取最后交易价格时出错:`, error);
            return null;
        }
    }

    /**
     * 获取综合价格数据
     */
    async getPriceData(tokenId: string): Promise<{
        bidAsk: BidAsk;
        midpoint: number | null;
        lastTrade: number | null;
    }> {
        const [bidAsk, midpoint, lastTrade] = await Promise.all([
            this.getBestBidAsk(tokenId),
            this.getMidpoint(tokenId),
            this.getLastTradePrice(tokenId)
        ]);

        return { bidAsk, midpoint, lastTrade };
    }

    /**
     * 显示价格信息
     */
    displayPriceInfo(tokenId: string, data: any): void {
        console.log('='.repeat(50));
        console.log(`代币: ${tokenId.substring(0, 12)}...`);
        console.log('='.repeat(50));
        
        if (data.bidAsk.bid !== null) {
            console.log(`📉 最佳买价:    $${data.bidAsk.bid.toFixed(4)}`);
        }
        if (data.bidAsk.ask !== null) {
            console.log(`📈 最佳卖价:    $${data.bidAsk.ask.toFixed(4)}`);
        }
        if (data.bidAsk.midpoint !== null) {
            console.log(`💰 中间价:      $${data.bidAsk.midpoint.toFixed(4)}`);
        }
        if (data.bidAsk.spread !== null) {
            console.log(`📊 价差:        $${data.bidAsk.spread.toFixed(4)} (${(data.bidAsk.spread * 100).toFixed(2)}%)`);
        }
        if (data.lastTrade !== null) {
            console.log(`🔄 最后交易:    $${data.lastTrade.toFixed(4)}`);
        }
        
        console.log('='.repeat(50));
    }
}

// 示例用法
if (require.main === module) {
    (async () => {
        try {
            const tokenId = process.argv[2];
            
            if (!tokenId) {
                console.log('用法: ts-node src/bid_asker.ts <token_id>');
                process.exit(1);
            }

            const bidAsker = new BidAsker();
            const data = await bidAsker.getPriceData(tokenId);
            bidAsker.displayPriceInfo(tokenId, data);
            
        } catch (error) {
            console.error('错误:', error);
            process.exit(1);
        }
    })();
}

