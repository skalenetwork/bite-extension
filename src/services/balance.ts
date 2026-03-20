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
   */
  async getDecryptedBalance(
    keyId: string,
    token: TokenConfig,
    holderAddress: string
  ): Promise<DecryptedBalance> {
    console.log('[BalanceService] Getting decrypted balance for:', { 
      keyId, 
      token: token.symbol, 
      holderAddress 
    });
    
    // Initialize storage
    await viewerKeyStorage.init();

    // Get the key pair from storage
    const keyPair = await viewerKeyStorage.getKey(keyId);
    if (!keyPair) {
      throw new Error('Key not found. Please create a viewer key first.');
    }

    // Check if private key is stored (old keys won't have it)
    if (!keyPair.privateKeyHex) {
      throw new Error('This key was created with an older version and cannot decrypt balances. Please create a new viewer key.');
    }

    // Check for existing valid session
    let session = await viewerKeyStorage.getValidSession(keyId);
    
    if (!session) {
      console.log('[BalanceService] No cached session, authenticating with WebAuthn...');
      // Authenticate with WebAuthn (this just validates the user, doesn't derive key)
      const authenticated = await PasskeyService.authenticate(keyId);
      
      if (!authenticated) {
        throw new Error('Authentication failed. Please try again.');
      }
      
      // Create new session with stored private key
      session = {
        keyId,
        privateKeyHex: keyPair.privateKeyHex,
        authenticatedAt: Date.now(),
        expiresAt: Date.now() + SESSION_DURATION_MS,
      };
      
      await viewerKeyStorage.saveSession(session);
      console.log('[BalanceService] Session created with stored key');
    }
    
    const privateKey = session.privateKeyHex;

    // Fetch encrypted balance
    console.log('[BalanceService] Fetching encrypted balance from contract...');
    let encryptedBalance: string;
    try {
      encryptedBalance = await this.biteService.getEncryptedBalance(
        token.address,
        holderAddress
      );
      console.log('[BalanceService] Encrypted balance received:', encryptedBalance?.slice(0, 50) + '...');
    } catch (error: any) {
      console.error('[BalanceService] Failed to fetch encrypted balance:', error);
      throw new Error(`Failed to fetch balance: ${error.message || 'Unknown error'}`);
    }

    // Check if empty result
    if (!encryptedBalance || encryptedBalance === '0x' || encryptedBalance.length <= 2) {
      console.log('[BalanceService] No encrypted balance found (empty result)');
      return {
        token,
        amount: '0',
        decryptedAt: Date.now(),
      };
    }

    // Decrypt balance
    console.log('[BalanceService] Decrypting balance...');
    let decryptedAmount: bigint;
    try {
      decryptedAmount = await CryptoService.decryptBalance(
        privateKey,
        encryptedBalance
      );
      console.log('[BalanceService] Decrypted amount:', decryptedAmount.toString());
    } catch (error: any) {
      console.error('[BalanceService] Decryption failed:', error);
      throw new Error(`Decryption failed: ${error.message || 'Unknown error'}`);
    }

    // Format with decimals
    const formattedAmount = this.formatWithDecimals(decryptedAmount, token.decimals);
    console.log('[BalanceService] Formatted amount:', formattedAmount);

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
   */
  async getEncryptedBalance(
    tokenAddress: string,
    holderAddress: string
  ): Promise<string | null> {
    try {
      return await this.biteService.getEncryptedBalance(tokenAddress, holderAddress);
    } catch (error) {
      console.log('[BalanceService] Error fetching encrypted balance:', error);
      return null;
    }
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
}

// Singleton instance
export const balanceService = new BalanceService();
