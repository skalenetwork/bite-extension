import { HDNodeWallet, Wallet } from 'ethers';
import type {
  CreateWalletOptions,
  CreatedWalletResult,
  ImportWalletOptions,
  StoredWalletAccount,
  WalletMode,
  WrappedSecret,
  WalletNetworkInfo,
} from '../types';
import { PasskeyService } from './passkey';
import { viewerKeyStorage } from '../storage/viewerKeys';
import { runtimeSession } from './runtimeSession';
import { SecureVaultService } from './secureVault';
import { injectedWalletService } from './injectedWallet';

function toWrappedSecret(account: StoredWalletAccount): WrappedSecret {
  return {
    ciphertextHex: account.wrappedSecret || '',
    saltHex: account.wrapSalt || '',
    ivHex: account.wrapIv || '',
  };
}

function normalizeImportedSecret(secret: string): { privateKey: string; mnemonic?: string } {
  const trimmed = secret.trim();

  if (trimmed.split(/\s+/).length >= 12) {
    const wallet = HDNodeWallet.fromPhrase(trimmed);
    return { privateKey: wallet.privateKey, mnemonic: trimmed };
  }

  const wallet = new Wallet(trimmed);
  return { privateKey: wallet.privateKey };
}

export class WalletService {
  async createLocalWallet(options: CreateWalletOptions = {}): Promise<CreatedWalletResult> {
    const credential = await PasskeyService.createCredential(options.label || 'MyBITE Wallet');
    const wrapMethod = credential.prfSupported ? 'webauthn-prf' : 'passphrase';
    if (wrapMethod === 'passphrase' && !options.passphrase) {
      throw new Error('Set a wallet passphrase because this authenticator does not support secure PRF wrapping.');
    }

    const wallet = Wallet.createRandom();
    const wrapped = credential.prfSupported
      ? await this.wrapWithPrf(credential.credentialId, wallet.privateKey)
      : await SecureVaultService.wrapWithPassphrase(wallet.privateKey, options.passphrase!);

    const account: StoredWalletAccount = {
      id: crypto.randomUUID(),
      mode: 'self-custody',
      address: wallet.address,
      wrappedSecret: wrapped.ciphertextHex,
      wrapMethod,
      wrapSalt: wrapped.saltHex,
      wrapIv: wrapped.ivHex,
      credentialId: credential.credentialId,
      createdAt: Date.now(),
    };

    await viewerKeyStorage.saveWalletAccount(account);
    runtimeSession.set(`wallet:${account.id}`, wallet.privateKey);
    return {
      account,
      recoveryPhrase: wallet.mnemonic?.phrase || null,
      privateKey: wallet.privateKey,
    };
  }

  async createLocalWalletDirect(label?: string): Promise<CreatedWalletResult> {
    // Step 1: Create passkey - MUST be called immediately from click handler
    const credential = await PasskeyService.createCredentialDirect(label || 'MyBITE Wallet');
    
    // Step 2: Now wrap with PRF - this will prompt for authentication again
    const wallet = Wallet.createRandom();
    const wrapped = await this.wrapWithPrfDirect(credential.credentialId, wallet.privateKey);

    const account: StoredWalletAccount = {
      id: crypto.randomUUID(),
      mode: 'self-custody',
      address: wallet.address,
      wrappedSecret: wrapped.ciphertextHex,
      wrapMethod: 'webauthn-prf',
      wrapSalt: wrapped.saltHex,
      wrapIv: wrapped.ivHex,
      credentialId: credential.credentialId,
      createdAt: Date.now(),
    };

    await viewerKeyStorage.saveWalletAccount(account);
    runtimeSession.set(`wallet:${account.id}`, wallet.privateKey);
    return {
      account,
      recoveryPhrase: wallet.mnemonic?.phrase || null,
      privateKey: wallet.privateKey,
    };
  }

  private async wrapWithPrfDirect(credentialId: string, secretHex: string): Promise<WrappedSecret> {
    const prfOutput = await PasskeyService.getPrfSecretDirect(credentialId, `wallet-wrap:${credentialId}`);
    if (!prfOutput) {
      throw new Error('Passkey PRF is not available for this wallet credential.');
    }

    return SecureVaultService.wrapWithPrf(secretHex, prfOutput);
  }

  async importLocalWallet(options: ImportWalletOptions): Promise<StoredWalletAccount> {
    const credential = await PasskeyService.createCredential('Imported MyBITE Wallet');
    const wrapMethod = credential.prfSupported ? 'webauthn-prf' : 'passphrase';
    if (wrapMethod === 'passphrase' && !options.passphrase) {
      throw new Error('Set a wallet passphrase because this authenticator does not support secure PRF wrapping.');
    }

    const { privateKey } = normalizeImportedSecret(options.secret);
    const wallet = new Wallet(privateKey);
    const wrapped = credential.prfSupported
      ? await this.wrapWithPrf(credential.credentialId, wallet.privateKey)
      : await SecureVaultService.wrapWithPassphrase(wallet.privateKey, options.passphrase!);

    const account: StoredWalletAccount = {
      id: crypto.randomUUID(),
      mode: 'self-custody',
      address: wallet.address,
      wrappedSecret: wrapped.ciphertextHex,
      wrapMethod,
      wrapSalt: wrapped.saltHex,
      wrapIv: wrapped.ivHex,
      credentialId: credential.credentialId,
      createdAt: Date.now(),
      backupConfirmedAt: Date.now(),
    };

    await viewerKeyStorage.saveWalletAccount(account);
    runtimeSession.set(`wallet:${account.id}`, wallet.privateKey);
    return account;
  }

  async saveProviderWallet(mode: WalletMode, address: string, providerRef: string): Promise<StoredWalletAccount> {
    const account: StoredWalletAccount = {
      id: crypto.randomUUID(),
      mode,
      address,
      providerRef,
      createdAt: Date.now(),
      backupConfirmedAt: Date.now(),
    };

    await viewerKeyStorage.saveWalletAccount(account);
    return account;
  }

  async unlockWalletAccount(accountId: string, passphrase: string): Promise<string> {
    const cached = runtimeSession.get(`wallet:${accountId}`);
    if (cached) {
      return cached;
    }

    const account = await viewerKeyStorage.getWalletAccount(accountId);
    if (!account || account.mode !== 'self-custody' || !account.wrappedSecret || !account.wrapMethod) {
      throw new Error('This wallet account cannot be unlocked locally.');
    }

    if (account.wrapMethod === 'webauthn-prf') {
      if (!account.credentialId) {
        throw new Error('This wallet is missing its passkey binding.');
      }

      const prfOutput = await PasskeyService.getPrfSecret(account.credentialId, `wallet-unlock:${account.id}`);
      if (!prfOutput) {
        throw new Error('This wallet requires passkey PRF, but the authenticator did not provide it.');
      }

      const unwrapped = await SecureVaultService.unwrapWithPrf(toWrappedSecret(account), prfOutput);
      runtimeSession.set(`wallet:${accountId}`, unwrapped);
      return unwrapped;
    }

    if (!passphrase) {
      throw new Error('A wallet passphrase is required for this account.');
    }

    const unwrapped = await SecureVaultService.unwrapWithPassphrase(toWrappedSecret(account), passphrase);
    runtimeSession.set(`wallet:${accountId}`, unwrapped);
    return unwrapped;
  }

  async confirmBackup(accountId: string): Promise<void> {
    const account = await viewerKeyStorage.getWalletAccount(accountId);
    if (!account) {
      throw new Error('Wallet account not found.');
    }

    await viewerKeyStorage.saveWalletAccount({
      ...account,
      backupConfirmedAt: Date.now(),
    });
  }

  lockWalletAccount(accountId: string): void {
    runtimeSession.clear(`wallet:${accountId}`);
  }

  async exportWalletSecret(accountId: string, passphrase: string): Promise<string> {
    return this.unlockWalletAccount(accountId, passphrase);
  }

  hasUnlockedWallet(accountId: string): boolean {
    return runtimeSession.has(`wallet:${accountId}`);
  }

  async connectExternalWallet(): Promise<{
    account: StoredWalletAccount;
    networkInfo: WalletNetworkInfo;
    balance: string | null;
  }> {
    const result = await injectedWalletService.connect();

    if (!result.success) {
      throw new Error(result.error || 'Failed to connect external wallet');
    }

    if (!result.accounts || result.accounts.length === 0) {
      throw new Error('No accounts returned from wallet');
    }

    const address = result.accounts[0];
    const chainId = result.chainId || '0x1';

    // Check if we already have this wallet stored
    const existingAccounts = await viewerKeyStorage.getWalletAccounts();
    const existingAccount = existingAccounts.find(
      (acc) => acc.mode === 'external' && acc.address.toLowerCase() === address.toLowerCase()
    );

    let account: StoredWalletAccount;

    if (existingAccount) {
      // Update the existing account
      account = {
        ...existingAccount,
        providerRef: 'injected',
      };
      await viewerKeyStorage.saveWalletAccount(account);
    } else {
      // Create new external wallet account
      account = await this.saveProviderWallet('external', address, 'injected');
    }

    // Save connection info for persistence
    await injectedWalletService.saveConnectedWallet(address, chainId);

    // Get balance
    const balance = await injectedWalletService.getBalance(address);

    return {
      account,
      networkInfo: result.networkInfo || { chainId, isSupported: false, name: 'Unknown' },
      balance,
    };
  }

  async disconnectExternalWallet(accountId: string): Promise<void> {
    const account = await viewerKeyStorage.getWalletAccount(accountId);
    if (!account) {
      throw new Error('Wallet account not found');
    }

    if (account.mode !== 'external') {
      throw new Error('Cannot disconnect a self-custody wallet');
    }

    // Remove the account from storage
    await viewerKeyStorage.deleteWalletAccount(accountId);

    // Clear saved connection info
    injectedWalletService.clearSavedWallet();
    injectedWalletService.disconnect();

    // Clear any runtime session data
    this.lockWalletAccount(accountId);
  }

  async switchExternalWalletNetwork(chainId: number): Promise<boolean> {
    return injectedWalletService.switchNetwork(chainId);
  }

  async getExternalWalletBalance(address: string): Promise<string | null> {
    return injectedWalletService.getBalance(address);
  }

  async isExternalWalletConnected(): Promise<boolean> {
    const savedInfo = injectedWalletService.getSavedWalletInfo();
    if (!savedInfo) return false;

    const connectedAccounts = await injectedWalletService.getConnectedAccounts();
    return connectedAccounts.some(
      (addr) => addr.toLowerCase() === savedInfo.address.toLowerCase()
    );
  }

  async reconnectSavedWallet(): Promise<{
    account: StoredWalletAccount;
    networkInfo: WalletNetworkInfo;
    balance: string | null;
  } | null> {
    const savedInfo = injectedWalletService.getSavedWalletInfo();
    if (!savedInfo) return null;

    // Check if wallet is still connected
    const connectedAccounts = await injectedWalletService.getConnectedAccounts();
    const isStillConnected = connectedAccounts.some(
      (addr) => addr.toLowerCase() === savedInfo.address.toLowerCase()
    );

    if (!isStillConnected) {
      injectedWalletService.clearSavedWallet();
      return null;
    }

    // Reconnect
    return this.connectExternalWallet();
  }

  setupExternalWalletEventListeners(
    onAccountsChanged: (event: { accounts: string[]; chainId: string; isConnected: boolean }) => void,
    onChainChanged: (chainId: string) => void
  ): () => void {
    const unsubscribeAccounts = injectedWalletService.onAccountsChanged((event) => {
      onAccountsChanged(event);
    });

    const unsubscribeChain = injectedWalletService.onChainChanged((chainId) => {
      onChainChanged(chainId);
    });

    // Return cleanup function
    return () => {
      unsubscribeAccounts();
      unsubscribeChain();
    };
  }

  private async wrapWithPrf(credentialId: string, secretHex: string): Promise<WrappedSecret> {
    const prfOutput = await PasskeyService.getPrfSecret(credentialId, `wallet-wrap:${credentialId}`);
    if (!prfOutput) {
      throw new Error('Passkey PRF is not available for this wallet credential.');
    }

    return SecureVaultService.wrapWithPrf(secretHex, prfOutput);
  }
}

export const walletService = new WalletService();
