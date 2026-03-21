import { ethers } from 'ethers';
import type {
  SelfCustodyWalletAccount,
  SmartWalletAccount,
  StoredWalletAccount,
} from '../types';
import { CONFIDENTIAL_TOKEN_ABI, BITE_SANDBOX_CONFIG } from './bite';
import { smartAccountService } from './smartAccount';
import { walletService } from './wallet';

export interface SignerAdapter {
  prepareSend(tokenAddress: string, to: string, amount: bigint): Promise<{ to: string; data: `0x${string}`; value?: string }>;
  sendTransaction(request: { to: string; data: `0x${string}`; value?: string }, options?: { passphrase?: string }): Promise<string>;
}

function encodeTransfer(tokenAddress: string, to: string, amount: bigint): { to: string; data: `0x${string}` } {
  const iface = new ethers.Interface(CONFIDENTIAL_TOKEN_ABI);
  return {
    to: tokenAddress,
    data: iface.encodeFunctionData('transfer', [to, amount]) as `0x${string}`,
  };
}

class LocalWrappedSigner implements SignerAdapter {
  constructor(private readonly account: SelfCustodyWalletAccount) {}

  async prepareSend(tokenAddress: string, to: string, amount: bigint): Promise<{ to: string; data: `0x${string}` }> {
    return encodeTransfer(tokenAddress, to, amount);
  }

  async sendTransaction(
    request: { to: string; data: `0x${string}`; value?: string },
    options?: { passphrase?: string },
  ): Promise<string> {
    if (!options?.passphrase) {
      throw new Error('Passphrase required to unlock imported wallet.');
    }

    const privateKey = await walletService.unlockWalletAccount(this.account.id, options.passphrase);
    const provider = new ethers.JsonRpcProvider(BITE_SANDBOX_CONFIG.rpcUrl);
    const signer = new ethers.Wallet(privateKey, provider);
    const tx = await signer.sendTransaction({
      to: request.to,
      data: request.data,
      value: request.value ? BigInt(request.value) : undefined,
    });

    return tx.hash;
  }
}

class SmartAccountSigner implements SignerAdapter {
  constructor(private readonly account: SmartWalletAccount) {}

  async prepareSend(tokenAddress: string, to: string, amount: bigint): Promise<{ to: string; data: `0x${string}` }> {
    return encodeTransfer(tokenAddress, to, amount);
  }

  async sendTransaction(
    request: { to: string; data: `0x${string}`; value?: string },
  ): Promise<string> {
    const txHash = await smartAccountService.sendCall(this.account, request);
    return txHash;
  }
}

class ExternalWalletSigner implements SignerAdapter {
  constructor(private readonly account: StoredWalletAccount) {}

  async prepareSend(tokenAddress: string, to: string, amount: bigint): Promise<{ to: string; data: `0x${string}` }> {
    return encodeTransfer(tokenAddress, to, amount);
  }

  async sendTransaction(request: { to: string; data: `0x${string}`; value?: string }): Promise<string> {
    const ethereum = window.ethereum;
    const accounts = await ethereum?.request<string[]>({ method: 'eth_requestAccounts' });
    const activeAddress = accounts?.[0];

    if (!activeAddress) {
      throw new Error('No injected wallet account is connected.');
    }

    if (activeAddress.toLowerCase() !== this.account.address.toLowerCase()) {
      throw new Error('Injected wallet account changed. Reconnect the wallet in the extension and try again.');
    }

    const txHash = await ethereum?.request<string>({
      method: 'eth_sendTransaction',
      params: [
        {
          from: activeAddress,
          to: request.to,
          data: request.data,
          value: request.value,
        },
      ],
    });

    if (!txHash || typeof txHash !== 'string') {
      throw new Error('Injected wallet did not return a transaction hash.');
    }

    return txHash;
  }
}

export function createSignerAdapter(account: StoredWalletAccount | null): SignerAdapter | null {
  if (!account) return null;

  if (account.mode === 'self-custody') {
    return new LocalWrappedSigner(account);
  }

  if (account.mode === 'smart-account') {
    return new SmartAccountSigner(account);
  }

  return new ExternalWalletSigner(account);
}
