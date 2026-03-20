import { BiteService, CONFIDENTIAL_TOKENS, CONFIDENTIAL_TOKEN_ABI } from './bite';
import { ethers } from 'ethers';
import type { RegistrationPayload } from '../types';

/**
 * Service for registering viewer keys on confidential token contracts
 * Prepares encrypted transactions to be sent via MetaMask or other signer
 */
export class RegistrationService {
  private biteService: BiteService;

  constructor() {
    this.biteService = new BiteService();
  }

  /**
   * Prepare a registration transaction for a viewer key
   * Returns the encrypted payload that needs to be sent via a signer (MetaMask, etc.)
   * 
   * @param tokenAddress - The confidential token contract address
   * @param publicKeyHex - The uncompressed public key (0x04 + 64 bytes X + 64 bytes Y)
   * @param depositAmount - Amount of ETH/sFUEL to deposit for callback funding (default: 0.001)
   * @returns The encrypted transaction payload ready for signing
   */
  async prepareViewerKeyRegistration(
    tokenAddress: string,
    publicKeyHex: string,
    depositAmount: string = '0.001'
  ): Promise<{
    payload: RegistrationPayload;
    tokenAddress: string;
    publicKeyHex: string;
    depositAmount: string;
  }> {
    // Validate public key format
    if (!this.isValidPublicKey(publicKeyHex)) {
      throw new Error('Invalid public key format. Must be uncompressed 65-byte hex with 0x04 prefix');
    }

    // Create the encrypted registration payload
    const payload = await this.biteService.createViewerKeyRegistrationPayload(
      tokenAddress,
      publicKeyHex
    );

    return {
      payload,
      tokenAddress,
      publicKeyHex,
      depositAmount,
    };
  }

  /**
   * Build a complete transaction object for sending via Ethereum provider
   * This can be passed to window.ethereum.request({ method: 'eth_sendTransaction', params: [tx] })
   * Note: MetaMask will add the 'from' field automatically
   */
  buildTransactionRequest(
    registrationData: Awaited<ReturnType<typeof this.prepareViewerKeyRegistration>>,
    fromAddress: string
  ): {
    from: string;
    to: string;
    data: string;
    value: string;
    gas: string;
  } {
    // Convert deposit to wei
    const depositWei = ethers.parseEther(registrationData.depositAmount);
    
    console.log('[RegistrationService] Building transaction:', {
      from: fromAddress,
      to: registrationData.payload.to,
      dataLength: registrationData.payload.data.length,
      dataPreview: registrationData.payload.data.slice(0, 50) + '...',
      value: depositWei.toString(),
    });

    return {
      from: fromAddress,
      to: registrationData.payload.to,
      data: registrationData.payload.data,
      value: '0x' + depositWei.toString(16),
      gas: '0x493e0', // 300000
    };
  }

  /**
   * Get pre-configured token options for easy selection
   */
  getPreconfiguredTokens(): typeof CONFIDENTIAL_TOKENS {
    return CONFIDENTIAL_TOKENS;
  }

  /**
   * Check if a public key is already registered for a user on a token
   * This is a view function that doesn't require signing
   */
  async checkExistingRegistration(
    tokenAddress: string,
    userAddress: string,
    publicKeyHex: string
  ): Promise<boolean> {
    try {
      // Get the encrypted balance - if we can get it, the key exists
      // Note: This doesn't tell us if THIS specific key is registered,
      // just that the user has some viewer key set up
      const encryptedBalance = await this.biteService.getEncryptedBalance(
        tokenAddress,
        userAddress
      );
      
      // If we got a non-empty result, there's a registration
      return encryptedBalance && encryptedBalance.length > 2; // more than "0x"
    } catch (error) {
      // If the call reverts or fails, no registration exists
      return false;
    }
  }

  /**
   * Validate uncompressed public key format
   */
  private isValidPublicKey(publicKeyHex: string): boolean {
    // Remove 0x prefix if present
    const clean = publicKeyHex.startsWith('0x') 
      ? publicKeyHex.slice(2) 
      : publicKeyHex;

    // Must be 130 hex characters (65 bytes): 04 prefix + 32 bytes X + 32 bytes Y
    if (clean.length !== 130) return false;

    // Must start with 04 (uncompressed prefix)
    if (!clean.startsWith('04')) return false;

    // All hex characters
    return /^[0-9a-fA-F]+$/.test(clean);
  }

  /**
   * Get the explorer URL for a transaction
   */
  getExplorerUrl(txHash: string): string {
    const { explorerUrl } = require('./bite').BITE_SANDBOX_CONFIG;
    return `${explorerUrl}/tx/${txHash}`;
  }
}

// Singleton instance
export const registrationService = new RegistrationService();
