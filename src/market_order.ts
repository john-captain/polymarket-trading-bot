/**
 * 在 Polymarket 上下市价单
 */

import { ClobClient, OrderType, Side } from '@polymarket/clob-client';
import { Wallet } from '@ethersproject/wallet';
import * as dotenv from 'dotenv';

dotenv.config();

export interface MarketOrderParams {
    tokenId: string;
    side: 'BUY' | 'SELL';
    amount: number;  // USDC 金额
}

export class MarketOrderExecutor {
    private client: ClobClient;

    constructor(privateKey?: string, host?: string, chainId?: number) {
        const key = privateKey || process.env.PRIVATE_KEY;
        const apiHost = host || process.env.CLOB_API_URL || 'https://clob.polymarket.com';
        const chain = chainId || parseInt(process.env.POLYGON_CHAIN_ID || '137');

        if (!key) {
            throw new Error('未提供私钥');
        }

        const wallet = new Wallet(key);
        this.client = new ClobClient(apiHost, chain, wallet);
    }

    /**
     * 获取市价单估算的当前市场价格
     */
    async getMarketPrice(tokenId: string, side: 'BUY' | 'SELL'): Promise<number | null> {
        try {
            const price = await this.client.getPrice(tokenId, side);
            return price ? parseFloat(price) : null;
        } catch (error) {
            console.error(`❌ 获取市场价格时出错:`, error);
            return null;
        }
    }

    /**
     * 使用 createAndPostOrder 下市价单
     */
    async placeMarketOrder(params: MarketOrderParams): Promise<any> {
        try {
            console.log('='.repeat(50));
            console.log('📝 下市价单');
            console.log('='.repeat(50));
            console.log(`Token ID: ${params.tokenId.substring(0, 12)}...`);
            console.log(`方向: ${params.side}`);
            console.log(`金额: ${params.amount} USDC`);
            
            // 获取当前市场价格
            const marketPrice = await this.getMarketPrice(params.tokenId, params.side);
            
            if (!marketPrice) {
                throw new Error('无法获取市场价格');
            }

            console.log(`市场价格: $${marketPrice.toFixed(4)}`);
            
            // 计算份额 (要买入的份额)
            const size = params.amount / marketPrice;
            console.log(`预计份额: ${size.toFixed(2)}`);
            
            // 以市场价格加轻微缓冲下单
            const bufferMultiplier = params.side === 'BUY' ? 1.01 : 0.99; // 1% 缓冲
            const orderPrice = marketPrice * bufferMultiplier;
            
            console.log(`订单价格 (含缓冲): $${orderPrice.toFixed(4)}`);
            console.log('\n🔄 正在提交订单...\n');

            const order = await this.client.createAndPostOrder({
                tokenID: params.tokenId,
                price: orderPrice,
                size: size,
                side: params.side === 'BUY' ? Side.BUY : Side.SELL,
            },
            { tickSize: '0.001', negRisk: false }, // 默认最小价格单位
            OrderType.GTC);

            console.log('✅ 订单下达成功！');
            console.log('订单:', order);
            console.log('='.repeat(50));
            
            return order;
            
        } catch (error) {
            console.error('❌ 下市价单时出错:', error);
            throw error;
        }
    }

    /**
     * 下限价单
     */
    async placeLimitOrder(
        tokenId: string,
        side: 'BUY' | 'SELL',
        price: number,
        size: number
    ): Promise<any> {
        try {
            console.log('='.repeat(50));
            console.log('📝 下限价单');
            console.log('='.repeat(50));
            console.log(`Token ID: ${tokenId.substring(0, 12)}...`);
            console.log(`方向: ${side}`);
            console.log(`价格: $${price.toFixed(4)}`);
            console.log(`份额: ${size.toFixed(2)} 份`);
            console.log('\n🔄 正在提交订单...\n');

            const order = await this.client.createAndPostOrder({
                tokenID: tokenId,
                price: price,
                size: size,
                side: side === 'BUY' ? Side.BUY : Side.SELL,
            },
            { tickSize: '0.001', negRisk: false },
            OrderType.GTC);

            console.log('✅ 订单下达成功！');
            console.log('订单:', order);
            console.log('='.repeat(50));
            
            return order;
            
        } catch (error) {
            console.error('❌ 下限价单时出错:', error);
            throw error;
        }
    }

    /**
     * 取消订单
     */
    async cancelOrder(orderId: string): Promise<any> {
        try {
            console.log(`🔄 正在取消订单 ${orderId}...`);
            const result = await this.client.cancelOrder({ orderID: orderId });
            console.log('✅ 订单取消成功！');
            return result;
        } catch (error) {
            console.error('❌ 取消订单时出错:', error);
            throw error;
        }
    }

    /**
     * 获取订单状态
     */
    async getOrderStatus(orderId: string): Promise<any> {
        try {
            const order = await this.client.getOrder(orderId);
            return order;
        } catch (error) {
            console.error('❌ 获取订单状态时出错:', error);
            throw error;
        }
    }

    /**
     * 获取所有待处理订单
     */
    async getOpenOrders(): Promise<any[]> {
        try {
            const orders = await this.client.getOpenOrders();
            return orders || [];
        } catch (error) {
            console.error('❌ 获取待处理订单时出错:', error);
            return [];
        }
    }
}

// 示例用法
if (require.main === module) {
    (async () => {
        try {
            const executor = new MarketOrderExecutor();
            
            // 示例: 下市价买单
            // 取消注释以使用:
            /*
            await executor.placeMarketOrder({
                tokenId: 'YOUR_TOKEN_ID',
                side: 'BUY',
                amount: 10  // 10 USDC
            });
            */
            
            console.log('市价单执行器已初始化');
            console.log('取消注释代码以下单');
            
        } catch (error) {
            console.error('错误:', error);
            process.exit(1);
        }
    })();
}

