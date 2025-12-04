/**
 * 生成和管理 Polymarket CLOB 客户端凭证
 */

import { ethers } from 'ethers';
import * as dotenv from 'dotenv';

dotenv.config();

export class CredentialGenerator {
    private wallet: ethers.Wallet;
    private chainId: number;

    constructor(privateKey?: string, chainId: number = 137) {
        const key = privateKey || process.env.PRIVATE_KEY;
        
        if (!key) {
            throw new Error('未提供私钥');
        }

        this.wallet = new ethers.Wallet(key);
        this.chainId = chainId;
    }

    /**
     * 获取钱包地址
     */
    getAddress(): string {
        return this.wallet.address;
    }

    /**
     * 获取私钥
     */
    getPrivateKey(): string {
        return this.wallet.privateKey;
    }

    /**
     * 签名消息
     */
    async signMessage(message: string): Promise<string> {
        return await this.wallet.signMessage(message);
    }

    /**
     * 为 CLOB API 生成凭证
     */
    async generateApiCredentials(): Promise<{
        address: string;
        privateKey: string;
        chainId: number;
    }> {
        return {
            address: this.wallet.address,
            privateKey: this.wallet.privateKey,
            chainId: this.chainId
        };
    }

    /**
     * 创建 API 签名密钥
     */
    async createApiKey(nonce: string): Promise<string> {
        const message = `签署此消息以通过 Polymarket CLOB API 进行身份验证。\n\nNonce: ${nonce}`;
        return await this.signMessage(message);
    }

    /**
     * 显示凭证信息（不暴露私钥）
     */
    displayInfo(): void {
        console.log('='.repeat(50));
        console.log('Polymarket 凭证');
        console.log('='.repeat(50));
        console.log(`地址: ${this.wallet.address}`);
        console.log(`链 ID: ${this.chainId}`);
        console.log(`私钥: ${'*'.repeat(60)} (已隐藏)`);
        console.log('='.repeat(50));
    }
}

// 示例用法
if (require.main === module) {
    try {
        const generator = new CredentialGenerator();
        generator.displayInfo();
        
        console.log('\n✅ 凭证加载成功！');
    } catch (error) {
        console.error('❌ 错误:', error);
        process.exit(1);
    }
}

