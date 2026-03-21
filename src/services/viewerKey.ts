import type {
  CreateViewerKeyOptions,
  StoredViewerKey,
  ViewerKeyUnlockOptions,
  WrappedSecret,
} from '../types';
import { viewerKeyStorage } from '../storage/viewerKeys';
import { CryptoService } from './crypto';
import { PasskeyService } from './passkey';
import { runtimeSession } from './runtimeSession';
import { SecureVaultService } from './secureVault';

function toWrappedSecret(record: StoredViewerKey): WrappedSecret {
  return {
    ciphertextHex: record.wrappedPrivateKey,
    saltHex: record.wrapSalt,
    ivHex: record.wrapIv,
  };
}

export class ViewerKeyService {
  async createViewerKey(options: CreateViewerKeyOptions): Promise<StoredViewerKey> {
    const credential = await PasskeyService.createCredential(options.label);
    const privateKeyHex = SecureVaultService.generateSecp256k1PrivateKey();
    const publicKeyHex = CryptoService.derivePublicKeyFromPrivate(privateKeyHex);
    const wrapMethod = credential.prfSupported ? 'webauthn-prf' : 'passphrase';

    if (wrapMethod === 'passphrase' && !options.passphrase) {
      throw new Error('This device does not support secure passkey PRF. Set a passphrase to protect the viewer key.');
    }

    const wrapped = credential.prfSupported
      ? await this.wrapWithPrf(credential.credentialId, privateKeyHex)
      : await SecureVaultService.wrapWithPassphrase(privateKeyHex, options.passphrase!);

    const key: StoredViewerKey = {
      id: credential.credentialId,
      label: options.label || 'Viewer Key',
      credentialId: credential.credentialId,
      publicKeyHex,
      wrappedPrivateKey: wrapped.ciphertextHex,
      wrapMethod,
      wrapSalt: wrapped.saltHex,
      wrapIv: wrapped.ivHex,
      createdAt: Date.now(),
      migrationState: 'complete',
    };

    await viewerKeyStorage.saveKey(key);
    return key;
  }

  async migrateLegacyKey(key: StoredViewerKey, options: ViewerKeyUnlockOptions): Promise<StoredViewerKey> {
    if (!key.privateKeyHex) {
      return key;
    }

    const prfOutput = await PasskeyService.getPrfSecret(key.credentialId, `viewer-migrate:${key.id}`);
    const wrapMethod = prfOutput ? 'webauthn-prf' : 'passphrase';

    if (wrapMethod === 'passphrase' && !options.passphrase) {
      throw new Error('This legacy key needs a passphrase before it can be migrated securely.');
    }

    const wrapped = prfOutput
      ? await SecureVaultService.wrapWithPrf(key.privateKeyHex, prfOutput)
      : await SecureVaultService.wrapWithPassphrase(key.privateKeyHex, options.passphrase!);

    const migrated: StoredViewerKey = {
      ...key,
      wrappedPrivateKey: wrapped.ciphertextHex,
      wrapMethod,
      wrapSalt: wrapped.saltHex,
      wrapIv: wrapped.ivHex,
      migrationState: 'complete',
      privateKeyHex: undefined,
    };

    await viewerKeyStorage.saveKey(migrated);
    return migrated;
  }

  async unlockViewerKey(keyId: string, options: ViewerKeyUnlockOptions = {}): Promise<string> {
    const cached = runtimeSession.get(`viewer:${keyId}`);
    if (cached) {
      return cached;
    }

    let key = await viewerKeyStorage.getKey(keyId);
    if (!key) {
      throw new Error('Viewer key not found.');
    }

    if (key.privateKeyHex || key.migrationState === 'required') {
      key = await this.migrateLegacyKey(
        {
          ...key,
          migrationState: 'required',
        },
        options,
      );
    }

    const unwrapped = await this.unwrapStoredViewerKey(key, options);
    runtimeSession.set(`viewer:${keyId}`, unwrapped);
    return unwrapped;
  }

  hasUnlockedKey(keyId: string): boolean {
    return runtimeSession.has(`viewer:${keyId}`);
  }

  lockViewerKey(keyId: string): void {
    runtimeSession.clear(`viewer:${keyId}`);
  }

  private async wrapWithPrf(credentialId: string, privateKeyHex: string): Promise<WrappedSecret> {
    const prfOutput = await PasskeyService.getPrfSecret(credentialId, `viewer-wrap:${credentialId}`);
    if (!prfOutput) {
      throw new Error('Passkey PRF is not available for this credential.');
    }

    return SecureVaultService.wrapWithPrf(privateKeyHex, prfOutput);
  }

  private async unwrapStoredViewerKey(
    key: StoredViewerKey,
    options: ViewerKeyUnlockOptions,
  ): Promise<string> {
    const wrapped = toWrappedSecret(key);

    if (key.wrapMethod === 'webauthn-prf') {
      const prfOutput = await PasskeyService.getPrfSecret(key.credentialId, `viewer-unlock:${key.id}`);
      if (!prfOutput) {
        throw new Error('This viewer key requires passkey PRF, but the authenticator did not provide it.');
      }

      return SecureVaultService.unwrapWithPrf(wrapped, prfOutput);
    }

    const authenticated = await PasskeyService.authenticate(key.credentialId);
    if (!authenticated) {
      throw new Error('Passkey authentication failed.');
    }

    if (!options.passphrase) {
      throw new Error('A passphrase is required to unlock this viewer key.');
    }

    return SecureVaultService.unwrapWithPassphrase(wrapped, options.passphrase);
  }
}

export const viewerKeyService = new ViewerKeyService();
