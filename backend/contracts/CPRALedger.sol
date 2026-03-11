// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface ILegalEscrow {
    function lawyer() external view returns (address);
}

contract CPRALedger {
    address public lawFirmAdmin;

    // This struct represents the required inventory under CPRA Canon III, Sec 49
    struct CaseRecord {
        address clientId;
        address escrowContract; // The unique address of the isolated funds (Sec 50)
        uint256 depositedAmount;
        uint256 disbursedAmount;
        bool isClosed;
        string purpose;
    }

    // Maps a unique Case ID (keccak256 of escrow address) to the CaseRecord
    mapping(bytes32 => CaseRecord) public caseLedger;
    bytes32[] public caseIds;

    // Maps each caseId to the arbiter who registered it
    mapping(bytes32 => address) public caseRegistrar;

    // Immutable audit trail events
    event CaseRegistered(bytes32 indexed caseId, address indexed clientId, address escrowContract, string purpose);
    event FundsUpdated(bytes32 indexed caseId, uint256 newDepositTotal);
    event FundsDisbursed(bytes32 indexed caseId, uint256 amount);
    event CaseClosed(bytes32 indexed caseId);

    // Fallback: law firm admin can always act on any case
    modifier onlyCaseRegistrar(bytes32 _caseId) {
        require(
            msg.sender == caseRegistrar[_caseId] || msg.sender == lawFirmAdmin,
            "Not authorized: must be case registrar or admin"
        );
        _;
    }

    constructor() {
        lawFirmAdmin = msg.sender; // The wallet that deploys this is the firm administrator
    }

    // Register a new settlement case — caller must be the lawyer named in the escrow contract
    function registerCase(
        bytes32 _caseId,
        address _clientId,
        address _escrowContract,
        string memory _purpose
    ) external {
        require(
            keccak256(abi.encodePacked(_escrowContract)) == _caseId,
            "caseId must equal keccak256(escrowContract)"
        );
        require(
            ILegalEscrow(_escrowContract).lawyer() == msg.sender,
            "Only the escrow's lawyer can register this case"
        );
        require(caseLedger[_caseId].clientId == address(0), "Case ID already exists");

        caseLedger[_caseId] = CaseRecord({
            clientId: _clientId,
            escrowContract: _escrowContract,
            depositedAmount: 0,
            disbursedAmount: 0,
            isClosed: false,
            purpose: _purpose
        });
        caseRegistrar[_caseId] = msg.sender;
        caseIds.push(_caseId);

        emit CaseRegistered(_caseId, _clientId, _escrowContract, _purpose);
    }

    // Update the ledger when the escrow contract receives funds
    function recordDeposit(bytes32 _caseId, uint256 _amount) external onlyCaseRegistrar(_caseId) {
        require(!caseLedger[_caseId].isClosed, "Case is closed");
        caseLedger[_caseId].depositedAmount += _amount;
        emit FundsUpdated(_caseId, caseLedger[_caseId].depositedAmount);
    }

    // Update the ledger when funds are released to the freelancer
    function recordDisbursement(bytes32 _caseId, uint256 _amount) external onlyCaseRegistrar(_caseId) {
        require(!caseLedger[_caseId].isClosed, "Case is closed");
        caseLedger[_caseId].disbursedAmount += _amount;
        emit FundsDisbursed(_caseId, _amount);
    }

    // Close the books on this case
    function closeCase(bytes32 _caseId) external onlyCaseRegistrar(_caseId) {
        caseLedger[_caseId].isClosed = true;
        emit CaseClosed(_caseId);
    }

    function getTotalCases() external view returns (uint256) {
        return caseIds.length;
    }
}
