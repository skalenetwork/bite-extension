import { BITE } from '@skalenetwork/bite';
import { ethers } from 'ethers';
import type { RegistrationPayload } from '../types';

// BITE Sandbox Configuration
export const BITE_SANDBOX_CONFIG = {
  rpcUrl: 'https://base-sepolia-testnet.skalenodes.com/v1/bite-v2-sandbox',
  chainId: 103698795,
  explorerUrl: 'https://base-sepolia-testnet-explorer.skalenodes.com:10032',
};

// Pre-configured confidential tokens
export const CONFIDENTIAL_TOKENS = {
  USDC: {
    address: '0x36A9040DAC18D008a11Dc600d5EB1Cc89bb45200',
    symbol: 'eUSDC',
    name: 'Encrypted USDC',
    decimals: 6,
  },
};

// Confidential Token ABI (essential functions only)
export const CONFIDENTIAL_TOKEN_ABI = [
  'function encryptedBalanceOf(address holder) external view returns (bytes memory)',
  'function registerPublicKey(bytes calldata publicKey) external',
  'function setViewerPublicKey(bytes calldata publicKey) external payable',
  'function setViewerAddress(address viewer) external payable',
  'function deposit(address receiver) external payable',
  'function transfer(address to, uint256 amount) external returns (bool)',
  'function name() external view returns (string)',
  'function symbol() external view returns (string)',
  'function decimals() external view returns (uint8)',
];

export class BiteService {
  private bite: BITE;
  private provider: ethers.JsonRpcProvider;

  constructor() {
    this.bite = new BITE(BITE_SANDBOX_CONFIG.rpcUrl);
    this.provider = new ethers.JsonRpcProvider(BITE_SANDBOX_CONFIG.rpcUrl);
  }

  /**
   * Fetch current committee BLS public keys from BITE
   */
  async getCommitteeInfo(): Promise<{
    epochId: number;
    commonBLSPublicKey: string;
  }[]> {
    return await this.bite.getCommitteesInfo();
  }

  /**
   * Create encrypted payload for registering a viewer public key
   * This prepares the transaction to be sent via MetaMask or other signer
   */
  async createViewerKeyRegistrationPayload(
    tokenAddress: string,
    publicKeyHex: string
  ): Promise<RegistrationPayload> {
    const iface = new ethers.Interface(CONFIDENTIAL_TOKEN_ABI);
    const data = iface.encodeFunctionData('setViewerPublicKey', [publicKeyHex]);

    const tx = {
      to: tokenAddress,
      data: data,
    };

    const encryptedTx = await this.bite.encryptTransaction(tx);

    return {
      to: encryptedTx.to,
      data: encryptedTx.data,
    };
  }

  /**
   * Get encrypted balance for a holder
   */
  async getEncryptedBalance(
    tokenAddress: string,
    holderAddress: string
  ): Promise<string> {
    const contract = new ethers.Contract(
      tokenAddress,
      CONFIDENTIAL_TOKEN_ABI,
      this.provider
    );

    const encryptedBalance = await contract.encryptedBalanceOf(holderAddress);
    return encryptedBalance;
  }

  /**
   * Get token metadata
   */
  async getTokenMetadata(tokenAddress: string): Promise<{
    name: string;
    symbol: string;
    decimals: number;
  }> {
    const contract = new ethers.Contract(
      tokenAddress,
      CONFIDENTIAL_TOKEN_ABI,
      this.provider
    );

    const [name, symbol, decimals] = await Promise.all([
      contract.name(),
      contract.symbol(),
      contract.decimals(),
    ]);

    return { name, symbol, decimals };
  }
}
