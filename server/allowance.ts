/**
 * 管理 Polymarket 交易的代币授权额度
 */

import { ClobClient } from '@polymarket/clob-client';
import { Wallet } from '@ethersproject/wallet';
import * as dotenv from 'dotenv';

dotenv.config();

export class AllowanceManager {
    private client: ClobClient;
    private wallet: Wallet;

    constructor(privateKey?: string, host?: string, chainId?: number) {
        const key = privateKey || process.env.PRIVATE_KEY;
        const apiHost = host || process.env.CLOB_API_URL || 'https://clob.polymarket.com';
        const chain = chainId || parseInt(process.env.POLYGON_CHAIN_ID || '137');

        if (!key) {
            throw new Error('未提供私钥');
        }

        this.wallet = new Wallet(key);
        this.client = new ClobClient(apiHost, chain, this.wallet);
    }

    /**
     * 检查当前 USDC 余额
     */
    async checkAllowance(): Promise<string> {
        try {
            console.log(`💰 钱包地址: ${this.wallet.address}`);
            console.log('⚠️  注意: 授权额度检查需要区块链 RPC 连接');
            console.log('    如需要，请使用 Polymarket UI 检查/设置授权额度');
            return '授权额度检查需要 RPC 设置';
        } catch (error) {
            console.error('❌ 检查授权额度出错:', error);
            throw error;
        }
    }

    /**
     * 设置交易的代币授权额度
     */
    async setAllowance(amount: string): Promise<any> {
        try {
            console.log(`🔄 将授权额度设置为 ${amount} USDC...`);
            console.log('⚠️  注意: 设置授权额度需要区块链 RPC 连接');
            console.log('    如需要，请使用 Polymarket UI 设置授权额度');
            return '设置授权额度需要 RPC 设置';
        } catch (error) {
            console.error('❌ 设置授权额度出错:', error);
            throw error;
        }
    }

    /**
     * 为方便起见，批准最大授权额度
     */
    async approveMaxAllowance(): Promise<any> {
        return await this.setAllowance('无限制');
    }

    /**
     * 检查授权额度是否足够交易
     */
    async isAllowanceSufficient(requiredAmount: number): Promise<boolean> {
        try {
            const allowance = await this.checkAllowance();
            const allowanceNum = parseFloat(allowance);
            return allowanceNum >= requiredAmount;
        } catch (error) {
            return false;
        }
    }

    /**
     * 确保交易前有足够的授权额度
     */
    async ensureAllowance(minAmount: number = 1000): Promise<void> {
        const isSufficient = await this.isAllowanceSufficient(minAmount);
        
        if (!isSufficient) {
            console.log(`⚠️  授权额度不足。设置为 ${minAmount} USDC...`);
            await this.setAllowance(minAmount.toString());
        } else {
            console.log('✅ 授权额度充足');
        }
    }
}

// 示例用法
if (require.main === module) {
    (async () => {
        try {
            const manager = new AllowanceManager();
            
            // 检查当前授权额度
            await manager.checkAllowance();
            
            // 可选：设置授权额度（为安全起见已注释）
            // await manager.setAllowance('1000');
            
        } catch (error) {
            console.error('错误:', error);
            process.exit(1);
        }
    })();
}

