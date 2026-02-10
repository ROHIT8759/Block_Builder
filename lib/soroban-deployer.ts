import { type Block } from "./store"
import { type StellarNetworkKey } from "./celo-config"

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"

function randomBase32(length: number): string {
  let result = ""
  for (let index = 0; index < length; index += 1) {
    const random = Math.floor(Math.random() * BASE32_ALPHABET.length)
    result += BASE32_ALPHABET[random]
  }
  return result
}

export type SorobanDeploymentParams = {
  walletAddress: string
  network: StellarNetworkKey
  contractName: string
  tokenName: string
  tokenSymbol: string
  initialSupply: string
  sourceCode: string
  blocks: Block[]
}

export type SorobanDeploymentResult = {
  contractId: string
  transactionId: string
  explorerUrl: string | null
  simulated: boolean
}

export async function deploySorobanContract(_params: SorobanDeploymentParams): Promise<SorobanDeploymentResult> {
  // Temporary simulation while the Soroban deployment pipeline is implemented.
  await new Promise((resolve) => setTimeout(resolve, 1200))

  const contractId = `CD${randomBase32(54)}`
  const transactionId = `SIM-${randomBase32(8)}-${Date.now().toString(36).toUpperCase()}`

  return {
    contractId,
    transactionId,
    explorerUrl: null,
    simulated: true,
  }
}
