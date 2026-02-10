import { Networks } from "@stellar/stellar-sdk"
import { CELO_NETWORKS, getNetworkConfig, getNetworkPassphrase, getExplorerUrl } from "@/lib/celo-config"

describe("Stellar Network Configuration", () => {
  test("provides Soroban testnet configuration", () => {
    const config = getNetworkConfig("testnet")
    expect(config.name).toContain("Testnet")
    expect(config.rpcUrl).toMatch(/^https:\/\//)
    expect(config.horizonUrl).toMatch(/^https:\/\//)
    expect(config.explorerUrl).toContain("stellar.expert")
    expect(config.nativeCurrency.symbol).toBe("XLM")
    expect(config.testnet).toBe(true)
    expect(getNetworkPassphrase("testnet")).toBe(Networks.TESTNET)
  })

  test("provides Soroban mainnet configuration", () => {
    const config = getNetworkConfig("mainnet")
    expect(config.name).toContain("Mainnet")
    expect(config.rpcUrl).toMatch(/^https:\/\//)
    expect(config.horizonUrl).toMatch(/^https:\/\//)
    expect(config.nativeCurrency.symbol).toBe("XLM")
    expect(config.testnet).toBe(false)
    expect(getNetworkPassphrase("mainnet")).toBe(Networks.PUBLIC)
  })

  test("aliases sepolia to Stellar testnet", () => {
    const aliasConfig = getNetworkConfig("sepolia")
    const testnetConfig = getNetworkConfig("testnet")
    expect(aliasConfig).toBe(testnetConfig)
  })

  test("exposes explorer URLs for transactions and accounts", () => {
    const txUrl = getExplorerUrl("abc123")
    expect(txUrl).toContain("/tx/abc123")

    const accountUrl = getExplorerUrl("GBTESTACCOUNT", "testnet", "account")
    expect(accountUrl).toContain("/account/GBTESTACCOUNT")
  })

  test("legacy CELO_NETWORKS export remains available", () => {
    expect(CELO_NETWORKS.testnet).toBeDefined()
    expect(CELO_NETWORKS.mainnet).toBeDefined()
    expect(CELO_NETWORKS.sepolia).toBe(CELO_NETWORKS.testnet)
  })
})
