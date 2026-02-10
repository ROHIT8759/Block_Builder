module.exports = {
    SorobanRpc: {
        Server: jest.fn().mockImplementation(() => ({
            getAccount: jest.fn().mockResolvedValue({
                sequenceNumber: jest.fn().mockReturnValue('1'),
                accountId: jest.fn().mockReturnValue('GABC123'),
            }),
            simulateTransaction: jest.fn().mockResolvedValue({
                transactionData: 'mock_data',
            }),
            sendTransaction: jest.fn().mockResolvedValue({
                status: 'PENDING',
                hash: 'mock_hash',
            }),
            getTransaction: jest.fn().mockResolvedValue({
                status: 'SUCCESS',
            }),
        })),
        assembleTransaction: jest.fn((tx) => tx),
    },
}
