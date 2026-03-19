# BITE Confidential Wallet

A browser extension for managing viewer keys and viewing confidential token balances on SKALE's BITE protocol. Uses WebAuthn/Passkeys for secure biometric authentication (Face ID, Touch ID, PIN).

## Features

- **🔐 Passkey-Based Security**: Create viewer keys using WebAuthn - no seed phrases to manage
- **👁️ Encrypted Balance Viewing**: Decrypt confidential token balances with Face/Touch ID
- **🔗 MetaMask Integration**: Register viewer keys via MetaMask (signer required for BITE transactions)
- **⚡ 5-Minute Sessions**: Authenticate once, view balances for 5 minutes
- **🔒 Privacy First**: Private keys never leave your device, derived on-demand via WebAuthn

## Supported Tokens

- **Confidential USDC** (`cUSDC`): `0x36A9040DAC18D008a11Dc600d5EB1Cc89bb45200` on BITE Sandbox

## Network

**BITE V2 Sandbox 2**
- RPC: `https://base-sepolia-testnet.skalenodes.com/v1/bite-v2-sandbox`
- Chain ID: `103698795`
- Explorer: [Blockscout](https://base-sepolia-testnet-explorer.skalenodes.com:10032)

## How It Works

1. **Create Viewer Key**: Generate a secp256k1 keypair via WebAuthn authentication
2. **Register on Chain**: Submit your public key to the confidential token contract via MetaMask
3. **View Balances**: Authenticate with biometrics to decrypt your confidential balance
4. **MetaMask Handles Transfers**: Use your regular wallet for sending/receiving tokens

## Quick Start

```bash
# Install dependencies
npm install

# Run in development mode
npm run dev

# Build for production
npm run build
```

## Architecture

### Viewer Key Flow
```
1. User authenticates with Face/Touch ID
2. WebAuthn signature → Deterministic seed
3. keccak256(seed) → secp256k1 private key
4. Public key registered on confidential token contract
5. Contract encrypts balances to this public key
6. User authenticates again → derives same key → decrypts balance
```

### BITE Integration
- Transaction encryption via `@skalenetwork/bite`
- Committee BLS key retrieval
- Encrypted viewer key registration

## Tech Stack

- **Frontend**: React 19, WebCrypto API
- **Crypto**: ethers.js v6, elliptic (secp256k1)
- **Storage**: IndexedDB for key metadata and sessions
- **Auth**: WebAuthn / Passkeys
- **Build**: Extension.js with Chrome/Firefox support

## Security Notes

- **Private keys are never stored**: Derived on-demand from WebAuthn signatures
- **Session-based decryption**: Keys only exist in memory for 5-minute windows
- **No server communication**: All encryption/decryption happens client-side
- **Biometric required**: Every decryption requires user authentication

## License

MIT

---

Powered by [Extension.js](https://extension.js.org)
