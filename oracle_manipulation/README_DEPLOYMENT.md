# Contract Deployment DApp

A full-stack Ethereum dApp that enables users to deploy smart contracts using CREATE2 deterministic deployment after paying a fixed ETH fee.

## Features

- **CREATE2 Deployment**: Deterministic contract deployment with predictable addresses
- **Owner Pattern**: Contracts implement secure ownership with transferable rights
- **MetaMask Integration**: Seamless wallet connection and payment processing
- **Payment Verification**: Backend verifies ETH payments before deployment
- **Rate Limiting**: Anti-abuse protection with request limits
- **Modern UI**: Clean, responsive interface with loading states

## Architecture

### Smart Contracts

1. **DeployableContract.sol**: Main contract with owner pattern
   - Owner-only state modification functions
   - Transferable ownership
   - Events for all state changes

2. **Create2Factory.sol**: Factory for deterministic deployment
   - CREATE2 deployment functionality
   - Address prediction before deployment
   - Fixed salt for deterministic results

### Backend (Node.js + Express)

- **Payment Verification**: Validates ETH transactions to deployer wallet
- **Contract Deployment**: Uses CREATE2 factory for deterministic deployment
- **Rate Limiting**: Prevents abuse with 5 requests per 5 minutes
- **Security**: Helmet middleware for security headers

### Frontend (HTML + Vanilla JS)

- **MetaMask Integration**: Connect wallet and send transactions
- **Real-time Updates**: Loading states and success/error feedback
- **Responsive Design**: Works on desktop and mobile devices

## Setup Instructions

### 1. Environment Setup

```bash
# Copy environment template
cp .env.example .env

# Edit .env with your configuration
nano .env
```

Required environment variables:
```
DEPLOYER_PRIVATE_KEY=your_funded_private_key_here
FIXED_SALT=0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef
DEPLOYMENT_PORT=3000
DEPLOYMENT_FEE=0.01
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Start Local Blockchain

```bash
# Start Hardhat network in one terminal
npx hardhat node
```

### 4. Deploy Factory Contract

```bash
# Deploy the CREATE2 factory
npm run deploy-create2
```

### 5. Start the Server

```bash
# Compile contracts and start server
npm start
```

The server will be available at `http://localhost:3000`

## Usage

1. **Connect Wallet**: Click "Connect MetaMask" and approve connection
2. **Pay Fee**: Click "Deploy Contract" to send 0.01 ETH payment
3. **Receive Contract**: Get deployed contract address and transaction hash
4. **Verify**: Check that the contract matches the predicted CREATE2 address

## Contract Details

### DeployableContract

```solidity
contract DeployableContract {
    address public owner;
    string public message;
    uint256 public value;
    
    modifier onlyOwner {
        require(msg.sender == owner, "Not owner");
        _;
    }
    
    function updateMessage(string memory _newMessage) external onlyOwner;
    function updateValue(uint256 _newValue) external onlyOwner;
    function transferOwnership(address _newOwner) external onlyOwner;
}
```

### CREATE2 Process

1. Factory calculates deployment address using salt + init code
2. User pays deployment fee to deployer wallet
3. Backend verifies payment transaction
4. Factory deploys contract using CREATE2
5. Deterministic address returned to user

## Security Features

- **Payment Verification**: Only deploys after confirmed ETH payment
- **Rate Limiting**: 5 requests per 5 minutes per IP
- **Owner Protection**: All state changes require owner permissions
- **Deterministic Deployment**: CREATE2 ensures predictable addresses
- **Input Validation**: All user inputs validated on backend

## API Endpoints

### POST /verify-payment
Verify ETH payment transaction
```json
{
  "userAddress": "0x...",
  "txHash": "0x..."
}
```

### POST /deploy
Deploy contract after payment verification
```json
{
  "userAddress": "0x...",
  "txHash": "0x..."
}
```

### GET /deployment/:userAddress
Get deployment info for a user
```
GET /deployment/0x...
```

## Development

### Scripts

- `npm run compile`: Compile Solidity contracts
- `npm run deploy`: Deploy original CTF contracts
- `npm run deploy-create2`: Deploy CREATE2 factory
- `npm run server`: Start Express server
- `npm start`: Compile and start server

### Testing

```bash
# Run contract tests
npm test

# Test deployment locally
npm run deploy-create2
```

## Troubleshooting

### Common Issues

1. **MetaMask not connected**: Ensure MetaMask is installed and unlocked
2. **Insufficient balance**: User needs 0.01 ETH + gas for deployment
3. **Transaction failed**: Check network connection and gas settings
4. **Server errors**: Verify environment variables and Hardhat node is running

### Debug Mode

Enable debug logging by setting:
```bash
export DEBUG=*
npm start
```

## License

MIT License - see LICENSE file for details
