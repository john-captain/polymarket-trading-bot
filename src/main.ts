/**
 * Polymarket 交易机器人的主入口
 */

import { CredentialGenerator } from './_gen_credential';
import { AllowanceManager } from './allowance';
import { BidAsker } from './bid_asker';
import { MarketOrderExecutor } from './market_order';
import { MarketFinder } from './market_finder';
import { BalanceChecker } from './balance_checker';
import { Wallet } from '@ethersproject/wallet';
import * as dotenv from 'dotenv';
import * as readline from 'readline';

dotenv.config();

class PolymarketBot {
    private credentials?: CredentialGenerator;
    private allowanceManager?: AllowanceManager;
    private bidAsker: BidAsker;
    private orderExecutor?: MarketOrderExecutor;
    private marketFinder: MarketFinder;
    private balanceChecker?: BalanceChecker;
    private wallet?: Wallet;
    private hasPrivateKey: boolean;

    constructor() {
        console.log('🚀 正在初始化 Polymarket 交易机器人...\n');
        
        this.hasPrivateKey = !!process.env.PRIVATE_KEY && process.env.PRIVATE_KEY !== 'your_private_key_here';

        if (this.hasPrivateKey) {
            console.log('✅ 检测到私钥 - 完整功能已启用\n');
            this.wallet = new Wallet(process.env.PRIVATE_KEY!);
            this.credentials = new CredentialGenerator();
            this.allowanceManager = new AllowanceManager();
            this.bidAsker = new BidAsker();
            this.orderExecutor = new MarketOrderExecutor();
            this.balanceChecker = new BalanceChecker();
        } else {
            console.log('⚠️  未找到私钥 - 以只读模式运行');
            console.log('   要启用交易功能，请将您的 PRIVATE_KEY 添加到 .env 文件中\n');
            this.bidAsker = new BidAsker();
        }
        
        this.marketFinder = new MarketFinder();
    }

    /**
     * 显示主菜单
     */
    displayMenu(): void {
        console.log('\n' + '='.repeat(60));
        console.log(`🎯 Polymarket 交易机器人 - 主菜单 ${this.hasPrivateKey ? '' : '(只读)'}`);
        console.log('='.repeat(60));
        
        if (this.hasPrivateKey) {
            console.log('1. 显示凭证');
            console.log('2. 检查余额 (USDC + MATIC)');
            console.log('3. 检查授权额度');
            console.log('4. 设置授权额度');
        }
        
        console.log('5. 查找当前比特币市场');
        console.log('6. 获取价格数据 (买价/卖价)');
        
        if (this.hasPrivateKey) {
            console.log('7. 下市价单');
            console.log('8. 下限价单');
            console.log('9. 查看待处理订单');
            console.log('10. 取消订单');
        }
        
        console.log('0. 退出');
        console.log('='.repeat(60));
    }

    /**
     * 处理用户输入
     */
    async handleInput(choice: string): Promise<boolean> {
        try {
            const requiresAuth = ['1', '2', '3', '4', '7', '8', '9', '10'].includes(choice);
            
            if (requiresAuth && !this.hasPrivateKey) {
                console.log('\n❌ 此操作需要私钥。请将 PRIVATE_KEY 添加到 .env 文件中。\n');
                return true;
            }
            
            switch (choice) {
                case '1':
                    await this.showCredentials();
                    break;
                case '2':
                    await this.checkBalances();
                    break;
                case '3':
                    await this.checkAllowance();
                    break;
                case '4':
                    await this.setAllowance();
                    break;
                case '5':
                    await this.findMarket();
                    break;
                case '6':
                    await this.getPriceData();
                    break;
                case '7':
                    await this.placeMarketOrder();
                    break;
                case '8':
                    await this.placeLimitOrder();
                    break;
                case '9':
                    await this.viewOpenOrders();
                    break;
                case '10':
                    await this.cancelOrder();
                    break;
                case '0':
                    console.log('\n👋 再见！\n');
                    return false;
                default:
                    console.log('\n❌ 无效选择。请重试。\n');
            }
        } catch (error) {
            console.error('\n❌ 错误:', error);
        }
        
        return true;
    }

    /**
     * 显示凭证
     */
    async showCredentials(): Promise<void> {
        this.credentials?.displayInfo();
    }

    /**
     * 检查余额
     */
    async checkBalances(): Promise<void> {
        if (!this.wallet || !this.balanceChecker) {
            console.log('❌ 钱包未初始化');
            return;
        }

        console.log('\n💰 正在检查钱包余额...');
        const balances = await this.balanceChecker.checkBalances(this.wallet);
        this.balanceChecker.displayBalances(balances);
        
        const check = this.balanceChecker.checkSufficientBalance(balances, 5.0, 0.05);
        console.log('\n📊 余额检查 (用于交易):');
        check.warnings.forEach(w => console.log(`  ${w}`));
        
        if (!check.sufficient) {
            console.log('\n⚠️  资金不足以进行交易');
            console.log('请为您的钱包充值:');
            console.log(`  - USDC: 至少 $5.00`);
            console.log(`  - MATIC: 至少 0.05 用于 Gas 费`);
        }
    }

    /**
     * 检查授权额度
     */
    async checkAllowance(): Promise<void> {
        await this.allowanceManager?.checkAllowance();
    }

    /**
     * 设置授权额度
     */
    async setAllowance(): Promise<void> {
        const amount = await this.prompt('输入授权额度 (USDC): ');
        await this.allowanceManager?.setAllowance(amount);
    }

    /**
     * 查找当前比特币市场
     */
    async findMarket(): Promise<void> {
        const market = await this.marketFinder.findCurrentBitcoinMarket();
        
        if (market && market.tokens.length > 0) {
            console.log('\n📊 您想查看此市场的价格数据吗? (y/n)');
            const answer = await this.prompt('');
            
            if (answer.toLowerCase() === 'y') {
                for (const token of market.tokens) {
                    console.log(`\n📈 正在获取 ${token.outcome} 的数据...`);
                    const data = await this.bidAsker.getPriceData(token.tokenId);
                    this.bidAsker.displayPriceInfo(token.tokenId, data);
                }
            }
        }
    }

    /**
     * 获取价格数据
     */
    async getPriceData(): Promise<void> {
        const tokenId = await this.prompt('输入代币 ID: ');
        const data = await this.bidAsker.getPriceData(tokenId);
        this.bidAsker.displayPriceInfo(tokenId, data);
    }

    /**
     * 下市价单
     */
    async placeMarketOrder(): Promise<void> {
        console.log('\n📝 下市价单');
        const tokenId = await this.prompt('输入代币 ID: ');
        const side = await this.prompt('输入方向 (BUY/SELL): ');
        const amount = await this.prompt('输入金额 (USDC): ');

        const confirm = await this.prompt(`\n确认 ${side} ${amount} USDC 的代币? (yes/no): `);
        
        if (confirm.toLowerCase() === 'yes') {
            await this.orderExecutor?.placeMarketOrder({
                tokenId,
                side: side.toUpperCase() as 'BUY' | 'SELL',
                amount: parseFloat(amount)
            });
        } else {
            console.log('❌ 订单已取消');
        }
    }

    /**
     * 下限价单
     */
    async placeLimitOrder(): Promise<void> {
        console.log('\n📝 下限价单');
        const tokenId = await this.prompt('输入代币 ID: ');
        const side = await this.prompt('输入方向 (BUY/SELL): ');
        const price = await this.prompt('输入价格: ');
        const size = await this.prompt('输入份额: ');

        const confirm = await this.prompt(`\n确认以 $${price} ${side} ${size} 份额? (yes/no): `);
        
        if (confirm.toLowerCase() === 'yes') {
            await this.orderExecutor?.placeLimitOrder(
                tokenId,
                side.toUpperCase() as 'BUY' | 'SELL',
                parseFloat(price),
                parseFloat(size)
            );
        } else {
            console.log('❌ 订单已取消');
        }
    }

    /**
     * 查看待处理订单
     */
    async viewOpenOrders(): Promise<void> {
        const orders = await this.orderExecutor?.getOpenOrders() || [];
        
        console.log('\n📋 待处理订单:');
        console.log('='.repeat(60));
        
        if (orders.length === 0) {
            console.log('无待处理订单');
        } else {
            orders.forEach((order: any, index: number) => {
                console.log(`\n${index + 1}. 订单 ID: ${order.orderID}`);
                console.log(`   代币: ${order.tokenID?.substring(0, 12)}...`);
                console.log(`   方向: ${order.side}`);
                console.log(`   价格: $${order.price}`);
                console.log(`   份额: ${order.size}`);
            });
        }
        
        console.log('='.repeat(60));
    }

    /**
     * 取消订单
     */
    async cancelOrder(): Promise<void> {
        const orderId = await this.prompt('输入要取消的订单 ID: ');
        
        const confirm = await this.prompt(`\n确认取消订单 ${orderId}? (yes/no): `);
        
        if (confirm.toLowerCase() === 'yes') {
            await this.orderExecutor?.cancelOrder(orderId);
        } else {
            console.log('❌ 取消操作已中止');
        }
    }

    /**
     * 提示用户输入
     */
    private prompt(question: string): Promise<string> {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });

        return new Promise((resolve) => {
            rl.question(question, (answer) => {
                rl.close();
                resolve(answer);
            });
        });
    }

    /**
     * 运行机器人
     */
    async run(): Promise<void> {
        // 已移除 RPC 验证 - 将通过实际使用进行验证
        console.log('✅ 机器人初始化成功！\n');
        
        let running = true;
        
        while (running) {
            this.displayMenu();
            const choice = await this.prompt('\n请输入您的选择: ');
            running = await this.handleInput(choice);
        }
    }
}

// 主入口点
if (require.main === module) {
    (async () => {
        try {
            const bot = new PolymarketBot();
            await bot.run();
        } catch (error) {
            console.error('\n❌ 致命错误:', error);
            process.exit(1);
        }
    })();
}

export default PolymarketBot;

