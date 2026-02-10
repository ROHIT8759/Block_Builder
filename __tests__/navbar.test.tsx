import { render, screen } from "@testing-library/react"
import { Navbar } from "@/components/navbar"
import { useBuilderStore } from "@/lib/store"
import { useSupabaseStore } from "@/lib/supabase-store"
import { useWallet } from "@/lib/useWallet"

jest.mock("@/lib/store", () => ({
    useBuilderStore: jest.fn(),
}))

jest.mock("@/lib/supabase-store", () => ({
    useSupabaseStore: jest.fn(),
}))

jest.mock("@/lib/useWallet", () => ({
    useWallet: jest.fn(),
}))

describe('Navbar Component', () => {
    const mockStore = {
        currentProject: null,
        blocks: [],
        saveProject: jest.fn(),
        setWalletAddress: jest.fn(),
        setWalletChainId: jest.fn(),
    }

    const mockSupabaseStore = {
        initializeUser: jest.fn(),
    }

    const baseWallet = {
        walletAddress: null,
        connect: jest.fn(),
        disconnect: jest.fn(),
        isConnecting: false,
        chainId: null,
        isFreighterInstalled: true,
    }

    beforeEach(() => {
        jest.clearAllMocks()
        ;(useBuilderStore as jest.Mock).mockImplementation((selector: any) => (selector ? selector(mockStore) : mockStore))
        ;(useSupabaseStore as jest.Mock).mockImplementation((selector: any) => (selector ? selector(mockSupabaseStore) : mockSupabaseStore))
        ;(useWallet as jest.Mock).mockReturnValue(baseWallet)
    })

    test("renders navbar with title", () => {
        render(<Navbar />)
        expect(screen.getByText("Block Builder")).toBeInTheDocument()
    })

    test("shows connect wallet button when wallet not connected", () => {
        render(<Navbar />)
        expect(screen.getByText(/Connect Wallet/i)).toBeInTheDocument()
    })

    test("shows wallet address when connected", () => {
        ;(useWallet as jest.Mock).mockReturnValue({
            ...baseWallet,
            walletAddress: "GBRHJOG2LSIGDKS4TYW47M4PTWM7AJSWYA2MCYO6J5M2FREIHEFREI99",
        })

        render(<Navbar />)
        expect(screen.getByText(/GBRHJO/)).toBeInTheDocument()
    })

    test("renders primary navigation actions", () => {
        render(<Navbar />)
        expect(screen.getByText("Projects")).toBeInTheDocument()
        expect(screen.getByText("Preview")).toBeInTheDocument()
        expect(screen.getByText("Export")).toBeInTheDocument()
        expect(screen.getByText(/Deploy to Stellar/)).toBeInTheDocument()
    })
})
