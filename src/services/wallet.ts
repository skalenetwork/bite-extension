import { HDNodeWallet, Wallet } from 'ethers';
import type {
  CreateWalletOptions,
  CreatedWalletResult,
  ExternalWalletAccount,
  ImportWalletOptions,
  SelfCustodyWalletAccount,
  StoredWalletAccount,
  WalletNetworkInfo,
  WrappedSecret,
} from '../types';
import { viewerKeyStorage } from '../storage/viewerKeys';
import { runtimeSession } from './runtimeSession';
import { SecureVaultService } from './secureVault';
import { injectedWalletService } from './injectedWallet';
import { PasskeyService } from './passkey';
import { smartAccountService } from './smartAccount';

function toWrappedSecret(account: SelfCustodyWalletAccount): WrappedSecret {
  return {
    ciphertextHex: account.wrappedSecret,
    saltHex: account.wrapSalt,
    ivHex: account.wrapIv,
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

function isSelfCustodyWallet(account: StoredWalletAccount): account is SelfCustodyWalletAccount {
  return account.mode === 'self-custody';
}

export class WalletService {
  async createLocalWallet(options: CreateWalletOptions = {}): Promise<CreatedWalletResult> {
    const result = await smartAccountService.createWallet(options);
    await viewerKeyStorage.saveWalletAccount(result.account);
    runtimeSession.set(`wallet:${result.account.id}`, 'ready');
    return result;
  }

  async createLocalWalletDirect(label?: string): Promise<CreatedWalletResult> {
    return this.createLocalWallet({ label });
  }

  async importLocalWallet(options: ImportWalletOptions): Promise<SelfCustodyWalletAccount> {
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

    const account: SelfCustodyWalletAccount = {
      id: crypto.randomUUID(),
      mode: 'self-custody',
      address: wallet.address,
      wrappedSecret: wrapped.ciphertextHex,
      wrapMethod,
      wrapSalt: wrapped.saltHex,
      wrapIv: wrapped.ivHex,
      credentialId: credential.credentialId,
      providerRef: 'local',
      createdAt: Date.now(),
      backupConfirmedAt: Date.now(),
    };

    await viewerKeyStorage.saveWalletAccount(account);
    runtimeSession.set(`wallet:${account.id}`, wallet.privateKey);
    return account;
  }

  async saveProviderWallet(mode: 'external', address: string, providerRef: string): Promise<ExternalWalletAccount> {
    const account: ExternalWalletAccount = {
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
    if (!account) {
      throw new Error('Wallet account not found.');
    }

    if (account.mode === 'smart-account') {
      await smartAccountService.authenticate(account);
      runtimeSession.set(`wallet:${account.id}`, account.address);
      return account.address;
    }

    if (!isSelfCustodyWallet(account)) {
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
    const account = await viewerKeyStorage.getWalletAccount(accountId);
    if (!account) {
      throw new Error('Wallet account not found.');
    }

    if (!isSelfCustodyWallet(account)) {
      throw new Error('This wallet does not have an exportable private key in MyBITE.');
    }

    return this.unlockWalletAccount(accountId, passphrase);
  }

  hasUnlockedWallet(accountId: string): boolean {
    return runtimeSession.has(`wallet:${accountId}`);
  }

  async connectExternalWallet(): Promise<{
    account: ExternalWalletAccount;
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

    const existingAccounts = await viewerKeyStorage.getWalletAccounts();
    const existingAccount = existingAccounts.find(
      (account): account is ExternalWalletAccount =>
        account.mode === 'external' && account.address.toLowerCase() === address.toLowerCase(),
    );

    let account: ExternalWalletAccount;

    if (existingAccount) {
      account = {
        ...existingAccount,
        providerRef: 'injected',
      };
      await viewerKeyStorage.saveWalletAccount(account);
    } else {
      account = await this.saveProviderWallet('external', address, 'injected');
    }

    await injectedWalletService.saveConnectedWallet(address, chainId);
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
      throw new Error('Cannot disconnect a local wallet');
    }

    await viewerKeyStorage.deleteWalletAccount(accountId);
    injectedWalletService.clearSavedWallet();
    injectedWalletService.disconnect();
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
      (address) => address.toLowerCase() === savedInfo.address.toLowerCase(),
    );
  }

  async reconnectSavedWallet(): Promise<{
    account: ExternalWalletAccount;
    networkInfo: WalletNetworkInfo;
    balance: string | null;
  } | null> {
    const savedInfo = injectedWalletService.getSavedWalletInfo();
    if (!savedInfo) return null;

    const connectedAccounts = await injectedWalletService.getConnectedAccounts();
    const isStillConnected = connectedAccounts.some(
      (address) => address.toLowerCase() === savedInfo.address.toLowerCase(),
    );

    if (!isStillConnected) {
      injectedWalletService.clearSavedWallet();
      return null;
    }

    return this.connectExternalWallet();
  }

  setupExternalWalletEventListeners(
    onAccountsChanged: (event: { accounts: string[]; chainId: string; isConnected: boolean }) => void,
    onChainChanged: (chainId: string) => void,
  ): () => void {
    const unsubscribeAccounts = injectedWalletService.onAccountsChanged((event) => {
      onAccountsChanged(event);
    });

    const unsubscribeChain = injectedWalletService.onChainChanged((chainId) => {
      onChainChanged(chainId);
    });

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
