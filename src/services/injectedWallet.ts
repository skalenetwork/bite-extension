import { ethers } from 'ethers';
import type { InjectedWalletInfo, WalletNetworkInfo, WalletEventCallback } from '../types';

const SUPPORTED_CHAIN_IDS = [
  0x5a79c5, // BITE Sandbox (5912551 in decimal)
];

export type InjectedWalletProvider = {
  isMetaMask?: boolean;
  isCoinbaseWallet?: boolean;
  isTrust?: boolean;
  isWalletConnect?: boolean;
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on?: (event: string, callback: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, callback: (...args: unknown[]) => void) => void;
  selectedAddress?: string;
  chainId?: string;
  networkVersion?: string;
};

type WindowWithEthereum = Window & {
  ethereum?: InjectedWalletProvider;
};

export interface ConnectionResult {
  success: boolean;
  accounts?: string[];
  chainId?: string;
  networkInfo?: WalletNetworkInfo;
  error?: string;
}

export interface AccountChangeEvent {
  accounts: string[];
  chainId: string;
  isConnected: boolean;
}

export class InjectedWalletService {
  private eventListeners = new Map<string, WalletEventCallback[]>();
  private currentProvider: InjectedWalletProvider | null = null;
  private isListening = false;

  private getProvider(): InjectedWalletProvider | null {
    if (typeof window === 'undefined') {
      console.log('[InjectedWallet] Window is undefined (server-side)');
      return null;
    }
    const win = window as WindowWithEthereum;
    const provider = win.ethereum || null;
    console.log('[InjectedWallet] Provider detection:', {
      exists: Boolean(provider),
      isMetaMask: provider?.isMetaMask,
      hasRequest: typeof provider?.request === 'function',
      hasOn: typeof provider?.on === 'function',
      selectedAddress: provider?.selectedAddress,
      chainId: provider?.chainId,
    });
    return provider;
  }

  isMetaMaskInstalled(): boolean {
    const provider = this.getProvider();
    return Boolean(provider?.isMetaMask);
  }

  isAnyWalletInstalled(): boolean {
    return Boolean(this.getProvider());
  }

  getProviderType(): string {
    const provider = this.getProvider();
    if (!provider) return 'none';
    if (provider.isMetaMask) return 'metamask';
    if (provider.isCoinbaseWallet) return 'coinbase';
    if (provider.isTrust) return 'trust';
    if (provider.isWalletConnect) return 'walletconnect';
    return 'unknown';
  }

  async connect(): Promise<ConnectionResult> {
    console.log('[InjectedWallet] Starting connection...');
    const provider = this.getProvider();

    if (!provider) {
      console.error('[InjectedWallet] No provider detected');
      return {
        success: false,
        error: 'No injected wallet detected. Please install MetaMask or another Web3 wallet.',
      };
    }

    try {
      console.log('[InjectedWallet] Calling eth_requestAccounts...');
      const accounts = await provider.request({
        method: 'eth_requestAccounts',
      }) as string[];
      console.log('[InjectedWallet] Accounts received:', accounts);

      if (!accounts || accounts.length === 0) {
        console.error('[InjectedWallet] No accounts returned');
        return {
          success: false,
          error: 'No accounts returned from wallet.',
        };
      }

      console.log('[InjectedWallet] Getting chainId...');
      const chainId = await provider.request({
        method: 'eth_chainId',
      }) as string;
      console.log('[InjectedWallet] ChainId received:', chainId);

      this.currentProvider = provider;
      console.log('[InjectedWallet] Setting up event listeners...');
      this.setupEventListeners();

      const networkInfo = await this.getNetworkInfo();
      console.log('[InjectedWallet] Network info:', networkInfo);

      return {
        success: true,
        accounts,
        chainId,
        networkInfo,
      };
    } catch (error) {
      console.error('[InjectedWallet] Connection error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        error: `Failed to connect wallet: ${errorMessage}`,
      };
    }
  }

  async getConnectedAccounts(): Promise<string[]> {
    const provider = this.getProvider();
    if (!provider) return [];

    try {
      const accounts = await provider.request({
        method: 'eth_accounts',
      }) as string[];
      return accounts || [];
    } catch {
      return [];
    }
  }

  async getChainId(): Promise<string | null> {
    const provider = this.getProvider();
    if (!provider) return null;

    try {
      return await provider.request({
        method: 'eth_chainId',
      }) as string;
    } catch {
      return null;
    }
  }

  async getNetworkInfo(): Promise<WalletNetworkInfo> {
    const provider = this.getProvider();
    const chainId = await this.getChainId();

    if (!provider || !chainId) {
      return {
        chainId: null,
        isSupported: false,
        name: 'Unknown Network',
      };
    }

    const isSupported = SUPPORTED_CHAIN_IDS.includes(parseInt(chainId, 16));

    let name = 'Unknown Network';
    switch (parseInt(chainId, 16)) {
      case 0x5a79c5:
        name = 'BITE Sandbox';
        break;
      case 1:
        name = 'Ethereum Mainnet';
        break;
      case 11155111:
        name = 'Sepolia Testnet';
        break;
      case 137:
        name = 'Polygon Mainnet';
        break;
      default:
        name = `Chain ${parseInt(chainId, 16)}`;
    }

    return {
      chainId,
      isSupported,
      name,
    };
  }

  async switchNetwork(chainId: number): Promise<boolean> {
    const provider = this.getProvider();
    if (!provider) return false;

    const chainIdHex = `0x${chainId.toString(16)}`;

    try {
      await provider.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: chainIdHex }],
      });
      return true;
    } catch (switchError) {
      const error = switchError as { code: number };

      // Chain not added error
      if (error.code === 4902) {
        // Try to add the chain
        try {
          await this.addNetwork(chainId);
          return true;
        } catch {
          return false;
        }
      }
      return false;
    }
  }

  async addNetwork(chainId: number): Promise<boolean> {
    const provider = this.getProvider();
    if (!provider) return false;

    const params = this.getNetworkParams(chainId);
    if (!params) return false;

    try {
      await provider.request({
        method: 'wallet_addEthereumChain',
        params: [params],
      });
      return true;
    } catch {
      return false;
    }
  }

  private getNetworkParams(chainId: number): unknown | null {
    const networks: Record<number, unknown> = {
      [0x5a79c5]: {
        chainId: '0x5a79c5',
        chainName: 'BITE Sandbox',
        nativeCurrency: {
          name: 'sFUEL',
          symbol: 'sFUEL',
          decimals: 18,
        },
        rpcUrls: ['https://testnet-proxy.skalenodes.com/v1/lanky-ill-funny-testnet'],
        blockExplorerUrls: ['https://lanky-ill-funny-testnet.explorer.testnet.skalenodes.com'],
      },
    };

    return networks[chainId] || null;
  }

  async getBalance(address: string): Promise<string | null> {
    const provider = this.getProvider();
    if (!provider) return null;

    try {
      const balance = await provider.request({
        method: 'eth_getBalance',
        params: [address, 'latest'],
      }) as string;

      if (!balance) return null;

      return ethers.formatEther(balance);
    } catch {
      return null;
    }
  }

  async signMessage(message: string, address?: string): Promise<string | null> {
    const provider = this.getProvider();
    if (!provider) return null;

    try {
      const accounts = await this.getConnectedAccounts();
      const fromAddress = address || accounts[0];

      if (!fromAddress) {
        throw new Error('No connected account available for signing');
      }

      const signature = await provider.request({
        method: 'personal_sign',
        params: [message, fromAddress],
      }) as string;

      return signature;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Signing failed';
      throw new Error(`Failed to sign message: ${message}`);
    }
  }

  async sendTransaction(
    txRequest: { to: string; data: string; value?: string; from?: string }
  ): Promise<string> {
    const provider = this.getProvider();
    if (!provider) {
      throw new Error('No injected wallet available');
    }

    const accounts = await this.getConnectedAccounts();
    const from = txRequest.from || accounts[0];

    if (!from) {
      throw new Error('No connected account available');
    }

    try {
      const txHash = await provider.request({
        method: 'eth_sendTransaction',
        params: [
          {
            from,
            to: txRequest.to,
            data: txRequest.data,
            value: txRequest.value,
          },
        ],
      }) as string;

      if (!txHash || typeof txHash !== 'string') {
        throw new Error('Transaction did not return a hash');
      }

      return txHash;
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Transaction failed';
      throw new Error(`Failed to send transaction: ${msg}`);
    }
  }

  onAccountsChanged(callback: (event: AccountChangeEvent) => void): () => void {
    return this.addEventListener('accountsChanged', callback as WalletEventCallback);
  }

  onChainChanged(callback: (chainId: string) => void): () => void {
    return this.addEventListener('chainChanged', callback as WalletEventCallback);
  }

  onConnect(callback: (info: { chainId: string }) => void): () => void {
    return this.addEventListener('connect', callback as WalletEventCallback);
  }

  onDisconnect(callback: (error?: Error) => void): () => void {
    return this.addEventListener('disconnect', callback as WalletEventCallback);
  }

  disconnect(): void {
    this.removeAllEventListeners();
    this.currentProvider = null;
    this.isListening = false;
  }

  private addEventListener(event: string, callback: WalletEventCallback): () => void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    this.eventListeners.get(event)!.push(callback);

    return () => {
      const callbacks = this.eventListeners.get(event);
      if (callbacks) {
        const index = callbacks.indexOf(callback);
        if (index > -1) {
          callbacks.splice(index, 1);
        }
      }
    };
  }

  private removeAllEventListeners(): void {
    console.log('[InjectedWallet] Removing all event listeners...');
    const provider = this.getProvider();
    if (!provider) {
      console.log('[InjectedWallet] No provider to remove listeners from');
      return;
    }

    // Try different cleanup methods that various providers support
    if (typeof provider.removeListener === 'function') {
      console.log('[InjectedWallet] Using removeListener method');
      try {
        provider.removeListener('accountsChanged', this.handleAccountsChanged);
        provider.removeListener('chainChanged', this.handleChainChanged);
        provider.removeListener('connect', this.handleConnect);
        provider.removeListener('disconnect', this.handleDisconnect);
      } catch (err) {
        console.warn('[InjectedWallet] Error using removeListener:', err);
      }
    }

    // Some providers (like MetaMask) have removeAllListeners
    if ('removeAllListeners' in provider && typeof (provider as unknown as { removeAllListeners: (event?: string) => void }).removeAllListeners === 'function') {
      console.log('[InjectedWallet] Using removeAllListeners method');
      try {
        (provider as unknown as { removeAllListeners: (event?: string) => void }).removeAllListeners('accountsChanged');
        (provider as unknown as { removeAllListeners: (event?: string) => void }).removeAllListeners('chainChanged');
        (provider as unknown as { removeAllListeners: (event?: string) => void }).removeAllListeners('connect');
        (provider as unknown as { removeAllListeners: (event?: string) => void }).removeAllListeners('disconnect');
      } catch (err) {
        console.warn('[InjectedWallet] Error using removeAllListeners:', err);
      }
    }

    this.eventListeners.clear();
    console.log('[InjectedWallet] Event listeners cleared');
  }

  private setupEventListeners(): void {
    if (this.isListening) {
      console.log('[InjectedWallet] Already listening, skipping setup');
      return;
    }

    const provider = this.getProvider();
    if (!provider?.on) {
      console.error('[InjectedWallet] Provider does not support event listeners');
      return;
    }

    console.log('[InjectedWallet] Setting up event listeners for accountsChanged, chainChanged, connect, disconnect');
    
    // Use arrow functions to maintain 'this' context
    provider.on('accountsChanged', (accounts: unknown) => {
      console.log('[InjectedWallet] accountsChanged event:', accounts);
      this.handleAccountsChanged(accounts);
    });
    
    provider.on('chainChanged', (chainId: unknown) => {
      console.log('[InjectedWallet] chainChanged event:', chainId);
      this.handleChainChanged(chainId);
    });
    
    provider.on('connect', (info: unknown) => {
      console.log('[InjectedWallet] connect event:', info);
      this.handleConnect(info);
    });
    
    provider.on('disconnect', (error: unknown) => {
      console.log('[InjectedWallet] disconnect event:', error);
      this.handleDisconnect(error);
    });

    this.isListening = true;
    console.log('[InjectedWallet] Event listeners setup complete');
  }

  private handleAccountsChanged = (accounts: unknown) => {
    const accountsArray = Array.isArray(accounts) ? accounts as string[] : [];
    const event: AccountChangeEvent = {
      accounts: accountsArray,
      chainId: this.currentProvider?.chainId || '0x1',
      isConnected: accountsArray.length > 0,
    };

    this.notifyListeners('accountsChanged', event);
  };

  private handleChainChanged = (chainId: unknown) => {
    const chainIdStr = typeof chainId === 'string' ? chainId : '0x1';
    this.notifyListeners('chainChanged', chainIdStr);
  };

  private handleConnect = (info: unknown) => {
    const connectInfo = info as { chainId: string };
    this.notifyListeners('connect', connectInfo);
  };

  private handleDisconnect = (error: unknown) => {
    this.notifyListeners('disconnect', error as Error);
  };

  private notifyListeners(event: string, data: unknown): void {
    const callbacks = this.eventListeners.get(event);
    if (!callbacks) return;

    callbacks.forEach((callback) => {
      try {
        callback(data);
      } catch {
        // Silent fail for listener errors
      }
    });
  }

  async verifyViewerKeyOwnership(
    viewerKeyId: string,
    viewerPublicKey: string
  ): Promise<{ signature: string; message: string } | null> {
    const message = this.createViewerKeyMessage(viewerKeyId, viewerPublicKey);

    try {
      const signature = await this.signMessage(message);
      if (!signature) return null;

      return { signature, message };
    } catch {
      return null;
    }
  }

  createViewerKeyMessage(keyId: string, publicKey: string): string {
    const timestamp = Date.now();
    const domain = typeof window !== 'undefined' ? window.location.origin : 'MyBITE';

    return [
      'MyBITE Wallet - Viewer Key Verification',
      '',
      'This message proves ownership of a viewer key.',
      '',
      `Domain: ${domain}`,
      `Key ID: ${keyId}`,
      `Public Key: ${publicKey}`,
      `Timestamp: ${timestamp}`,
      '',
      'By signing this message, you confirm this viewer key belongs to your wallet.',
    ].join('\n');
  }

  async recoverAddressFromSignature(message: string, signature: string): Promise<string | null> {
    try {
      return ethers.verifyMessage(message, signature);
    } catch {
      return null;
    }
  }

  async saveConnectedWallet(address: string, chainId: string): Promise<void> {
    const walletInfo: InjectedWalletInfo = {
      address,
      chainId: parseInt(chainId, 16),
      isConnected: true,
      provider: this.getProviderType(),
    };

    // Save to local storage for persistence
    localStorage.setItem('mybite-connected-wallet', JSON.stringify(walletInfo));
  }

  getSavedWalletInfo(): InjectedWalletInfo | null {
    try {
      const saved = localStorage.getItem('mybite-connected-wallet');
      if (!saved) return null;
      return JSON.parse(saved) as InjectedWalletInfo;
    } catch {
      return null;
    }
  }

  clearSavedWallet(): void {
    localStorage.removeItem('mybite-connected-wallet');
  }
}

export const injectedWalletService = new InjectedWalletService();
