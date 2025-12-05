/**
 * Polymarket 智能合约交互模块
 * 
 * 提供 Mint（铸造）、Split（拆分）、Merge（合并）等核心功能
 * 
 * Polymarket 使用的合约：
 * - ConditionalTokens: 条件代币框架合约
 * - USDC: 结算代币
 */

import { Contract, Wallet, BigNumber, constants, utils } from "ethers"
import { JsonRpcProvider } from "@ethersproject/providers"

// Polygon 主网合约地址
export const CONTRACTS = {
  // 条件代币合约 (ConditionalTokens / Gnosis CTF)
  CONDITIONAL_TOKENS: "0x4D97DCd97eC945f40cF65F87097ACe5EA0476045",
  // USDC 合约
  USDC: "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174",
  // Polymarket 交易所授权合约 (用于订单簿交易)
  CTF_EXCHANGE: "0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E",
  // NegRisk 适配器
  NEG_RISK_ADAPTER: "0xd91E80cF2E7be2e162c6513ceD06f1dD0dA35296",
} as const

// 手续费配置
export const FEES = {
  // Polymarket 交易手续费 (maker: 0%, taker: ~1%)
  TAKER_FEE_PERCENT: 1.0,
  MAKER_FEE_PERCENT: 0,
  // Gas 费估算 (MATIC)
  ESTIMATED_GAS_MATIC: 0.01,
}

// ABI 片段 - 只包含需要的函数
const CONDITIONAL_TOKENS_ABI = [
  // splitPosition: 铸造代币 (支付 USDC 获得一套代币)
  "function splitPosition(address collateralToken, bytes32 parentCollectionId, bytes32 conditionId, uint256[] calldata partition, uint256 amount) external",
  // mergePositions: 合并代币赎回 (销毁一套代币换回 USDC)
  "function mergePositions(address collateralToken, bytes32 parentCollectionId, bytes32 conditionId, uint256[] calldata partition, uint256 amount) external",
  // 查询结果数量
  "function getOutcomeSlotCount(bytes32 conditionId) external view returns (uint256)",
  // 查询代币余额 (ERC1155)
  "function balanceOf(address owner, uint256 positionId) external view returns (uint256)",
]

const USDC_ABI = [
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function allowance(address owner, address spender) external view returns (uint256)",
  "function balanceOf(address account) external view returns (uint256)",
  "function decimals() external view returns (uint8)",
]

const ERC1155_ABI = [
  "function balanceOf(address account, uint256 id) external view returns (uint256)",
  "function setApprovalForAll(address operator, bool approved) external",
  "function isApprovedForAll(address account, address operator) external view returns (bool)",
]

// 零值 bytes32
const ZERO_BYTES32 = "0x0000000000000000000000000000000000000000000000000000000000000000"

/**
 * 计算 Position ID (用于查询特定 outcome 的代币余额)
 * 
 * @param collateralToken - USDC 地址
 * @param collectionId - Collection ID
 * @param outcomeIndex - 结果索引 (0, 1, ...)
 */
export function calculatePositionId(
  collateralToken: string,
  collectionId: string,
  outcomeIndex: number
): string {
  const encoded = utils.solidityPack(
    ["address", "bytes32", "uint256"],
    [collateralToken, collectionId, outcomeIndex]
  )
  return utils.keccak256(encoded)
}

/**
 * 计算 Collection ID
 */
export function calculateCollectionId(
  conditionId: string,
  indexSet: number
): string {
  const encoded = utils.solidityPack(
    ["bytes32", "uint256"],
    [conditionId, indexSet]
  )
  return utils.keccak256(encoded)
}

/**
 * Polymarket 合约交互类
 */
export class PolymarketContracts {
  private provider: JsonRpcProvider
  private wallet: Wallet
  private conditionalTokens: Contract
  private usdc: Contract

  constructor(privateKey: string, rpcUrl?: string) {
    const rpc = rpcUrl || process.env.RPC_URL || "https://polygon-rpc.com"
    this.provider = new JsonRpcProvider(rpc)
    this.wallet = new Wallet(privateKey, this.provider)
    
    this.conditionalTokens = new Contract(
      CONTRACTS.CONDITIONAL_TOKENS,
      CONDITIONAL_TOKENS_ABI,
      this.wallet
    )
    
    this.usdc = new Contract(
      CONTRACTS.USDC,
      USDC_ABI,
      this.wallet
    )
  }

  /**
   * 获取钱包地址
   */
  get address(): string {
    return this.wallet.address
  }

  /**
   * 检查并授权 USDC 给 ConditionalTokens 合约
   */
  async ensureUsdcApproval(amount: BigNumber): Promise<boolean> {
    try {
      const currentAllowance: BigNumber = await this.usdc.allowance(
        this.wallet.address,
        CONTRACTS.CONDITIONAL_TOKENS
      )

      if (currentAllowance.gte(amount)) {
        console.log("✅ USDC 授权充足")
        return true
      }

      console.log("🔄 正在授权 USDC...")
      const tx = await this.usdc.approve(
        CONTRACTS.CONDITIONAL_TOKENS,
        constants.MaxUint256 // 授权最大值，避免每次授权
      )
      await tx.wait()
      console.log("✅ USDC 授权成功")
      return true
    } catch (error: any) {
      console.error("❌ USDC 授权失败:", error.message)
      return false
    }
  }

  /**
   * 检查 USDC 余额
   */
  async getUsdcBalance(): Promise<number> {
    const balance: BigNumber = await this.usdc.balanceOf(this.wallet.address)
    return balance.toNumber() / 1e6 // USDC 6 位小数
  }

  /**
   * 获取代币余额 (ERC1155)
   */
  async getTokenBalance(positionId: string): Promise<number> {
    try {
      const balance: BigNumber = await this.conditionalTokens.balanceOf(
        this.wallet.address,
        positionId
      )
      return balance.toNumber() / 1e6
    } catch {
      return 0
    }
  }

  /**
   * 铸造代币 (Mint/Split)
   * 
   * 支付 USDC 获得一整套结果代币
   * 例如：支付 $10 USDC，获得 10 个 YES + 10 个 NO
   * 
   * @param conditionId - 市场条件 ID (bytes32)
   * @param amount - 铸造金额（USDC，例如 10 = $10）
   * @param outcomeCount - 结果数量（二元市场=2，多选项市场>2）
   */
  async mintTokens(
    conditionId: string,
    amount: number,
    outcomeCount: number = 2
  ): Promise<{ success: boolean; txHash?: string; error?: string }> {
    try {
      console.log("=".repeat(50))
      console.log("🔨 铸造代币 (Mint/Split)")
      console.log("=".repeat(50))
      console.log(`市场 ID: ${conditionId}`)
      console.log(`金额: $${amount} USDC`)
      console.log(`结果数量: ${outcomeCount}`)

      // 转换为 USDC 精度 (6 位小数)
      const amountWei = BigNumber.from(Math.floor(amount * 1e6))

      // 检查并授权 USDC
      const approved = await this.ensureUsdcApproval(amountWei)
      if (!approved) {
        return { success: false, error: "USDC 授权失败" }
      }

      // 检查余额
      const balance = await this.getUsdcBalance()
      if (balance < amount) {
        return { success: false, error: `USDC 余额不足: ${balance.toFixed(2)} < ${amount}` }
      }

      // 构建 partition 数组
      // 对于二元市场: [1, 2] 表示 outcome 0 和 outcome 1
      // 对于多选项市场: [1, 2, 4, 8, ...] 表示每个 outcome 的位掩码
      const partition: number[] = []
      for (let i = 0; i < outcomeCount; i++) {
        partition.push(1 << i) // 2^i
      }

      console.log(`Partition: [${partition.join(", ")}]`)
      console.log("\n🔄 正在执行铸造交易...\n")

      // 调用 splitPosition
      const tx = await this.conditionalTokens.splitPosition(
        CONTRACTS.USDC,
        ZERO_BYTES32, // parentCollectionId = 0 for root position
        conditionId,
        partition,
        amountWei,
        {
          gasLimit: 500000,
        }
      )

      console.log(`📤 交易已提交: ${tx.hash}`)
      const receipt = await tx.wait()
      console.log(`✅ 铸造成功! Block: ${receipt.blockNumber}`)
      console.log(`   Gas 使用: ${receipt.gasUsed.toString()}`)

      return {
        success: true,
        txHash: tx.hash,
      }
    } catch (error: any) {
      console.error("❌ 铸造失败:", error.message)
      return {
        success: false,
        error: error.reason || error.message,
      }
    }
  }

  /**
   * 合并代币赎回 (Merge)
   * 
   * 将一整套结果代币合并，赎回 USDC
   * 例如：合并 10 个 YES + 10 个 NO，赎回 $10 USDC
   * 
   * 注意：需要持有每个 outcome 至少 amount 数量的代币
   * 
   * @param conditionId - 市场条件 ID
   * @param amount - 合并数量（每个结果代币的数量）
   * @param outcomeCount - 结果数量
   */
  async mergeTokens(
    conditionId: string,
    amount: number,
    outcomeCount: number = 2
  ): Promise<{ success: boolean; txHash?: string; error?: string }> {
    try {
      console.log("=".repeat(50))
      console.log("🔄 合并代币赎回 (Merge)")
      console.log("=".repeat(50))
      console.log(`市场 ID: ${conditionId}`)
      console.log(`数量: ${amount} (每个 outcome)`)
      console.log(`结果数量: ${outcomeCount}`)

      // 转换精度
      const amountWei = BigNumber.from(Math.floor(amount * 1e6))

      // 构建 partition 数组
      const partition: number[] = []
      for (let i = 0; i < outcomeCount; i++) {
        partition.push(1 << i)
      }

      console.log(`Partition: [${partition.join(", ")}]`)
      console.log("\n🔄 正在执行合并交易...\n")

      // 调用 mergePositions
      const tx = await this.conditionalTokens.mergePositions(
        CONTRACTS.USDC,
        ZERO_BYTES32,
        conditionId,
        partition,
        amountWei,
        {
          gasLimit: 500000,
        }
      )

      console.log(`📤 交易已提交: ${tx.hash}`)
      const receipt = await tx.wait()
      console.log(`✅ 合并成功! Block: ${receipt.blockNumber}`)
      console.log(`   赎回金额: $${amount} USDC`)
      console.log(`   Gas 使用: ${receipt.gasUsed.toString()}`)

      return {
        success: true,
        txHash: tx.hash,
      }
    } catch (error: any) {
      console.error("❌ 合并失败:", error.message)
      return {
        success: false,
        error: error.reason || error.message,
      }
    }
  }

  /**
   * 计算扣除手续费后的净利润
   * 
   * @param grossProfit - 毛利润
   * @param isTaker - 是否为 Taker（主动成交）
   */
  static calculateNetProfit(
    grossProfit: number,
    isTaker: boolean = true
  ): number {
    const feePercent = isTaker ? FEES.TAKER_FEE_PERCENT : FEES.MAKER_FEE_PERCENT
    const fee = grossProfit * (feePercent / 100)
    return grossProfit - fee - FEES.ESTIMATED_GAS_MATIC
  }

  /**
   * 检查代币授权状态 (用于订单簿交易)
   */
  async ensureTokenApproval(
    operatorAddress: string = CONTRACTS.CTF_EXCHANGE
  ): Promise<boolean> {
    try {
      const tokenContract = new Contract(
        CONTRACTS.CONDITIONAL_TOKENS,
        ERC1155_ABI,
        this.wallet
      )

      const isApproved = await tokenContract.isApprovedForAll(
        this.wallet.address,
        operatorAddress
      )

      if (isApproved) {
        console.log("✅ 代币授权充足")
        return true
      }

      console.log("🔄 正在授权代币...")
      const tx = await tokenContract.setApprovalForAll(operatorAddress, true)
      await tx.wait()
      console.log("✅ 代币授权成功")
      return true
    } catch (error: any) {
      console.error("❌ 代币授权失败:", error.message)
      return false
    }
  }

  /**
   * 获取市场的结果数量
   */
  async getOutcomeCount(conditionId: string): Promise<number> {
    try {
      const count = await this.conditionalTokens.getOutcomeSlotCount(conditionId)
      return count.toNumber()
    } catch {
      return 2 // 默认二元市场
    }
  }
}

/**
 * 创建合约实例的工厂函数
 */
export function createPolymarketContracts(privateKey?: string): PolymarketContracts | null {
  const key = privateKey || process.env.PRIVATE_KEY
  if (!key) {
    console.error("❌ 未配置 PRIVATE_KEY")
    return null
  }
  return new PolymarketContracts(key)
}

/**
 * 计算铸造拆分套利的净利润
 * 
 * @param totalBidSum - 所有 outcome 的最佳买价之和
 * @param mintAmount - 铸造金额
 */
export function calculateMintSplitProfit(
  totalBidSum: number,
  mintAmount: number
): { grossProfit: number; netProfit: number; profitPercent: number } {
  // 毛利润 = (卖出总价 - 铸造成本)
  // 铸造成本 = mintAmount (支付 $10 获得每个 outcome 各 10 个)
  // 卖出总价 = totalBidSum * mintAmount (以各自 bid 价格卖出)
  const sellTotal = totalBidSum * mintAmount
  const grossProfit = sellTotal - mintAmount
  
  // 净利润 = 毛利润 - 手续费 - Gas
  const netProfit = PolymarketContracts.calculateNetProfit(grossProfit)
  
  // 利润率
  const profitPercent = (netProfit / mintAmount) * 100

  return { grossProfit, netProfit, profitPercent }
}
