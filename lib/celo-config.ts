import { Networks, Server } from "@stellar/stellar-sdk"
import { SorobanRpc } from "@stellar/soroban-client"

export type StellarNetworkKey = "testnet" | "mainnet" | "sepolia"

export interface StellarNetworkConfig {
  name: string
  chainId: number
  rpcUrl: string
  horizonUrl: string
  explorerUrl: string
  networkPassphrase: string
  nativeCurrency: {
    name: string
    symbol: string
    decimals: number
  }
  friendbotUrl?: string
  testnet: boolean
}

const BASE_NETWORKS: Record<Exclude<StellarNetworkKey, "sepolia">, StellarNetworkConfig> = {
  testnet: {
    name: "Stellar Soroban Testnet",
    chainId: 0,
    rpcUrl: "https://soroban-testnet.stellar.org",
    horizonUrl: "https://horizon-testnet.stellar.org",
    explorerUrl: "https://stellar.expert/explorer/testnet",
    networkPassphrase: Networks.TESTNET,
    nativeCurrency: {
      name: "Lumens",
      symbol: "XLM",
      decimals: 7,
    },
    friendbotUrl: "https://friendbot.stellar.org",
    testnet: true,
  },
  mainnet: {
    name: "Stellar Soroban Mainnet",
    chainId: 1,
    rpcUrl: "https://soroban-rpc.stellar.org",
    horizonUrl: "https://horizon.stellar.org",
    explorerUrl: "https://stellar.expert/explorer/public",
    networkPassphrase: Networks.PUBLIC,
    nativeCurrency: {
      name: "Lumens",
      symbol: "XLM",
      decimals: 7,
    },
    testnet: false,
  },
}

export const STELLAR_NETWORKS = BASE_NETWORKS

export const CELO_NETWORKS: Record<StellarNetworkKey, StellarNetworkConfig> = {
  testnet: BASE_NETWORKS.testnet,
  mainnet: BASE_NETWORKS.mainnet,
  sepolia: BASE_NETWORKS.testnet,
}

function normalizeNetworkKey(network: StellarNetworkKey): Exclude<StellarNetworkKey, "sepolia"> {
  return network === "sepolia" ? "testnet" : network
}

export function getNetworkConfig(network: StellarNetworkKey = "testnet"): StellarNetworkConfig {
  return CELO_NETWORKS[network]
}

export function getSorobanServer(network: StellarNetworkKey = "testnet"): SorobanRpc.Server {
  const config = getNetworkConfig(network)
  return new SorobanRpc.Server(config.rpcUrl, { allowHttp: false })
}

export async function getProvider(network: StellarNetworkKey = "testnet") {
  // Temporary compatibility shim until the rest of the stack migrates to Soroban
  return getSorobanServer(network) as any
}

export function getHorizonServer(network: StellarNetworkKey = "testnet") {
  const config = getNetworkConfig(network)
  return new Server(config.horizonUrl, { allowHttp: false })
}

export function getNetworkPassphrase(network: StellarNetworkKey = "testnet"): string {
  return getNetworkConfig(network).networkPassphrase
}

export function getExplorerUrl(identifier: string, network: StellarNetworkKey = "testnet", type: "tx" | "account" = "tx"): string {
  const normalizedNetwork = normalizeNetworkKey(network)
  const config = BASE_NETWORKS[normalizedNetwork]
  const path = type === "account" ? `/account/${identifier}` : `/tx/${identifier}`
  return `${config.explorerUrl}${path}`
}

export function getFriendbotUrl(publicKey: string, network: StellarNetworkKey = "testnet"): string | null {
  const config = getNetworkConfig(network)
  if (!config.friendbotUrl) return null
  return `${config.friendbotUrl}?addr=${publicKey}`
}
