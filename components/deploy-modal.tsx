"use client"

import { useEffect, useMemo, useState } from "react"
import { X, Loader, CheckCircle, AlertCircle, Wallet, Eye, ExternalLink } from "lucide-react"
import { generateSolidityCode } from "@/lib/code-generator"
import { useBuilderStore } from "@/lib/store"
import { useSupabaseStore } from "@/lib/supabase-store"
import { CELO_NETWORKS, getExplorerUrl, getFriendbotUrl, type StellarNetworkKey } from "@/lib/celo-config"
import { ContractPreviewModal } from "./contract-preview-modal"
import { saveDeployedContract } from "@/lib/supabase"
import { useWallet } from "@/lib/useWallet"
import { deploySorobanContract } from "@/lib/soroban-deployer"

type DeployStep = "connect" | "configure" | "deploying" | "success" | "error"

type FaucetStatus = "idle" | "loading" | "success" | "error"

interface DeployModalProps {
    isOpen: boolean
    onClose: () => void
}

type DeploymentSummary = {
    contractId: string
    transactionId: string
    network: StellarNetworkKey
    explorerUrl: string | null
    contractExplorerUrl: string | null
    simulated: boolean
}

const NETWORK_OPTIONS: Array<{
    key: StellarNetworkKey
    label: string
    description: string
    supportsFriendbot: boolean
}> = [
        {
            key: "testnet",
            label: CELO_NETWORKS.testnet.name,
            description: "Great for development. Uses Soroban testnet with free friendbot funding.",
            supportsFriendbot: true,
        },
        {
            key: "mainnet",
            label: CELO_NETWORKS.mainnet.name,
            description: "Live Stellar Soroban network. Requires real XLM to cover fees.",
            supportsFriendbot: false,
        },
    ]

function formatPublicKey(account?: string | null) {
    if (!account) return ""
    return `${account.slice(0, 6)}…${account.slice(-4)}`
}

function mapNetworkForStorage(network: StellarNetworkKey): "sepolia" | "mainnet" {
    return network === "testnet" ? "sepolia" : "mainnet"
}

export function DeployModal({ isOpen, onClose }: DeployModalProps) {
    const blocks = useBuilderStore((state) => state.blocks)
    const addDeployedContract = useBuilderStore((state) => state.addDeployedContract)
    const currentUser = useSupabaseStore((state) => state.user)
    const syncDeployedContracts = useSupabaseStore((state) => state.syncDeployedContracts)
    const {
        walletAddress,
        network: walletNetwork,
        chainId,
        connect,
        disconnect,
        switchNetwork,
        isConnecting,
        isFreighterInstalled,
        error: walletError,
    } = useWallet("testnet")

    const [step, setStep] = useState<DeployStep>("connect")
    const [selectedNetwork, setSelectedNetwork] = useState<StellarNetworkKey>("testnet")
    const [contractName, setContractName] = useState("GeneratedToken")
    const [tokenName, setTokenName] = useState("My Token")
    const [tokenSymbol, setTokenSymbol] = useState("MTK")
    const [initialSupply, setInitialSupply] = useState("1000000")
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [faucetStatus, setFaucetStatus] = useState<FaucetStatus>("idle")
    const [showPreview, setShowPreview] = useState(false)
    const [summary, setSummary] = useState<DeploymentSummary | null>(null)

    const solidityCode = useMemo(() => generateSolidityCode(blocks), [blocks])

    useEffect(() => {
        if (!isOpen) {
            setError(null)
            setSummary(null)
            setFaucetStatus("idle")
            setStep(walletAddress ? "configure" : "connect")
            return
        }

        if (walletAddress) {
            setStep((current) => (current === "success" || current === "error" ? current : "configure"))
        } else {
            setStep("connect")
        }
    }, [isOpen, walletAddress])

    useEffect(() => {
        if (walletNetwork) {
            setSelectedNetwork(walletNetwork)
        }
    }, [walletNetwork])

    useEffect(() => {
        setFaucetStatus("idle")
    }, [selectedNetwork])

    const activeError = error ?? walletError ?? null

    const indicatorStep: DeployStep = step === "error" ? "configure" : step
    const indicatorSteps: DeployStep[] = ["connect", "configure", "deploying", "success"]
    const indicatorIndex = indicatorSteps.indexOf(indicatorStep)

    const baseContract = blocks.find((b) => b.type === "erc20" || b.type === "nft")
    const contractType: "erc20" | "nft" = baseContract?.type === "nft" ? "nft" : "erc20"

    const handleConnectWallet = async () => {
        if (!isFreighterInstalled) {
            if (typeof window !== "undefined") {
                window.open("https://www.freighter.app/", "_blank", "noopener,noreferrer")
            }
            return
        }

        setError(null)
        try {
            setLoading(true)
            await connect(selectedNetwork)
            setStep("configure")
        } catch (err) {
            const message = err instanceof Error ? err.message : "Failed to connect wallet"
            setError(message)
            setStep("error")
        } finally {
            setLoading(false)
        }
    }

    const handleDisconnectWallet = async () => {
        try {
            setLoading(true)
            await disconnect()
            setStep("connect")
        } catch (err) {
            const message = err instanceof Error ? err.message : "Failed to disconnect wallet"
            setError(message)
        } finally {
            setLoading(false)
        }
    }

    const handleSwitchNetwork = async (target: StellarNetworkKey) => {
        setError(null)
        try {
            setLoading(true)
            const switched = await switchNetwork(target)
            if (switched) {
                setSelectedNetwork(target)
            }
        } catch (err) {
            const message = err instanceof Error ? err.message : "Failed to switch network"
            setError(message)
        } finally {
            setLoading(false)
        }
    }

    const handleRequestFunds = async () => {
        if (!walletAddress) return

        const url = getFriendbotUrl(walletAddress, selectedNetwork)
        if (!url) {
            setError("Friendbot is only available on Soroban testnet")
            return
        }

        setFaucetStatus("loading")
        setError(null)

        try {
            const response = await fetch(url)
            if (!response.ok) {
                throw new Error("Friendbot request failed")
            }
            setFaucetStatus("success")
            setTimeout(() => setFaucetStatus("idle"), 6000)
        } catch (err) {
            const message = err instanceof Error ? err.message : "Failed to request testnet funds"
            setError(message)
            setFaucetStatus("error")
        }
    }

    const handleDeploy = async () => {
        if (!walletAddress) {
            setError("Connect your Freighter wallet before deploying")
            setStep("error")
            return
        }

        if (blocks.length === 0) {
            setError("Add at least one contract block before deploying")
            setStep("error")
            return
        }

        setError(null)
        setStep("deploying")
        setLoading(true)

        try {
            const result = await deploySorobanContract({
                walletAddress,
                network: selectedNetwork,
                contractName,
                tokenName,
                tokenSymbol,
                initialSupply,
                sourceCode: solidityCode,
                blocks,
            })

            const networkConfig = CELO_NETWORKS[selectedNetwork]
            const explorerUrl = result.explorerUrl ?? null
            const contractExplorerUrl = getExplorerUrl(result.contractId, selectedNetwork, "account")

            const deployedAt = new Date().toISOString()
            const deployedContract = {
                id: Date.now().toString(),
                contractAddress: result.contractId,
                contractName,
                tokenName,
                tokenSymbol,
                network: selectedNetwork,
                networkName: networkConfig.name,
                chainId: networkConfig.chainId,
                deployer: walletAddress,
                deployedAt,
                transactionHash: result.transactionId,
                contractType,
                abi: [],
                solidityCode,
                blocks: [...blocks],
                explorerUrl: explorerUrl ?? "",
            }

            addDeployedContract(deployedContract)

            if (typeof window !== "undefined") {
                localStorage.setItem("deployedContractAddress", result.contractId)
                localStorage.setItem("deployedContractNetwork", selectedNetwork)
                localStorage.setItem("deployedContractType", contractType)
            }

            if (currentUser?.id) {
                try {
                    await saveDeployedContract(currentUser.id, {
                        contractAddress: result.contractId,
                        contractName,
                        tokenName,
                        tokenSymbol,
                        network: mapNetworkForStorage(selectedNetwork),
                        networkName: networkConfig.name,
                        chainId: networkConfig.chainId,
                        deployer: walletAddress,
                        deployedAt,
                        transactionHash: result.transactionId,
                        contractType,
                        abi: [],
                        solidityCode,
                        blocks,
                        explorerUrl: explorerUrl ?? "",
                    })
                    await syncDeployedContracts()
                } catch (storageError) {
                    console.warn("Failed to persist deployed contract to Supabase", storageError)
                }
            }

            setSummary({
                contractId: result.contractId,
                transactionId: result.transactionId,
                network: selectedNetwork,
                explorerUrl,
                contractExplorerUrl,
                simulated: result.simulated,
            })

            setStep("success")
        } catch (err) {
            const message = err instanceof Error ? err.message : "Deployment failed"
            setError(message)
            setStep("error")
        } finally {
            setLoading(false)
        }
    }

    if (!isOpen) {
        return null
    }

    const currentNetworkConfig = CELO_NETWORKS[selectedNetwork]

    return (
        <div
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
            onClick={(event) => {
                if (event.target === event.currentTarget) {
                    onClose()
                }
            }}
        >
            <div className="bg-card rounded-lg border border-border w-full max-w-2xl max-h-[90vh] overflow-auto">
                <div className="flex items-center justify-between p-6 border-b border-border sticky top-0 bg-card z-10">
                    <h2 className="text-xl font-semibold text-foreground">Deploy to Stellar Soroban</h2>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-background rounded-lg transition-colors text-muted hover:text-foreground"
                        title="Close modal"
                        aria-label="Close"
                    >
                        <X size={20} />
                    </button>
                </div>

                <div className="p-6 space-y-6">
                    <div className="flex items-center justify-between">
                        {indicatorSteps.map((item, index) => {
                            const isComplete = indicatorIndex > index
                            const isCurrent = indicatorIndex === index
                            return (
                                <div key={item} className="flex items-center flex-1">
                                    <div
                                        className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold ${isCurrent
                                                ? "bg-primary text-background"
                                                : isComplete
                                                    ? "bg-primary/80 text-background"
                                                    : "bg-border text-muted"
                                            }`}
                                    >
                                        {index + 1}
                                    </div>
                                    {index < indicatorSteps.length - 1 && (
                                        <div
                                            className={`flex-1 h-1 mx-2 ${indicatorIndex > index ? "bg-primary" : "bg-border"
                                                }`}
                                        />
                                    )}
                                </div>
                            )
                        })}
                    </div>

                    {activeError && (
                        <div className="p-4 rounded-lg border border-red-500/40 bg-red-500/10 text-sm text-red-200 flex items-start gap-3">
                            <AlertCircle size={18} className="mt-0.5 flex-shrink-0" />
                            <span>{activeError}</span>
                        </div>
                    )}

                    {step === "connect" && (
                        <div className="space-y-4">
                            <div>
                                <h3 className="text-lg font-semibold text-foreground mb-2">Step 1: Connect Freighter</h3>
                                <p className="text-sm text-muted">
                                    You&apos;ll sign Soroban transactions with the Freighter browser extension.
                                </p>
                            </div>

                            <div className="p-4 bg-primary/10 border border-primary/30 rounded-lg space-y-2">
                                <p className="text-sm font-semibold text-foreground">Supported networks</p>
                                <ul className="text-sm text-muted space-y-1">
                                    <li>• {CELO_NETWORKS.testnet.name} (Testnet)</li>
                                    <li>• {CELO_NETWORKS.mainnet.name} (Mainnet)</li>
                                </ul>
                                <p className="text-xs text-muted mt-3">
                                    Install Freighter from freighter.app if you haven&apos;t already. After installing, click connect to authorize this dApp.
                                </p>
                            </div>

                            <button
                                onClick={handleConnectWallet}
                                disabled={loading || isConnecting}
                                className="w-full px-6 py-3 bg-primary hover:bg-primary-dark disabled:opacity-50 text-background rounded-lg font-semibold transition-colors flex items-center justify-center gap-2"
                            >
                                {loading || isConnecting ? (
                                    <>
                                        <Loader size={18} className="animate-spin" />
                                        Connecting...
                                    </>
                                ) : (
                                    <>
                                        <Wallet size={18} />
                                        {isFreighterInstalled ? "Connect Freighter" : "Install Freighter"}
                                    </>
                                )}
                            </button>
                        </div>
                    )}

                    {step === "configure" && (
                        <div className="space-y-5">
                            <div>
                                <h3 className="text-lg font-semibold text-foreground mb-2">Step 2: Configure deployment</h3>
                                <p className="text-sm text-muted">Review your wallet, select a network, and set token details.</p>
                            </div>

                            <div className="p-4 bg-primary/10 border border-primary/30 rounded-lg space-y-3">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <Wallet size={18} className="text-primary" />
                                        <span className="text-sm font-semibold text-foreground">Connected wallet</span>
                                    </div>
                                    <button
                                        onClick={handleDisconnectWallet}
                                        className="text-xs text-muted hover:text-foreground transition-colors underline"
                                    >
                                        Disconnect
                                    </button>
                                </div>
                                <p className="text-xs font-mono text-foreground bg-background/50 px-2 py-1 rounded break-all">
                                    {walletAddress}
                                </p>
                                <div className="text-xs text-muted flex items-center gap-2">
                                    <span>Network:</span>
                                    <span className="text-primary font-semibold">
                                        {walletNetwork ? CELO_NETWORKS[walletNetwork].name : "Unknown"}
                                    </span>
                                    {typeof chainId === "number" && (
                                        <span className="text-muted">(chain {chainId})</span>
                                    )}
                                </div>
                                {selectedNetwork === "testnet" && walletAddress && (
                                    <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                                        <button
                                            onClick={handleRequestFunds}
                                            disabled={faucetStatus === "loading"}
                                            className="px-4 py-2 bg-background border border-border rounded-lg text-sm font-medium flex items-center gap-2 hover:border-primary hover:text-primary transition-colors disabled:opacity-50"
                                        >
                                            {faucetStatus === "loading" ? (
                                                <>
                                                    <Loader size={16} className="animate-spin" />
                                                    Requesting test XLM...
                                                </>
                                            ) : (
                                                "Request testnet funds"
                                            )}
                                        </button>
                                        {faucetStatus === "success" && (
                                            <span className="text-xs text-green-400">Friendbot request sent successfully.</span>
                                        )}
                                        {faucetStatus === "error" && (
                                            <span className="text-xs text-red-400">Friendbot request failed.</span>
                                        )}
                                    </div>
                                )}
                            </div>

                            <div className="space-y-4">
                                <div className="space-y-2">
                                    <label className="block text-sm font-medium text-foreground">Target network</label>
                                    <div className="flex flex-col gap-2">
                                        <select
                                            value={selectedNetwork}
                                            onChange={(event) => {
                                                const target = event.target.value as StellarNetworkKey
                                                setSelectedNetwork(target)
                                                if (walletNetwork && walletNetwork !== target) {
                                                    void handleSwitchNetwork(target)
                                                }
                                            }}
                                            className="px-4 py-2 bg-background border border-border rounded-lg text-foreground focus:outline-none focus:border-primary"
                                        >
                                            {NETWORK_OPTIONS.map((option) => (
                                                <option key={option.key} value={option.key}>
                                                    {option.label}
                                                </option>
                                            ))}
                                        </select>
                                        <p className="text-xs text-muted">{NETWORK_OPTIONS.find((option) => option.key === selectedNetwork)?.description}</p>
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-foreground mb-2">Contract name</label>
                                    <input
                                        type="text"
                                        value={contractName}
                                        onChange={(event) => setContractName(event.target.value)}
                                        className="w-full px-4 py-2 bg-background border border-border rounded-lg text-foreground focus:outline-none focus:border-primary"
                                        placeholder="GeneratedToken"
                                    />
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-foreground mb-2">Token name</label>
                                        <input
                                            type="text"
                                            value={tokenName}
                                            onChange={(event) => setTokenName(event.target.value)}
                                            className="w-full px-4 py-2 bg-background border border-border rounded-lg text-foreground focus:outline-none focus:border-primary"
                                            placeholder="My Token"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-foreground mb-2">Token symbol</label>
                                        <input
                                            type="text"
                                            value={tokenSymbol}
                                            onChange={(event) => setTokenSymbol(event.target.value)}
                                            className="w-full px-4 py-2 bg-background border border-border rounded-lg text-foreground focus:outline-none focus:border-primary"
                                            placeholder="MTK"
                                        />
                                    </div>
                                </div>

                                {contractType === "erc20" && (
                                    <div>
                                        <label className="block text-sm font-medium text-foreground mb-2">Initial supply</label>
                                        <input
                                            type="number"
                                            value={initialSupply}
                                            onChange={(event) => setInitialSupply(event.target.value)}
                                            className="w-full px-4 py-2 bg-background border border-border rounded-lg text-foreground focus:outline-none focus:border-primary"
                                            placeholder="1000000"
                                            min={"0"}
                                        />
                                    </div>
                                )}
                            </div>

                            <div className="flex flex-col sm:flex-row gap-3 sm:justify-between">
                                <button
                                    onClick={() => setShowPreview(true)}
                                    className="flex items-center justify-center gap-2 px-4 py-2 bg-background border border-border rounded-lg text-sm font-medium hover:border-primary hover:text-primary transition-colors"
                                >
                                    <Eye size={16} />
                                    Preview generated code
                                </button>
                                <button
                                    onClick={handleDeploy}
                                    disabled={loading}
                                    className="flex-1 sm:flex-none px-6 py-3 bg-primary hover:bg-primary-dark text-background rounded-lg font-semibold transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                                >
                                    {loading ? (
                                        <>
                                            <Loader size={18} className="animate-spin" />
                                            Deploying...
                                        </>
                                    ) : (
                                        "Deploy contract"
                                    )}
                                </button>
                            </div>
                        </div>
                    )}

                    {step === "deploying" && (
                        <div className="py-12 flex flex-col items-center gap-4 text-center">
                            <Loader size={32} className="animate-spin text-primary" />
                            <div>
                                <h3 className="text-lg font-semibold text-foreground">Submitting Soroban transaction</h3>
                                <p className="text-sm text-muted">Approve the request in Freighter to continue.</p>
                            </div>
                        </div>
                    )}

                    {step === "success" && summary && (
                        <div className="space-y-4">
                            <div className="flex items-center gap-3 text-green-400">
                                <CheckCircle size={24} />
                                <div>
                                    <h3 className="text-lg font-semibold text-foreground">Deployment recorded</h3>
                                    <p className="text-sm text-muted">
                                        {summary.simulated
                                            ? "This is a simulated deployment while the Soroban pipeline is finalized."
                                            : "Your Soroban contract transaction has been submitted."}
                                    </p>
                                </div>
                            </div>

                            <div className="p-4 bg-background border border-border rounded-lg space-y-3">
                                <div className="flex justify-between text-sm">
                                    <span className="text-muted">Network</span>
                                    <span className="font-medium text-foreground">{CELO_NETWORKS[summary.network].name}</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span className="text-muted">Transaction ID</span>
                                    <span className="font-medium text-foreground break-all">{summary.transactionId}</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span className="text-muted">Contract ID</span>
                                    <span className="font-medium text-foreground break-all">{summary.contractId}</span>
                                </div>
                            </div>

                            <div className="flex flex-col sm:flex-row gap-3">
                                {summary.explorerUrl ? (
                                    <a
                                        href={summary.explorerUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-background border border-border rounded-lg text-sm font-medium hover:border-primary hover:text-primary transition-colors"
                                    >
                                        <ExternalLink size={16} />
                                        View transaction
                                    </a>
                                ) : (
                                    <div className="flex-1 px-4 py-2 bg-background border border-dashed border-border rounded-lg text-sm text-muted flex items-center justify-center">
                                        Explorer link unavailable for simulated deployment
                                    </div>
                                )}
                                {summary.contractExplorerUrl && (
                                    <a
                                        href={summary.contractExplorerUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-background border border-border rounded-lg text-sm font-medium hover:border-primary hover:text-primary transition-colors"
                                    >
                                        <ExternalLink size={16} />
                                        View contract account
                                    </a>
                                )}
                            </div>

                            <div className="flex flex-col sm:flex-row gap-3">
                                <button
                                    onClick={() => setStep("configure")}
                                    className="flex-1 px-4 py-2 bg-background border border-border rounded-lg text-sm font-medium hover:border-primary hover:text-primary transition-colors"
                                >
                                    Deploy another contract
                                </button>
                                <button
                                    onClick={onClose}
                                    className="flex-1 px-4 py-2 bg-primary text-background rounded-lg text-sm font-semibold hover:bg-primary-dark transition-colors"
                                >
                                    Close
                                </button>
                            </div>
                        </div>
                    )}

                    {step === "error" && (
                        <div className="space-y-4">
                            <div className="flex items-center gap-3 text-red-400">
                                <AlertCircle size={24} />
                                <div>
                                    <h3 className="text-lg font-semibold text-foreground">Deployment failed</h3>
                                    <p className="text-sm text-muted">Review the message above or try reconnecting your wallet.</p>
                                </div>
                            </div>
                            <div className="flex flex-col sm:flex-row gap-3">
                                <button
                                    onClick={() => {
                                        setError(null)
                                        setStep(walletAddress ? "configure" : "connect")
                                    }}
                                    className="flex-1 px-4 py-2 bg-background border border-border rounded-lg text-sm font-medium hover:border-primary hover:text-primary transition-colors"
                                >
                                    Back
                                </button>
                                <button
                                    onClick={handleDeploy}
                                    disabled={loading}
                                    className="flex-1 px-4 py-2 bg-primary text-background rounded-lg text-sm font-semibold hover:bg-primary-dark transition-colors disabled:opacity-50"
                                >
                                    Retry deployment
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            <ContractPreviewModal
                isOpen={showPreview}
                onClose={() => setShowPreview(false)}
                contractName={contractName}
                solidityCode={solidityCode}
                walletAddress={walletAddress}
                networkName={currentNetworkConfig.name}
                tokenSymbol={tokenSymbol}
            />
        </div>
    )
}
