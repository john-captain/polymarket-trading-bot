import { BalanceChecker } from './balance_checker';
import { Wallet } from '@ethersproject/wallet';
import * as dotenv from 'dotenv';

dotenv.config();

async function main() {
    console.log('💰 Polymarket 机器人 - 余额检查测试\n');
    
    const privateKey = process.env.PRIVATE_KEY;
    if (!privateKey) {
        console.log('❌ .env 文件中未找到 PRIVATE_KEY');
        console.log('添加您的私钥以测试余额检查:\n');
        console.log('PRIVATE_KEY=0xYourPrivateKeyHere\n');
        return;
    }

    try {
        const wallet = new Wallet(privateKey);
        const checker = new BalanceChecker();

        console.log('正在检查余额...\n');
        const balances = await checker.checkBalances(wallet);
        
        checker.displayBalances(balances);
        
        console.log('\n📊 交易准备检查:');
        console.log('='.repeat(60));
        
        const tradeAmount = parseFloat(process.env.DEFAULT_TRADE_AMOUNT || '5.0');
        const check = checker.checkSufficientBalance(balances, tradeAmount, 0.05);
        
        check.warnings.forEach(w => console.log(`  ${w}`));
        
        if (!check.sufficient) {
            console.log('\n⚠️  您需要更多资金才能开始交易！');
            console.log('\n操作步骤:');
            console.log('  1. 在 Polygon 网络上获取 USDC (链 ID: 137)');
            console.log('     合约: 0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174');
            console.log(`  2. 发送至少 $${tradeAmount.toFixed(2)} USDC 到: ${balances.address}`);
            console.log('  3. 获取一些 MATIC 用于 Gas (至少 0.05 MATIC)');
            console.log('  4. 再次运行此脚本以验证\n');
        } else {
            console.log('\n✅ 准备就绪，可以交易！');
            console.log(`   您可以进行最多 $${balances.usdc.toFixed(2)} 的交易`);
            console.log(`   MATIC 余额可以支付约 ${Math.floor(balances.matic * 100)} 笔交易\n`);
        }
        
    } catch (error) {
        console.error('❌ 错误:', error);
    }
}

main().catch(console.error);

