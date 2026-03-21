import { Wallet } from 'ethers';
import type { WrapMethod, WrappedSecret } from '../types';
import { bytesToHex, ensure0x, hexToBytes, strip0x, toArrayBuffer, utf8ToBytes } from './encoding';

const PBKDF2_ITERATIONS = 600_000;
const HKDF_INFO = utf8ToBytes('mybite-secure-wrap');

function generateIv(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(12));
}

function generateSalt(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(16));
}

async function importPassphraseKey(passphrase: string): Promise<CryptoKey> {
    return crypto.subtle.importKey(
      'raw',
      toArrayBuffer(utf8ToBytes(passphrase)),
      { name: 'PBKDF2' },
      false,
      ['deriveKey'],
  );
}

async function derivePassphraseKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const baseKey = await importPassphraseKey(passphrase);

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      iterations: PBKDF2_ITERATIONS,
      salt: toArrayBuffer(salt),
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

async function importHkdfKey(prfOutput: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', toArrayBuffer(prfOutput), 'HKDF', false, ['deriveKey']);
}

async function derivePrfKey(prfOutput: Uint8Array, salt: Uint8Array): Promise<CryptoKey> {
  const baseKey = await importHkdfKey(prfOutput);

  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: toArrayBuffer(salt),
      info: toArrayBuffer(HKDF_INFO),
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

async function encryptSecret(secretHex: string, key: CryptoKey, salt: Uint8Array): Promise<WrappedSecret> {
  const iv = generateIv();
  const secretBytes = hexToBytes(strip0x(secretHex));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: toArrayBuffer(iv) },
    key,
    toArrayBuffer(secretBytes),
  );

  return {
    ciphertextHex: ensure0x(bytesToHex(new Uint8Array(ciphertext))),
    ivHex: ensure0x(bytesToHex(iv)),
    saltHex: ensure0x(bytesToHex(salt)),
  };
}

async function decryptSecret(wrappedSecret: WrappedSecret, key: CryptoKey): Promise<string> {
  const decrypted = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: toArrayBuffer(hexToBytes(strip0x(wrappedSecret.ivHex))),
    },
    key,
    toArrayBuffer(hexToBytes(strip0x(wrappedSecret.ciphertextHex))),
  );

  return ensure0x(bytesToHex(new Uint8Array(decrypted)));
}

export class SecureVaultService {
  static generateSecp256k1PrivateKey(): string {
    return Wallet.createRandom().privateKey;
  }

  static async wrapWithPassphrase(secretHex: string, passphrase: string): Promise<WrappedSecret> {
    const salt = generateSalt();
    const key = await derivePassphraseKey(passphrase, salt);
    return encryptSecret(secretHex, key, salt);
  }

  static async unwrapWithPassphrase(wrappedSecret: WrappedSecret, passphrase: string): Promise<string> {
    const key = await derivePassphraseKey(passphrase, hexToBytes(strip0x(wrappedSecret.saltHex)));
    return decryptSecret(wrappedSecret, key);
  }

  static async wrapWithPrf(secretHex: string, prfOutput: Uint8Array): Promise<WrappedSecret> {
    const salt = generateSalt();
    const key = await derivePrfKey(prfOutput, salt);
    return encryptSecret(secretHex, key, salt);
  }

  static async unwrapWithPrf(wrappedSecret: WrappedSecret, prfOutput: Uint8Array): Promise<string> {
    const key = await derivePrfKey(prfOutput, hexToBytes(strip0x(wrappedSecret.saltHex)));
    return decryptSecret(wrappedSecret, key);
  }

  static getWrapMethodLabel(method: WrapMethod): string {
    return method === 'webauthn-prf' ? 'Passkey PRF' : 'Passphrase';
  }
}
