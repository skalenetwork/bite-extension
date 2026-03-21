import { ethers } from 'ethers';
import type { StoredWalletAccount } from '../types';
import { CONFIDENTIAL_TOKEN_ABI, BITE_SANDBOX_CONFIG } from './bite';
import { walletService } from './wallet';

export interface SignerAdapter {
  prepareSend(tokenAddress: string, to: string, amount: bigint): Promise<{ to: string; data: string; value?: string }>;
  sendTransaction(request: { to: string; data: string; value?: string }, options?: { passphrase?: string }): Promise<string>;
}

class LocalWrappedSigner implements SignerAdapter {
  constructor(private readonly account: StoredWalletAccount) {}

  async prepareSend(tokenAddress: string, to: string, amount: bigint): Promise<{ to: string; data: string }> {
    const iface = new ethers.Interface(CONFIDENTIAL_TOKEN_ABI);
    return {
      to: tokenAddress,
      data: iface.encodeFunctionData('transfer', [to, amount]),
    };
  }

  async sendTransaction(
    request: { to: string; data: string; value?: string },
    options?: { passphrase?: string },
  ): Promise<string> {
    if (!options?.passphrase) {
      throw new Error('Passphrase required to unlock local wallet.');
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

class ExternalWalletSigner implements SignerAdapter {
  constructor(private readonly account: StoredWalletAccount) {}

  async prepareSend(tokenAddress: string, to: string, amount: bigint): Promise<{ to: string; data: string }> {
    const iface = new ethers.Interface(CONFIDENTIAL_TOKEN_ABI);
    return {
      to: tokenAddress,
      data: iface.encodeFunctionData('transfer', [to, amount]),
    };
  }

  async sendTransaction(request: { to: string; data: string; value?: string }): Promise<string> {
    const ethereum = (window as Window & { ethereum?: { request: (args: unknown) => Promise<unknown> } }).ethereum;
    const accounts = (await ethereum?.request({ method: 'eth_requestAccounts' })) as string[] | undefined;
    const activeAddress = accounts?.[0];

    if (!activeAddress) {
      throw new Error('No injected wallet account is connected.');
    }

    if (activeAddress.toLowerCase() !== this.account.address.toLowerCase()) {
      throw new Error('Injected wallet account changed. Reconnect the wallet in the extension and try again.');
    }

    const txHash = await ethereum?.request({
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

  return new ExternalWalletSigner(account);
}
