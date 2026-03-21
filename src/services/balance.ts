import { CryptoService } from './crypto';
import { BiteService } from './bite';
import { viewerKeyService } from './viewerKey';
import type { DecryptedBalance, TokenConfig, ViewerKeyUnlockOptions } from '../types';

export class BalanceService {
  private biteService: BiteService;

  constructor() {
    this.biteService = new BiteService();
  }

  async getDecryptedBalance(
    keyId: string,
    token: TokenConfig,
    holderAddress: string,
    unlockOptions: ViewerKeyUnlockOptions = {},
  ): Promise<DecryptedBalance> {
    const privateKey = await viewerKeyService.unlockViewerKey(keyId, unlockOptions);
    const encryptedBalance = await this.biteService.getEncryptedBalance(token.address, holderAddress);

    if (!encryptedBalance || encryptedBalance === '0x' || encryptedBalance.length <= 2) {
      return {
        token,
        amount: '0',
        decryptedAt: Date.now(),
      };
    }

    const decryptedAmount = await CryptoService.decryptBalance(privateKey, encryptedBalance);

    return {
      token,
      amount: this.formatWithDecimals(decryptedAmount, token.decimals),
      decryptedAt: Date.now(),
    };
  }

  hasValidSession(keyId: string): boolean {
    return viewerKeyService.hasUnlockedKey(keyId);
  }

  clearSession(keyId: string): void {
    viewerKeyService.lockViewerKey(keyId);
  }

  async getEncryptedBalance(tokenAddress: string, holderAddress: string): Promise<string | null> {
    try {
      return await this.biteService.getEncryptedBalance(tokenAddress, holderAddress);
    } catch {
      return null;
    }
  }

  private formatWithDecimals(amount: bigint, decimals: number): string {
    const divisor = 10n ** BigInt(decimals);
    const integerPart = amount / divisor;
    const fractionalPart = amount % divisor;
    const fractional = fractionalPart.toString().padStart(decimals, '0').replace(/0+$/, '');

    return fractional ? `${integerPart}.${fractional}` : integerPart.toString();
  }
}

export const balanceService = new BalanceService();
