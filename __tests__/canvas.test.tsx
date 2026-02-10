import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { Canvas } from '@/components/canvas'
import { useBuilderStore } from '@/lib/store'

const mockGetState = jest.fn()

jest.mock('@/lib/store', () => ({
    useBuilderStore: Object.assign(
        jest.fn(),
        { getState: () => mockGetState() }
    ),
}))

describe('Canvas Component', () => {
    const mockStore = {
        blocks: [],
        addBlock: jest.fn(),
        removeBlock: jest.fn(),
        updateBlock: jest.fn(),
        setSelectedBlock: jest.fn(),
        selectBlock: jest.fn(),
        selectedBlock: null,
    }

    beforeEach(() => {
        jest.clearAllMocks()
        mockGetState.mockReturnValue(mockStore)
            ; (useBuilderStore as jest.Mock).mockImplementation((selector) =>
                selector ? selector(mockStore) : mockStore
            )
    })

    test('renders canvas container', () => {
        render(<Canvas />)
        expect(screen.getByText(/Start Building/i)).toBeInTheDocument()
    })

    test('displays empty state when no blocks', () => {
        render(<Canvas />)
        expect(screen.getByText(/Drag components from the sidebar/i)).toBeInTheDocument()
    })

    test('renders blocks when present', () => {
        const storeWithBlocks = {
            ...mockStore,
            blocks: [
                { id: '1', type: 'mint', label: 'Mint', enabled: true },
                { id: '2', type: 'burn', label: 'Burn', enabled: true },
            ],
        }
        mockGetState.mockReturnValue(storeWithBlocks)
            ; (useBuilderStore as jest.Mock).mockImplementation((selector) =>
                selector ? selector(storeWithBlocks) : storeWithBlocks
            )

        render(<Canvas />)
        expect(screen.getByText('Mint')).toBeInTheDocument()
        expect(screen.getByText('Burn')).toBeInTheDocument()
    })

    test('allows removing blocks', () => {
        const storeWithBlocks = {
            ...mockStore,
            blocks: [{ id: '1', type: 'mint', label: 'Mint', enabled: true }],
            removeBlock: jest.fn(),
            selectBlock: jest.fn(),
        }
        mockGetState.mockReturnValue(storeWithBlocks)
            ; (useBuilderStore as jest.Mock).mockImplementation((selector) =>
                selector ? selector(storeWithBlocks) : storeWithBlocks
            )

        render(<Canvas />)
        const removeButtons = screen.getAllByRole('button')
        const removeButton = removeButtons.find(btn =>
            btn.getAttribute('title') === 'Delete block'
        )

        if (removeButton) {
            fireEvent.click(removeButton)
            expect(storeWithBlocks.removeBlock).toHaveBeenCalledWith('1')
            expect(storeWithBlocks.selectBlock).toHaveBeenCalledWith(null)
        }
    })
})
