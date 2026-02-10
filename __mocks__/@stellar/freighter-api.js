module.exports = {
    isConnected: jest.fn().mockResolvedValue(false),
    isAllowed: jest.fn().mockResolvedValue(false),
    requestAccess: jest.fn().mockResolvedValue(true),
    getPublicKey: jest.fn().mockResolvedValue('GABC123'),
    signTransaction: jest.fn().mockResolvedValue('signed_xdr'),
    getNetwork: jest.fn().mockResolvedValue('TESTNET'),
    setAllowed: jest.fn(),
}
