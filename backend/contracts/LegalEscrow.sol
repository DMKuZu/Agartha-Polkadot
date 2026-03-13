// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract LegalEscrow{
    address public buyer;
    address public seller;
    address public lawyer;
    
    uint256 public settlementAmount;
    string public documentHash; // Ricardian contract integration (Hash of the PDF)
    
    bool public isFunded;
    bool public isReleased;
    
    uint8 public approvalCount;
    mapping(address => bool) public hasApproved;

    // Cancellation state (2-of-3 refunds buyer)
    bool public isCancelled;
    uint8 public cancelApprovalCount;
    mapping(address => bool) public hasCancelApproved;

    // Events for the Next.js frontend to listen to
    event Funded(address indexed depositor, uint256 amount);
    event Approved(address indexed approver, uint8 currentApprovals);
    event Released(address indexed seller, uint256 amount);
    event CancelApproved(address indexed approver, uint8 currentCancelApprovals);
    event Refunded(address indexed buyer, uint256 amount);

    modifier onlyParties() {
        require(
            msg.sender == buyer || msg.sender == seller || msg.sender == lawyer,
            "Only parties involved can call this"
        );
        _;
    }

    constructor(
        address _buyer,
        address _seller,
        address _lawyer,
        uint256 _settlementAmount,
        string memory _documentHash
    ) {
        buyer = _buyer;
        seller = _seller;
        lawyer = _lawyer;
        settlementAmount = _settlementAmount;
        documentHash = _documentHash; // e.g., SHA-256 hash of the signed DOAS
    }

    // Buyer deposits the settlement funds
    function fund() external payable {
        require(msg.sender == buyer, "Only buyer can fund");
        require(!isFunded, "Already funded");
        require(msg.value == settlementAmount, "Must fund exact settlement amount");
        
        isFunded = true;
        emit Funded(msg.sender, msg.value);
    }

    // Parties approve the release (2-of-3 Multi-Sig)
    function approveRelease() external onlyParties {
        require(isFunded, "Contract is not funded yet");
        require(!isReleased, "Funds already released");
        require(!hasApproved[msg.sender], "You have already approved");

        hasApproved[msg.sender] = true;
        approvalCount++;
        
        emit Approved(msg.sender, approvalCount);

        // If 2 out of 3 parties approve, release the funds autonomously
        if (approvalCount >= 2) {
            releaseFunds();
        }
    }

    // Internal function to handle the transfer
    function releaseFunds() internal {
        isReleased = true;
        uint256 amountToTransfer = address(this).balance;

        (bool success, ) = seller.call{value: amountToTransfer}("");
        require(success, "Transfer to seller failed");

        emit Released(seller, amountToTransfer);
    }

    // Parties approve cancellation (2-of-3 refunds buyer)
    function approveCancellation() external onlyParties {
        require(isFunded, "Not funded yet");
        require(!isReleased, "Funds already released");
        require(!isCancelled, "Already cancelled");
        require(!hasCancelApproved[msg.sender], "Already approved cancellation");

        hasCancelApproved[msg.sender] = true;
        cancelApprovalCount++;
        emit CancelApproved(msg.sender, cancelApprovalCount);

        if (cancelApprovalCount >= 2) {
            isCancelled = true;
            uint256 amount = address(this).balance;
            (bool success, ) = buyer.call{value: amount}("");
            require(success, "Refund failed");
            emit Refunded(buyer, amount);
        }
    }
}