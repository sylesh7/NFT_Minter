# NFT Minting DApp

This project is a Next.js-based decentralized application (DApp) for minting NFTs on the Sepolia testnet. It uses Pinata for IPFS storage and a custom ERC721 smart contract.

## Setup

1. Clone the repository and navigate to the project root.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create a `.env.local` file in the root directory and add your Pinata JWT and deployed contract address:
   ```env
   PINATA_JWT=your_pinata_jwt_token_here
   NEXT_PUBLIC_CONTRACT_ADDRESS=your_deployed_contract_address_here
   ```
4. Deploy the smart contract in `contracts/NFTContract.sol` to Sepolia and update the contract address in `.env.local`.
5. Run the development server:
   ```bash
   npm run dev
   ```

## Features
- Upload NFT images to IPFS via Pinata
- Mint NFTs using a custom ERC721 contract
- Store and retrieve NFT metadata from IPFS

## Scripts
- `npm run dev` - Start the development server
- `npm run build` - Build for production
- `npm run start` - Start the production server
- `npm run lint` - Lint the codebase

## Dependencies
See `package.json` for a full list of dependencies. 