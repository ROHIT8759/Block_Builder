import * as Freighter from "@stellar/freighter-api"
import { Buffer } from "buffer"
import {
  Address,
  Contract,
  Operation,
  Transaction,
  TransactionBuilder,
  nativeToScVal,
  rpc,
  xdr,
} from "@stellar/stellar-sdk"
import { getExplorerUrl, getNetworkPassphrase, getSorobanServer, type StellarNetworkKey } from "./celo-config"
import { type Block } from "./store"

const BASE_FEE = "400000"
const TOKEN_DECIMALS = 7
// Fetch the canonical Soroban token contract compiled WASM until local builds are supported.
const TOKEN_WASM_URL =
  "https://github.com/stellar/soroban-example-dapp/raw/main/soroban-token-contract/target/wasm32-unknown-unknown/release/soroban_token_contract.wasm"
const TRANSACTION_POLL_INTERVAL_MS = 1000
const TRANSACTION_POLL_TIMEOUT_MS = 60_000

let cachedTokenWasm: Uint8Array | null = null

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
  explorerUrl: string
}

function toBigIntAmount(amount: string, decimals: number): bigint {
  const base = amount.trim()
  if (!base) {
    throw new Error("Initial supply is required")
  }

  if (!/^[0-9]+(\.[0-9]+)?$/.test(base)) {
    throw new Error("Initial supply must be a numeric value")
  }

  const [whole, fraction = ""] = base.split(".")
  if (fraction.length > decimals) {
    throw new Error(`Initial supply supports at most ${decimals} decimal places`)
  }

  const scaledWhole = BigInt(whole || "0") * (BigInt(10) ** BigInt(decimals))
  const fractionPadded = (fraction || "").padEnd(decimals, "0")
  const scaledFraction = BigInt(fractionPadded || "0")

  return scaledWhole + scaledFraction
}

async function fetchTokenWasm(): Promise<Uint8Array> {
  if (cachedTokenWasm) {
    return cachedTokenWasm
  }

  const response = await fetch(TOKEN_WASM_URL)
  if (!response.ok) {
    throw new Error("Failed to download Soroban token contract WASM")
  }

  const arrayBuffer = await response.arrayBuffer()
  cachedTokenWasm = new Uint8Array(arrayBuffer)
  return cachedTokenWasm
}

async function simulateAndAssemble(server: rpc.Server, tx: Transaction) {
  const simulation = await server.simulateTransaction(tx)
  if (rpc.Api.isSimulationError(simulation)) {
    throw new Error(simulation.error)
  }
  const assembled = rpc.assembleTransaction(tx, simulation)
  return assembled.build()
}

async function waitForTransaction(server: rpc.Server, hash: string) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < TRANSACTION_POLL_TIMEOUT_MS) {
    const result = await server.getTransaction(hash)
    if (result.status === "SUCCESS" || result.status === "FAILED") {
      return result
    }
    await new Promise((resolve) => setTimeout(resolve, TRANSACTION_POLL_INTERVAL_MS))
  }
  throw new Error("Timed out waiting for Soroban transaction confirmation")
}

async function signAndSendTransaction(server: rpc.Server, tx: Transaction, networkPassphrase: string) {
  const signResult = await Freighter.signTransaction(tx.toXDR(), {
    networkPassphrase,
  })

  const signedTx = TransactionBuilder.fromXDR(signResult.signedTxXdr, networkPassphrase) as Transaction
  const sendResponse = await server.sendTransaction(signedTx)

  if (sendResponse.status === "ERROR") {
    throw new Error("Soroban RPC rejected the transaction")
  }

  if (!sendResponse.hash) {
    throw new Error("Soroban RPC did not return a transaction hash")
  }

  const finalResult = await waitForTransaction(server, sendResponse.hash)
  if (finalResult.status !== "SUCCESS") {
    throw new Error("Soroban transaction failed")
  }

  return {
    hash: sendResponse.hash,
    result: finalResult,
  }
}

async function installContractCode(
  server: rpc.Server,
  accountId: string,
  networkPassphrase: string,
  wasm: Uint8Array,
) {
  const account = await server.getAccount(accountId)
  let tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase,
  })
    .addOperation(
      Operation.invokeHostFunction({
        func: xdr.HostFunction.hostFunctionTypeUploadContractWasm(Buffer.from(wasm)),
        auth: [],
      }),
    )
    .setTimeout(300)
    .build()

  tx = await simulateAndAssemble(server, tx)
  const { hash, result } = await signAndSendTransaction(server, tx, networkPassphrase)

  const returnValue = result.returnValue
  if (!returnValue || returnValue.switch().name !== "scvBytes") {
    throw new Error("Unexpected response when uploading contract WASM")
  }

  const wasmHash = Buffer.from(returnValue.bytes()).toString("hex")
  return { wasmHash, hash }
}

async function createContractInstance(
  server: rpc.Server,
  accountId: string,
  networkPassphrase: string,
  wasmHash: string,
) {
  const salt = Buffer.from(globalThis.crypto.getRandomValues(new Uint8Array(32)))
  const account = await server.getAccount(accountId)

  const contractIdPreimage = xdr.ContractIdPreimage.contractIdPreimageFromAddress(
    new xdr.ContractIdPreimageFromAddress({
      address: Address.fromString(accountId).toScAddress(),
      salt,
    }),
  )

  const createArgs = new xdr.CreateContractArgs({
    contractIdPreimage,
    executable: xdr.ContractExecutable.contractExecutableWasm(Buffer.from(wasmHash, "hex")),
  })

  let tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase,
  })
    .addOperation(
      Operation.invokeHostFunction({
        func: xdr.HostFunction.hostFunctionTypeCreateContract(createArgs),
        auth: [],
      }),
    )
    .setTimeout(300)
    .build()

  tx = await simulateAndAssemble(server, tx)
  const { hash, result } = await signAndSendTransaction(server, tx, networkPassphrase)

  const returnValue = result.returnValue
  if (!returnValue || returnValue.switch().name !== "scvAddress") {
    throw new Error("Unexpected response when creating the contract instance")
  }

  const scAddress = returnValue.address()
  const contractAddress = Address.fromScAddress(scAddress).toString()
  return { contractAddress, hash }
}

async function invokeContract(
  server: rpc.Server,
  accountId: string,
  networkPassphrase: string,
  operation: ReturnType<Contract["call"]>,
) {
  const account = await server.getAccount(accountId)
  let tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase,
  })
    .addOperation(operation)
    .setTimeout(300)
    .build()

  tx = await simulateAndAssemble(server, tx)
  return signAndSendTransaction(server, tx, networkPassphrase)
}

export async function deploySorobanContract(params: SorobanDeploymentParams): Promise<SorobanDeploymentResult> {
  const { walletAddress, network, tokenName, tokenSymbol, initialSupply } = params

  const server = getSorobanServer(network)
  const networkPassphrase = getNetworkPassphrase(network)
  const wasmBinary = await fetchTokenWasm()

  const { wasmHash } = await installContractCode(server, walletAddress, networkPassphrase, wasmBinary)
  const { contractAddress, hash: creationHash } = await createContractInstance(
    server,
    walletAddress,
    networkPassphrase,
    wasmHash,
  )

  const contract = new Contract(contractAddress)
  const adminAddress = Address.fromString(walletAddress)

  const initOperation = contract.call(
    "initialize",
    adminAddress.toScVal(),
    nativeToScVal(TOKEN_DECIMALS, { type: "u32" }),
    nativeToScVal(tokenName, { type: "string" }),
    nativeToScVal(tokenSymbol, { type: "string" }),
  )

  await invokeContract(server, walletAddress, networkPassphrase, initOperation)

  const mintAmount = toBigIntAmount(initialSupply || "0", TOKEN_DECIMALS)
  if (mintAmount > BigInt(0)) {
    const mintOperation = contract.call(
      "mint",
      adminAddress.toScVal(),
      nativeToScVal(mintAmount, { type: "i128" }),
    )

    const mintResult = await invokeContract(server, walletAddress, networkPassphrase, mintOperation)
    const explorerUrl = getExplorerUrl(mintResult.hash, network, "tx")

    return {
      contractId: contractAddress,
      transactionId: mintResult.hash,
      explorerUrl,
    }
  }

  return {
    contractId: contractAddress,
    transactionId: creationHash,
    explorerUrl: getExplorerUrl(creationHash, network, "tx"),
  }
}
