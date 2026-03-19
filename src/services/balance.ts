import { CryptoService } from './crypto';
import { BiteService } from './bite';
import { viewerKeyStorage } from '../storage/viewerKeys';
import { PasskeyService } from './passkey';
import type { 
  ViewerKeyPair, 
  ViewerKeySession, 
  TokenConfig, 
  DecryptedBalance 
} from '../types';

const SESSION_DURATION_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Service for managing confidential token balances
 * Handles authentication, decryption, and caching
 */
export class BalanceService {
  private biteService: BiteService;

  constructor() {
    this.biteService = new BiteService();
  }

  /**
   * Get and decrypt balance for a specific token using a viewer key
   * Flow:
   * 1. Check if we have a valid session (5-minute window)
   * 2. If not, prompt for WebAuthn authentication
   * 3. Fetch encrypted balance from chain
   * 4. Decrypt using authenticated private key
   * 5. Cache decrypted result for 5 minutes
   */
  async getDecryptedBalance(
    keyId: string,
    token: TokenConfig,
    holderAddress: string
  ): Promise<DecryptedBalance> {
    // Initialize storage
    await viewerKeyStorage.init();

    // Check for existing valid session
    let session = await viewerKeyStorage.getValidSession(keyId);
    let privateKey: string;

    if (session) {
      // Use cached session
      privateKey = session.privateKeyHex;
    } else {
      // Authenticate with WebAuthn to derive key
      privateKey = await PasskeyService.authenticateAndDeriveKey(keyId);
      
      // Create new session
      session = {
        keyId,
        privateKeyHex: privateKey,
        authenticatedAt: Date.now(),
        expiresAt: Date.now() + SESSION_DURATION_MS,
      };
      
      await viewerKeyStorage.saveSession(session);
    }

    // Fetch encrypted balance
    const encryptedBalance = await this.biteService.getEncryptedBalance(
      token.address,
      holderAddress
    );

    if (!encryptedBalance || encryptedBalance.length <= 2) {
      return {
        token,
        amount: '0',
        decryptedAt: Date.now(),
      };
    }

    // Decrypt balance
    const decryptedAmount = await CryptoService.decryptBalance(
      privateKey,
      encryptedBalance
    );

    // Format with decimals
    const formattedAmount = this.formatWithDecimals(decryptedAmount, token.decimals);

    return {
      token,
      amount: formattedAmount,
      decryptedAt: Date.now(),
    };
  }

  /**
   * Quick check if a key has a valid session (no UI prompt)
   */
  async hasValidSession(keyId: string): Promise<boolean> {
    await viewerKeyStorage.init();
    const session = await viewerKeyStorage.getValidSession(keyId);
    return session !== null;
  }

  /**
   * Manually clear a session (logout behavior)
   */
  async clearSession(keyId: string): Promise<void> {
    await viewerKeyStorage.init();
    await viewerKeyStorage.clearSession(keyId);
  }

  /**
   * Get encrypted balance without decrypting
   * Useful for checking if a registration exists
   */
  async getEncryptedBalance(
    tokenAddress: string,
    holderAddress: string
  ): Promise<string | null> {
    try {
      return await this.biteService.getEncryptedBalance(tokenAddress, holderAddress);
    } catch (error) {
      return null;
    }
  }

  /**
   * Check if a holder has a registered viewer key for a token
   */
  async hasRegisteredViewerKey(
    tokenAddress: string,
    holderAddress: string
  ): Promise<boolean> {
    const encrypted = await this.getEncryptedBalance(tokenAddress, holderAddress);
    return encrypted !== null && encrypted.length > 2;
  }

  /**
   * Format BigInt amount with token decimals
   */
  private formatWithDecimals(amount: bigint, decimals: number): string {
    const divisor = BigInt(10 ** decimals);
    const integerPart = amount / divisor;
    const fractionalPart = amount % divisor;
    
    // Pad fractional part with leading zeros
    const fractionalStr = fractionalPart.toString().padStart(decimals, '0');
    
    // Trim trailing zeros
    const trimmedFractional = fractionalStr.replace(/0+$/, '');
    
    if (trimmedFractional.length === 0) {
      return integerPart.toString();
    }
    
    return `${integerPart}.${trimmedFractional}`;
  }

  /**
   * Get token metadata
   */
  async getTokenMetadata(tokenAddress: string): Promise<TokenConfig | null> {
    try {
      const metadata = await this.biteService.getTokenMetadata(tokenAddress);
      return {
        address: tokenAddress,
        ...metadata,
      };
    } catch (error) {
      return null;
    }
  }
}

// Singleton instance
export const balanceService = new BalanceService();
