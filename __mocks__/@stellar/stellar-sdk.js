module.exports = {
    Networks: {
        TESTNET: 'Test SDF Network ; September 2015',
        PUBLIC: 'Public Global Stellar Network ; September 2015',
    },
    Server: jest.fn().mockImplementation(() => ({
        loadAccount: jest.fn(),
    })),
    TransactionBuilder: jest.fn().mockImplementation(() => ({
        toXDR: jest.fn().mockReturnValue('mock_xdr'),
    })),
    Transaction: function () {
        return {
            toXDR: jest.fn().mockReturnValue('mock_xdr'),
        }
    },
    Operation: {
        invokeHostFunction: jest.fn(),
    },
    Address: {
        fromString: jest.fn().mockReturnValue({
            toScAddress: jest.fn(),
            toScVal: jest.fn(),
        }),
    },
    Contract: jest.fn().mockImplementation(() => ({
        call: jest.fn(),
    })),
    nativeToScVal: jest.fn(),
    xdr: {
        HostFunction: {
            hostFunctionTypeUploadContractWasm: jest.fn(),
            hostFunctionTypeCreateContract: jest.fn(),
        },
        CreateContractArgs: jest.fn(),
        ContractIdPreimage: {
            contractIdPreimageFromAddress: jest.fn(),
        },
        ContractIdPreimageFromAddress: jest.fn(),
        ContractIdPreimageType: {
            contractIdPreimageFromAddress: jest.fn(),
        },
        ContractExecutable: {
            contractExecutableWasm: jest.fn(),
        },
        Operation: jest.fn(),
    },
}
