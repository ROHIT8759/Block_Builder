import "@testing-library/jest-dom"
import { renderHook, act, waitFor } from "@testing-library/react"
import { useWallet } from "@/lib/useWallet"

const mockIsConnected = jest.fn()
const mockIsAllowed = jest.fn()
const mockRequestAccess = jest.fn()
const mockGetPublicKey = jest.fn()
const mockGetNetwork = jest.fn()
const mockSetAllowed = jest.fn()

jest.mock("@stellar/freighter-api", () => ({
    isConnected: () => mockIsConnected(),
    isAllowed: () => mockIsAllowed(),
    requestAccess: (details?: unknown) => mockRequestAccess(details),
    getPublicKey: () => mockGetPublicKey(),
    getNetwork: () => mockGetNetwork(),
    setAllowed: (allowed: boolean) => mockSetAllowed(allowed),
}))

jest.mock("@stellar/soroban-client", () => ({
    SorobanRpc: {
        Server: jest.fn().mockImplementation(() => ({
            isMockServer: true,
        })),
    },
}))

describe("useWallet", () => {
    beforeEach(() => {
        jest.clearAllMocks()
        mockIsConnected.mockResolvedValue(false)
        mockIsAllowed.mockResolvedValue(false)
        mockRequestAccess.mockReset()
        mockRequestAccess.mockResolvedValue(false)
        mockGetPublicKey.mockReset()
        mockGetNetwork.mockReset()
        mockSetAllowed.mockReset()
        mockSetAllowed.mockResolvedValue(true)
    })

    test("defaults to disconnected when Freighter is unavailable", async () => {
        mockIsConnected.mockResolvedValue(false)

        const { result } = renderHook(() => useWallet())

        await waitFor(() => {
            expect(result.current.isFreighterInstalled).toBe(false)
        })

        expect(result.current.walletAddress).toBeNull()
        expect(result.current.chainId).toBeNull()
        expect(result.current.isConnected).toBe(false)
    })

    test("populates wallet details when Freighter is connected", async () => {
        mockIsConnected.mockResolvedValue(true)
        mockIsAllowed.mockResolvedValue(true)
        mockGetPublicKey.mockResolvedValue("GB3DJR66EZTRCXLZX2HW4236KBM4JZ4YI6WPGYQZPEF5C7HOV3STAR99")
        mockGetNetwork.mockResolvedValue({
            network: "TESTNET",
        })

        const { result } = renderHook(() => useWallet())

        await waitFor(() => expect(result.current.walletAddress).toMatch(/GB3DJR/))

        expect(result.current.chainId).toBe(0)
        expect(result.current.isFreighterInstalled).toBe(true)
        expect(result.current.isConnected).toBe(true)
    })

    test("connect triggers Freighter request and updates state", async () => {
        mockRequestAccess.mockResolvedValue(true)
        mockGetPublicKey.mockResolvedValue("GB3DJR66EZTRCXLZX2HW4236KBM4JZ4YI6WPGYQZPEF5C7HOV3STAR99")

        const { result } = renderHook(() => useWallet())

        await act(async () => {
            await result.current.connect("testnet")
        })

        expect(mockRequestAccess).toHaveBeenCalledWith(expect.objectContaining({ network: "TESTNET" }))
        expect(result.current.walletAddress).toMatch(/GB3DJR/)
        expect(result.current.isConnected).toBe(true)
    })

    test("disconnect clears wallet state and revokes permissions", async () => {
        mockIsConnected.mockResolvedValue(true)
        mockIsAllowed.mockResolvedValue(true)
        mockGetPublicKey.mockResolvedValue("GB3DJR66EZTRCXLZX2HW4236KBM4JZ4YI6WPGYQZPEF5C7HOV3STAR99")
        mockGetNetwork.mockResolvedValue({ network: "TESTNET" })
        mockSetAllowed.mockResolvedValue(true)

        const { result } = renderHook(() => useWallet())

        await waitFor(() => expect(result.current.walletAddress).not.toBeNull())

        await act(async () => {
            await result.current.disconnect()
        })

        expect(mockSetAllowed).toHaveBeenCalledWith(false)
        expect(result.current.walletAddress).toBeNull()
        expect(result.current.chainId).toBeNull()
        expect(result.current.isConnected).toBe(false)
    })
})
