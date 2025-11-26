/**
 * 为 Polymarket 生成 CLOB API 凭证
 * 
 * 此脚本展示如何:
 * 1. 从私钥创建钱包
 * 2. 生成或派生 API 凭证
 * 3. 使用这些凭证进行认证 API 调用
 */

import { ClobClient } from '@polymarket/clob-client';
import { Wallet } from '@ethersproject/wallet';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

// 从项目根目录加载 .env 文件
dotenv.config({ path: path.join(__dirname, '..', '.env') });

async function generateCredentials() {
    console.log('='.repeat(70));
    console.log('🔑 Polymarket CLOB 凭证生成器');
    console.log('='.repeat(70));
    
    // 步骤 1: 获取私钥
    const privateKey = process.env.PRIVATE_KEY;
    
    if (!privateKey || privateKey === 'your_private_key_here') {
        console.log('\n❌ 错误: 未找到私钥！');
        console.log('\n📝 请将您的私钥添加到 .env 文件中:');
        console.log('   PRIVATE_KEY=0xYourPrivateKeyHere');
        console.log('\n💡 如何找到您的私钥:');
        console.log('   - MetaMask: 账户详情 > 导出私钥');
        console.log('   - 硬件钱包: 无法导出 (请使用浏览器连接)');
        console.log('   - Magic/邮箱钱包: https://reveal.magic.link/polymarket');
        process.exit(1);
    }
    
    // 步骤 2: 从私钥创建钱包
    console.log('\n📍 步骤 1: 创建钱包...');
    const wallet = new Wallet(privateKey);
    console.log(`✅ 钱包地址: ${wallet.address}`);
    
    // 步骤 3: 初始化 CLOB 客户端
    console.log('\n📍 步骤 2: 连接到 Polymarket CLOB...');
    const host = 'https://clob.polymarket.com';
    const chainId = 137; // Polygon 主网
    
    const client = new ClobClient(host, chainId, wallet);
    console.log('✅ 已连接到 CLOB API');
    
    // 步骤 4: 创建或派生 API 凭证
    console.log('\n📍 步骤 3: 生成 API 凭证...');
    console.log('   (这将使用您的钱包签名一条消息)');
    
    try {
        // 这将会:
        // - 如果您之前使用过此钱包，则派生现有凭证
        // - 如果这是新钱包，则创建新凭证
        const creds = await client.createOrDeriveApiKey();
        
        console.log('\n✅ API 凭证生成成功！');
        console.log('='.repeat(70));
        console.log('📋 您的 CLOB API 凭证:');
        console.log('='.repeat(70));
        console.log(`API Key:        ${creds.key}`);
        console.log(`API Secret:     ${creds.secret}`);
        console.log(`API Passphrase: ${creds.passphrase}`);
        console.log('='.repeat(70));
        
        // 步骤 5: 保存凭证到文件
        const credsFile = path.join(__dirname, '..', '.credentials.json');
        const credsData = {
            address: wallet.address,
            apiKey: creds.key,
            secret: creds.secret,
            passphrase: creds.passphrase,
            generatedAt: new Date().toISOString()
        };
        
        fs.writeFileSync(credsFile, JSON.stringify(credsData, null, 2));
        console.log(`\n💾 凭证已保存到: .credentials.json`);
        
        // 步骤 6: 通过创建新客户端测试凭证
        console.log('\n📍 步骤 4: 测试凭证...');
        
        // 创建一个新的已认证客户端
        const authClient = new ClobClient(host, chainId, wallet, creds);
        
        // 尝试获取服务器时间
        const serverTime = await authClient.getServerTime();
        console.log(`✅ 认证成功！服务器时间: ${new Date(serverTime).toISOString()}`);
        
        // 显示使用说明
        console.log('\n' + '='.repeat(70));
        console.log('📖 如何使用这些凭证:');
        console.log('='.repeat(70));
        console.log('\n1. 使用环境变量 (推荐):');
        console.log('   将以下内容添加到 .env 文件:');
        console.log(`   CLOB_API_KEY=${creds.key}`);
        console.log(`   CLOB_SECRET=${creds.secret}`);
        console.log(`   CLOB_PASS_PHRASE=${creds.passphrase}`);
        
        console.log('\n2. 在代码中使用:');
        console.log('   ```typescript');
        console.log('   const wallet = new Wallet(privateKey);');
        console.log('   const client = new ClobClient(host, chainId, wallet);');
        console.log('   const creds = await client.createOrDeriveApiKey();');
        console.log('   // 创建已认证客户端');
        console.log('   const authClient = new ClobClient(host, chainId, wallet, creds);');
        console.log('   // 现在您可以进行认证请求了');
        console.log('   ```');
        
        console.log('\n3. 重要说明:');
        console.log('   ⚠️  请保密这些凭证 - 它们控制您的钱包！');
        console.log('   ⚠️  .credentials.json 文件已在 .gitignore 中 (安全)');
        console.log('   ⚠️  您可以随时使用此脚本重新生成凭证');
        console.log('   ✅ 这些凭证是钱包特定的且确定性的');
        console.log('   ✅ 再次运行此脚本将派生相同的凭证');
        
        console.log('\n' + '='.repeat(70));
        console.log('✅ 完成！您的凭证已准备好使用。');
        console.log('='.repeat(70));
        
    } catch (error: any) {
        console.error('\n❌ 生成凭证时出错:', error.message);
        console.log('\n💡 常见问题:');
        console.log('   - 确保您的私钥正确');
        console.log('   - 检查您的互联网连接');
        console.log('   - 确保该钱包之前在 Polymarket 上使用过');
        process.exit(1);
    }
}

// 检查现有凭证的附加实用函数
async function checkExistingCredentials() {
    const credsFile = path.join(__dirname, '..', '.credentials.json');
    
    if (fs.existsSync(credsFile)) {
        console.log('\n📄 找到现有凭证文件:');
        const creds = JSON.parse(fs.readFileSync(credsFile, 'utf-8'));
        console.log(`   地址: ${creds.address}`);
        console.log(`   API Key: ${creds.apiKey.substring(0, 20)}...`);
        console.log(`   生成时间: ${new Date(creds.generatedAt).toLocaleString()}`);
        return true;
    }
    return false;
}

// 运行脚本
if (require.main === module) {
    (async () => {
        try {
            await checkExistingCredentials();
            await generateCredentials();
        } catch (error) {
            console.error('致命错误:', error);
            process.exit(1);
        }
    })();
}

export { generateCredentials };

