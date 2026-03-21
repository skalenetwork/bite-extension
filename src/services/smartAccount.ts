import {
  createPublicClient,
  defineChain,
  http,
  type Address,
  type Hex,
} from 'viem';
import {
  createBundlerClient,
  toCoinbaseSmartAccount,
  toWebAuthnAccount,
} from 'viem/account-abstraction';
import type {
  CreateWalletOptions,
  CreatedWalletResult,
  SmartWalletAccount,
  SmartWalletProvider,
} from '../types';
import { BITE_SANDBOX_CONFIG } from './bite';
import { PasskeyService } from './passkey';

const DEFAULT_SMART_WALLET_PROVIDER: SmartWalletProvider = 'coinbase-smart-wallet';
const DEFAULT_SMART_WALLET_VERSION = '1.1';

const biteSandboxChain = defineChain({
  id: BITE_SANDBOX_CONFIG.chainId,
  name: 'BITE Sandbox',
  nativeCurrency: {
    name: 'sFUEL',
    symbol: 'sFUEL',
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: [BITE_SANDBOX_CONFIG.rpcUrl],
    },
  },
  blockExplorers: {
    default: {
      name: 'SKALE Explorer',
      url: BITE_SANDBOX_CONFIG.explorerUrl,
    },
  },
});

function getRelyingPartyId(): string {
  if (typeof window === 'undefined') {
    return 'localhost';
  }

  return window.location.hostname || 'localhost';
}

function getBundlerUrl(): string {
  return import.meta.env.EXTENSION_PUBLIC_BUNDLER_URL || BITE_SANDBOX_CONFIG.rpcUrl;
}

export class SmartAccountService {
  private createPublicClient() {
    return createPublicClient({
      chain: biteSandboxChain,
      transport: http(BITE_SANDBOX_CONFIG.rpcUrl),
    });
  }

  private async toSmartAccount(account: SmartWalletAccount) {
    const owner = toWebAuthnAccount({
      credential: {
        id: account.credentialId,
        publicKey: account.publicKeyHex,
      },
      rpId: account.rpId,
    });

    return toCoinbaseSmartAccount({
      client: this.createPublicClient(),
      owners: [owner],
      version: account.smartAccountVersion,
      address: account.address as Address,
    });
  }

  async createWallet(options: CreateWalletOptions = {}): Promise<CreatedWalletResult> {
    const credential = await PasskeyService.createCredential(options.label || 'MyBITE Wallet');
    if (!credential.publicKeyHex) {
      throw new Error('The passkey credential did not expose a public key. Create the wallet again on a supported authenticator.');
    }

    const rpId = getRelyingPartyId();
    const publicClient = this.createPublicClient();
    const owner = toWebAuthnAccount({
      credential: {
        id: credential.credentialId,
        publicKey: credential.publicKeyHex,
      },
      rpId,
    });

    const smartAccount = await toCoinbaseSmartAccount({
      client: publicClient,
      owners: [owner],
      version: DEFAULT_SMART_WALLET_VERSION,
    });

    const account: SmartWalletAccount = {
      id: crypto.randomUUID(),
      mode: 'smart-account',
      address: smartAccount.address,
      providerRef: DEFAULT_SMART_WALLET_PROVIDER,
      credentialId: credential.credentialId,
      publicKeyHex: credential.publicKeyHex,
      rpId,
      smartAccountVersion: DEFAULT_SMART_WALLET_VERSION,
      bundlerUrl: getBundlerUrl(),
      createdAt: Date.now(),
      backupConfirmedAt: Date.now(),
    };

    return {
      account,
      recoveryPhrase: null,
      privateKey: null,
    };
  }

  async authenticate(account: SmartWalletAccount): Promise<void> {
    const authenticated = await PasskeyService.authenticate(account.credentialId);
    if (!authenticated) {
      throw new Error('Passkey authentication failed.');
    }
  }

  async sendCall(
    account: SmartWalletAccount,
    request: { to: string; data: Hex; value?: string },
  ): Promise<Hex> {
    const smartAccount = await this.toSmartAccount(account);
    const bundlerClient = createBundlerClient({
      account: smartAccount,
      chain: biteSandboxChain,
      client: this.createPublicClient(),
      transport: http(account.bundlerUrl),
    });

    const userOperationHash = await bundlerClient.sendUserOperation({
      account: smartAccount,
      calls: [
        {
          to: request.to as Address,
          data: request.data,
          value: request.value ? BigInt(request.value) : 0n,
        },
      ],
    });

    const receipt = await bundlerClient.waitForUserOperationReceipt({
      hash: userOperationHash,
      timeout: 90_000,
    });

    return receipt.receipt.transactionHash;
  }
}

export const smartAccountService = new SmartAccountService();
