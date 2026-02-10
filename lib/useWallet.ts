import { useCallback, useEffect, useMemo, useState } from "react"
import { isConnected, isAllowed, getAddress, getNetwork, requestAccess, setAllowed } from "@stellar/freighter-api"
import { rpc } from "@stellar/stellar-sdk"
import { CELO_NETWORKS, getNetworkConfig, getSorobanServer, type StellarNetworkKey } from "./celo-config"

type FreighterNetworkDetails = {
  network?: string
  networkUrl?: string
  rpcUrl?: string
  networkPassphrase?: string
}

declare global {
  interface Window {
    freighterApi?: any
  }
}

function mapNetworkKey(network?: string): StellarNetworkKey {
  const value = network?.toUpperCase()
  if (value === "PUBLIC" || value === "MAINNET") {
    return "mainnet"
  }
  return "testnet"
}

function buildNetworkDetails(network: StellarNetworkKey): any {
  const config = getNetworkConfig(network)
  return {
    network: network === "mainnet" ? "PUBLIC" : "TESTNET",
    networkPassphrase: config.networkPassphrase,
    networkUrl: config.horizonUrl,
    rpcUrl: config.rpcUrl,
  }
}

export function useWallet(defaultNetwork: StellarNetworkKey = "testnet") {
  const [walletAddress, setWalletAddress] = useState<string | null>(null)
  const [network, setNetwork] = useState<StellarNetworkKey>(defaultNetwork)
  const [server, setServer] = useState<rpc.Server | null>(null)
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

    // Check if Freighter extension is installed
    const installed = typeof window.freighterApi !== "undefined"
    console.log("🔍 Freighter detection:", { 
      windowFreighterApi: typeof window.freighterApi,
      installed 
    })
    setIsFreighterInstalled(installed)

    if (!installed) {
      setWalletAddress(null)
      setServer(null)
      setChainId(null)
      return
    }

    try {
      // Check if user has already connected
      const connectionResult = await isConnected()
      console.log("📡 Freighter isConnected result:", connectionResult)
      
      if (!connectionResult.isConnected) {
        setWalletAddress(null)
        return
      }

      const allowedResult = await isAllowed()
      console.log("🔐 Freighter isAllowed result:", allowedResult)
      
      if (!allowedResult) {
        setWalletAddress(null)
        return
      }

      const addressResult = await getAddress()
      console.log("📍 Freighter getAddress result:", addressResult)
      
      const networkResult = await getNetwork()
      console.log("🌐 Freighter getNetwork result:", networkResult)

      if (addressResult.address) {
        setWalletAddress(addressResult.address)
      } else {
        setWalletAddress(null)
      }

      const resolvedNetwork = networkResult.network ? mapNetworkKey(networkResult.network) : defaultNetwork
      updateNetworkState(resolvedNetwork)
    } catch (err) {
      console.warn("⚠️ Freighter connection check failed:", err)
      setWalletAddress(null)
    }
  }, [defaultNetwork, updateNetworkState])

  useEffect(() => {
    if (typeof window === "undefined") {
      return
    }

    let checkInterval: NodeJS.Timeout | null = null
    let checksRemaining = 40 // Check for up to 20 seconds (40 * 500ms)

    // Function to check if Freighter is available
    const checkFreighterAvailability = () => {
      const isAvailable = typeof window.freighterApi !== "undefined"
      console.log("🔍 Checking Freighter:", { 
        freighterApi: typeof window.freighterApi, 
        isAvailable,
        windowKeys: typeof window !== 'undefined' ? Object.keys(window).filter(k => k.toLowerCase().includes('freight')) : []
      })
      
      if (isAvailable) {
        console.log("✅ Freighter extension found!")
        setIsFreighterInstalled(true)
        refreshConnection()
        if (checkInterval) {
          clearInterval(checkInterval)
          checkInterval = null
        }
        return true
      }
      return false
    }

    // Check immediately
    const foundImmediately = checkFreighterAvailability()

    // If not found immediately, keep checking periodically
    if (!foundImmediately) {
      console.log("⏳ Waiting for Freighter extension to load...")
      checkInterval = setInterval(() => {
        checksRemaining--
        const found = checkFreighterAvailability()
        
        if (found || checksRemaining <= 0) {
          if (!found && checksRemaining <= 0) {
            console.log("❌ Freighter extension not detected after 20 seconds")
            setIsFreighterInstalled(false)
          }
          if (checkInterval) {
            clearInterval(checkInterval)
            checkInterval = null
          }
        }
      }, 500)
    }

    return () => {
      if (checkInterval) {
        clearInterval(checkInterval)
      }
    }
  }, [refreshConnection])

  const connect = useCallback(
    async (targetNetwork: StellarNetworkKey = defaultNetwork) => {
      try {
        setIsConnecting(true)
        setError(null)

        // Check if Freighter is installed - do a fresh check
        const installed = typeof window !== "undefined" && typeof window.freighterApi !== "undefined"
        console.log("🔗 Connect attempt:", { 
          installed, 
          freighterApi: typeof window?.freighterApi,
          keys: typeof window !== 'undefined' ? Object.keys(window).filter(k => k.toLowerCase().includes('freight')) : []
        })
        
        // Update state immediately
        setIsFreighterInstalled(installed)
        
        if (!installed) {
          throw new Error("Freighter extension not detected. Please install it from freighter.app")
        }

        // Request access - returns { address, error? }
        const result = await requestAccess()
        
        if (result.error || !result.address) {
          throw new Error(result.error || "Freighter access was not granted")
        }

        const publicKey = result.address
        
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

    try {
      // setAllowed in v6 doesn't revoke permissions, it just returns status
      // User needs to disconnect via Freighter extension itself
      await setAllowed()
    } catch (error) {
      console.warn("Failed to update Freighter permissions", error)
    }
  }, [])

  const switchNetwork = useCallback(
    async (nextNetwork: StellarNetworkKey) => {
      try {
        // Request access again for the new network
        const result = await requestAccess()
        if (result.error) {
          throw new Error(result.error)
        }
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
