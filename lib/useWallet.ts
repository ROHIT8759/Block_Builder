import { useCallback, useEffect, useMemo, useState } from "react"
import * as Freighter from "@stellar/freighter-api"
import * as SorobanRpc from "@stellar/stellar-sdk/rpc"
import { CELO_NETWORKS, getNetworkConfig, getSorobanServer, type StellarNetworkKey } from "./celo-config"

type FreighterNetworkDetails = {
  network?: string
  networkUrl?: string
  rpcUrl?: string
  networkPassphrase?: string
}

type FreighterApi = {
  isConnected?: () => Promise<boolean>
  isAllowed?: () => Promise<boolean>
  requestAccess?: (details?: FreighterNetworkDetails) => Promise<boolean>
  getPublicKey?: () => Promise<string>
  getNetwork?: () => Promise<FreighterNetworkDetails>
  setAllowed?: (allowed: boolean) => Promise<boolean>
  listenForNetworkChanges?: (handler: (details: FreighterNetworkDetails) => void) => Promise<() => void> | (() => void)
  onNetworkChange?: (handler: (details: FreighterNetworkDetails) => void) => void | (() => void)
}

declare global {
  interface Window {
    freighterApi?: FreighterApi
  }
}

function resolveFreighterFunction<TKey extends keyof FreighterApi>(key: TKey): FreighterApi[TKey] {
  const moduleCandidate = (Freighter as unknown as FreighterApi)?.[key]
  if (moduleCandidate) {
    return moduleCandidate
  }

  if (typeof window === "undefined") {
    return undefined as FreighterApi[TKey]
  }

  return window.freighterApi?.[key]
}

function mapNetworkKey(details?: FreighterNetworkDetails): StellarNetworkKey {
  const value = details?.network?.toUpperCase()
  if (value === "PUBLIC" || value === "MAINNET") {
    return "mainnet"
  }
  return "testnet"
}

function buildNetworkDetails(network: StellarNetworkKey): FreighterNetworkDetails {
  const config = getNetworkConfig(network)
  return {
    network: network === "mainnet" ? "PUBLIC" : "TESTNET",
    networkPassphrase: config.networkPassphrase,
    networkUrl: config.horizonUrl,
    rpcUrl: config.rpcUrl,
  }
}

async function safelyInvoke<T>(fn: (() => Promise<T>) | undefined, fallback?: T): Promise<T | undefined> {
  if (typeof fn !== "function") {
    return fallback
  }
  try {
    return await fn()
  } catch (error) {
    console.warn("Freighter call failed", error)
    return fallback
  }
}

export function useWallet(defaultNetwork: StellarNetworkKey = "testnet") {
  const [walletAddress, setWalletAddress] = useState<string | null>(null)
  const [network, setNetwork] = useState<StellarNetworkKey>(defaultNetwork)
  const [server, setServer] = useState<SorobanRpc.Server | null>(null)
  const [chainId, setChainId] = useState<number | null>(null)
  const [isConnecting, setIsConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isFreighterInstalled, setIsFreighterInstalled] = useState(false)

  const updateNetworkState = useCallback((target: StellarNetworkKey) => {
    const config = getNetworkConfig(target)
    setNetwork(target)
    setChainId(config.chainId)
    setServer(getSorobanServer(target))
  }, [])

  const refreshConnection = useCallback(async () => {
    if (typeof window === "undefined") {
      return
    }

    const isConnected = (await safelyInvoke(resolveFreighterFunction("isConnected"), false)) ?? false
    setIsFreighterInstalled(isConnected)

    if (!isConnected) {
      setWalletAddress(null)
      setServer(null)
      setChainId(null)
      return
    }

    const isAllowed = (await safelyInvoke(resolveFreighterFunction("isAllowed"), false)) ?? false
    if (!isAllowed) {
      setWalletAddress(null)
      return
    }

    const [publicKey, details] = await Promise.all([
      safelyInvoke(resolveFreighterFunction("getPublicKey")),
      safelyInvoke(resolveFreighterFunction("getNetwork")),
    ])

    if (publicKey) {
      setWalletAddress(publicKey)
    } else {
      setWalletAddress(null)
    }

    const resolvedNetwork = details ? mapNetworkKey(details) : defaultNetwork
    updateNetworkState(resolvedNetwork)
  }, [defaultNetwork, updateNetworkState])

  useEffect(() => {
    if (typeof window === "undefined") {
      return
    }

    let unsubscribe: void | (() => void)

    refreshConnection()

    const attachNetworkListener = async () => {
      const listenFn = resolveFreighterFunction("listenForNetworkChanges")
      const legacyFn = resolveFreighterFunction("onNetworkChange")
      const handler = (details: FreighterNetworkDetails) => {
        const nextNetwork = mapNetworkKey(details)
        updateNetworkState(nextNetwork)
      }

      try {
        if (typeof listenFn === "function") {
          unsubscribe = await listenFn(handler)
          return
        }

        if (typeof legacyFn === "function") {
          unsubscribe = await legacyFn(handler)
        }
      } catch (error) {
        console.warn("Failed to attach Freighter network listener", error)
      }
    }

    attachNetworkListener()

    return () => {
      if (typeof unsubscribe === "function") {
        unsubscribe()
      }
    }
  }, [refreshConnection, updateNetworkState])

  const connect = useCallback(
    async (targetNetwork: StellarNetworkKey = defaultNetwork) => {
      try {
        setIsConnecting(true)
        setError(null)

        const requestAccess = resolveFreighterFunction("requestAccess")
        if (typeof requestAccess !== "function") {
          throw new Error("Freighter extension not detected")
        }

        const granted = await requestAccess(buildNetworkDetails(targetNetwork))
        if (!granted) {
          throw new Error("Freighter access was not granted")
        }

        const publicKey = (await safelyInvoke(resolveFreighterFunction("getPublicKey"))) ?? null
        if (!publicKey) {
          throw new Error("Unable to retrieve Freighter account")
        }

        setWalletAddress(publicKey)
        updateNetworkState(targetNetwork)
        setIsFreighterInstalled(true)
        return publicKey
      } catch (err: any) {
        const message = err?.message || "Failed to connect to Freighter"
        setError(message)
        throw new Error(message)
      } finally {
        setIsConnecting(false)
      }
    },
    [defaultNetwork, updateNetworkState],
  )

  const disconnect = useCallback(async () => {
    setWalletAddress(null)
    setChainId(null)
    setServer(null)
    setError(null)

    const setAllowed = resolveFreighterFunction("setAllowed")
    if (typeof setAllowed === "function") {
      try {
        await setAllowed(false)
      } catch (error) {
        console.warn("Failed to revoke Freighter permissions", error)
      }
    }
  }, [])

  const switchNetwork = useCallback(
    async (nextNetwork: StellarNetworkKey) => {
      try {
        const requestAccess = resolveFreighterFunction("requestAccess")
        if (typeof requestAccess !== "function") {
          throw new Error("Freighter extension not detected")
        }

        await requestAccess(buildNetworkDetails(nextNetwork))
        updateNetworkState(nextNetwork)
        return true
      } catch (err: any) {
        const message = err?.message || "Failed to switch network"
        setError(message)
        return false
      }
    },
    [updateNetworkState],
  )

  const provider = useMemo(() => server, [server])

  return {
    walletAddress,
    provider,
    chainId,
    network,
    isConnecting,
    error,
    isFreighterInstalled,
    isConnected: !!walletAddress,
    connect,
    disconnect,
    switchNetwork,
    refresh: refreshConnection,
  }
}
