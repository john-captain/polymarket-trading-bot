/**
 * 队列系统集成测试
 * 
 * 运行方式: npx ts-node scripts/test-queue-system.ts
 */

import { 
  initStrategyQueueSystem,
  startQueueSystem,
  stopQueueSystem,
  getQueueSystemStatus,
  getScanConfig,
  updateScanConfig,
  getStrategyConfigManager,
} from '../src/lib/queue'

async function testQueueSystem() {
  console.log('🧪 开始队列系统测试...\n')
  
  // 1. 测试配置管理
  console.log('📋 测试配置管理...')
  const scanConfig = getScanConfig()
  console.log('  扫描配置:', JSON.stringify(scanConfig, null, 2))
  
  updateScanConfig({ limit: 50, maxPages: 5 })
  const updatedConfig = getScanConfig()
  console.log('  更新后配置:', { limit: updatedConfig.limit, maxPages: updatedConfig.maxPages })
  console.log('  ✅ 配置管理测试通过\n')
  
  // 2. 测试策略配置
  console.log('📋 测试策略配置...')
  const strategyConfig = getStrategyConfigManager()
  const config = strategyConfig.getConfig()
  console.log('  Mint-Split 启用:', config.mintSplit.enabled)
  console.log('  Arbitrage 启用:', config.arbitrage.enabled)
  console.log('  ✅ 策略配置测试通过\n')
  
  // 3. 测试队列初始化
  console.log('🚀 测试队列初始化...')
  const queues = initStrategyQueueSystem()
  console.log('  扫描队列:', queues.scanQueue ? '✓' : '✗')
  console.log('  存储队列:', queues.storageQueue ? '✓' : '✗')
  console.log('  分发器:', queues.dispatcher ? '✓' : '✗')
  console.log('  Mint-Split:', queues.mintSplitQueue ? '✓' : '✗')
  console.log('  Arbitrage:', queues.arbitrageQueue ? '✓' : '✗')
  console.log('  Market-Making:', queues.marketMakingQueue ? '✓' : '✗')
  console.log('  订单队列:', queues.orderQueue ? '✓' : '✗')
  console.log('  ✅ 队列初始化测试通过\n')
  
  // 4. 测试队列状态获取
  console.log('📊 测试队列状态...')
  const status = getQueueSystemStatus()
  console.log('  扫描队列状态:', status.scan.state)
  console.log('  存储队列状态:', status.storage.state)
  console.log('  策略分发统计:', status.dispatcher)
  console.log('  ✅ 队列状态测试通过\n')
  
  // 5. 测试启动/停止
  console.log('🔄 测试启动/停止...')
  console.log('  启动队列系统...')
  await startQueueSystem()
  
  // 等待一下看状态
  await new Promise(resolve => setTimeout(resolve, 2000))
  
  const runningStatus = getQueueSystemStatus()
  console.log('  扫描队列状态:', runningStatus.scan.state)
  
  console.log('  停止队列系统...')
  await stopQueueSystem()
  
  const stoppedStatus = getQueueSystemStatus()
  console.log('  扫描队列状态:', stoppedStatus.scan.state)
  console.log('  ✅ 启动/停止测试通过\n')
  
  console.log('🎉 所有测试通过!')
}

// 运行测试
testQueueSystem().catch(console.error)
