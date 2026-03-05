export const FACTORY_ADDRESS = "0x688c0611a5691B7c1F09a694bf4ADfb456a58Cf7";
export const LEDGER_ADDRESS = "0x4815A8Ba613a3eB21A920739dE4cA7C439c7e1b1";

export const FACTORY_ABI = [
	{
		"inputs": [
			{
				"internalType": "address",
				"name": "_buyer",
				"type": "address"
			},
			{
				"internalType": "address",
				"name": "_seller",
				"type": "address"
			},
			{
				"internalType": "address",
				"name": "_lawyer",
				"type": "address"
			},
			{
				"internalType": "uint256",
				"name": "_settlementAmount",
				"type": "uint256"
			},
			{
				"internalType": "string",
				"name": "_documentHash",
				"type": "string"
			}
		],
		"name": "createCase",
		"outputs": [
			{
				"internalType": "address",
				"name": "",
				"type": "address"
			}
		],
		"stateMutability": "nonpayable",
		"type": "function"
	},
	{
		"anonymous": false,
		"inputs": [
			{
				"indexed": true,
				"internalType": "address",
				"name": "escrowAddress",
				"type": "address"
			},
			{
				"indexed": true,
				"internalType": "address",
				"name": "buyer",
				"type": "address"
			},
			{
				"indexed": true,
				"internalType": "address",
				"name": "seller",
				"type": "address"
			}
		],
		"name": "EscrowCreated",
		"type": "event"
	},
	{
		"inputs": [
			{
				"internalType": "uint256",
				"name": "",
				"type": "uint256"
			}
		],
		"name": "deployedEscrows",
		"outputs": [
			{
				"internalType": "address",
				"name": "",
				"type": "address"
			}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [],
		"name": "getDeployedEscrows",
		"outputs": [
			{
				"internalType": "address[]",
				"name": "",
				"type": "address[]"
			}
		],
		"stateMutability": "view",
		"type": "function"
	}
];

export const ESCROW_ABI =[
	{
		"inputs": [
			{
				"internalType": "address",
				"name": "_buyer",
				"type": "address"
			},
			{
				"internalType": "address",
				"name": "_seller",
				"type": "address"
			},
			{
				"internalType": "address",
				"name": "_lawyer",
				"type": "address"
			},
			{
				"internalType": "uint256",
				"name": "_settlementAmount",
				"type": "uint256"
			},
			{
				"internalType": "string",
				"name": "_documentHash",
				"type": "string"
			}
		],
		"stateMutability": "nonpayable",
		"type": "constructor"
	},
	{
		"anonymous": false,
		"inputs": [
			{
				"indexed": true,
				"internalType": "address",
				"name": "approver",
				"type": "address"
			},
			{
				"indexed": false,
				"internalType": "uint8",
				"name": "currentApprovals",
				"type": "uint8"
			}
		],
		"name": "Approved",
		"type": "event"
	},
	{
		"inputs": [],
		"name": "approveRelease",
		"outputs": [],
		"stateMutability": "nonpayable",
		"type": "function"
	},
	{
		"inputs": [],
		"name": "fund",
		"outputs": [],
		"stateMutability": "payable",
		"type": "function"
	},
	{
		"anonymous": false,
		"inputs": [
			{
				"indexed": true,
				"internalType": "address",
				"name": "depositor",
				"type": "address"
			},
			{
				"indexed": false,
				"internalType": "uint256",
				"name": "amount",
				"type": "uint256"
			}
		],
		"name": "Funded",
		"type": "event"
	},
	{
		"anonymous": false,
		"inputs": [
			{
				"indexed": true,
				"internalType": "address",
				"name": "seller",
				"type": "address"
			},
			{
				"indexed": false,
				"internalType": "uint256",
				"name": "amount",
				"type": "uint256"
			}
		],
		"name": "Released",
		"type": "event"
	},
	{
		"inputs": [],
		"name": "approvalCount",
		"outputs": [
			{
				"internalType": "uint8",
				"name": "",
				"type": "uint8"
			}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [],
		"name": "buyer",
		"outputs": [
			{
				"internalType": "address",
				"name": "",
				"type": "address"
			}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [],
		"name": "documentHash",
		"outputs": [
			{
				"internalType": "string",
				"name": "",
				"type": "string"
			}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "address",
				"name": "",
				"type": "address"
			}
		],
		"name": "hasApproved",
		"outputs": [
			{
				"internalType": "bool",
				"name": "",
				"type": "bool"
			}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [],
		"name": "isFunded",
		"outputs": [
			{
				"internalType": "bool",
				"name": "",
				"type": "bool"
			}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [],
		"name": "isReleased",
		"outputs": [
			{
				"internalType": "bool",
				"name": "",
				"type": "bool"
			}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [],
		"name": "lawyer",
		"outputs": [
			{
				"internalType": "address",
				"name": "",
				"type": "address"
			}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [],
		"name": "seller",
		"outputs": [
			{
				"internalType": "address",
				"name": "",
				"type": "address"
			}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [],
		"name": "settlementAmount",
		"outputs": [
			{
				"internalType": "uint256",
				"name": "",
				"type": "uint256"
			}
		],
		"stateMutability": "view",
		"type": "function"
	}
];

export const LEDGER_ABI =[
	{
		"inputs": [],
		"stateMutability": "nonpayable",
		"type": "constructor"
	},
	{
		"anonymous": false,
		"inputs": [
			{
				"indexed": true,
				"internalType": "bytes32",
				"name": "caseId",
				"type": "bytes32"
			}
		],
		"name": "CaseClosed",
		"type": "event"
	},
	{
		"anonymous": false,
		"inputs": [
			{
				"indexed": true,
				"internalType": "bytes32",
				"name": "caseId",
				"type": "bytes32"
			},
			{
				"indexed": true,
				"internalType": "address",
				"name": "clientId",
				"type": "address"
			},
			{
				"indexed": false,
				"internalType": "address",
				"name": "escrowContract",
				"type": "address"
			},
			{
				"indexed": false,
				"internalType": "string",
				"name": "purpose",
				"type": "string"
			}
		],
		"name": "CaseRegistered",
		"type": "event"
	},
	{
		"inputs": [
			{
				"internalType": "bytes32",
				"name": "_caseId",
				"type": "bytes32"
			}
		],
		"name": "closeCase",
		"outputs": [],
		"stateMutability": "nonpayable",
		"type": "function"
	},
	{
		"anonymous": false,
		"inputs": [
			{
				"indexed": true,
				"internalType": "bytes32",
				"name": "caseId",
				"type": "bytes32"
			},
			{
				"indexed": false,
				"internalType": "uint256",
				"name": "amount",
				"type": "uint256"
			}
		],
		"name": "FundsDisbursed",
		"type": "event"
	},
	{
		"anonymous": false,
		"inputs": [
			{
				"indexed": true,
				"internalType": "bytes32",
				"name": "caseId",
				"type": "bytes32"
			},
			{
				"indexed": false,
				"internalType": "uint256",
				"name": "newDepositTotal",
				"type": "uint256"
			}
		],
		"name": "FundsUpdated",
		"type": "event"
	},
	{
		"inputs": [
			{
				"internalType": "bytes32",
				"name": "_caseId",
				"type": "bytes32"
			},
			{
				"internalType": "uint256",
				"name": "_amount",
				"type": "uint256"
			}
		],
		"name": "recordDeposit",
		"outputs": [],
		"stateMutability": "nonpayable",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "bytes32",
				"name": "_caseId",
				"type": "bytes32"
			},
			{
				"internalType": "uint256",
				"name": "_amount",
				"type": "uint256"
			}
		],
		"name": "recordDisbursement",
		"outputs": [],
		"stateMutability": "nonpayable",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "bytes32",
				"name": "_caseId",
				"type": "bytes32"
			},
			{
				"internalType": "address",
				"name": "_clientId",
				"type": "address"
			},
			{
				"internalType": "address",
				"name": "_escrowContract",
				"type": "address"
			},
			{
				"internalType": "string",
				"name": "_purpose",
				"type": "string"
			}
		],
		"name": "registerCase",
		"outputs": [],
		"stateMutability": "nonpayable",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "uint256",
				"name": "",
				"type": "uint256"
			}
		],
		"name": "caseIds",
		"outputs": [
			{
				"internalType": "bytes32",
				"name": "",
				"type": "bytes32"
			}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "bytes32",
				"name": "",
				"type": "bytes32"
			}
		],
		"name": "caseLedger",
		"outputs": [
			{
				"internalType": "address",
				"name": "clientId",
				"type": "address"
			},
			{
				"internalType": "address",
				"name": "escrowContract",
				"type": "address"
			},
			{
				"internalType": "uint256",
				"name": "depositedAmount",
				"type": "uint256"
			},
			{
				"internalType": "uint256",
				"name": "disbursedAmount",
				"type": "uint256"
			},
			{
				"internalType": "bool",
				"name": "isClosed",
				"type": "bool"
			},
			{
				"internalType": "string",
				"name": "purpose",
				"type": "string"
			}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [],
		"name": "getTotalCases",
		"outputs": [
			{
				"internalType": "uint256",
				"name": "",
				"type": "uint256"
			}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [],
		"name": "lawFirmAdmin",
		"outputs": [
			{
				"internalType": "address",
				"name": "",
				"type": "address"
			}
		],
		"stateMutability": "view",
		"type": "function"
	}
];