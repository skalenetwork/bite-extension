/**
 * Crypto service for secp256k1 operations in browser
 * Uses elliptic library for secp256k1, WebCrypto for AES
 * Pure browser APIs - no Node.js Buffer dependency
 */

import { ec as EllipticCurve } from 'elliptic';
import { keccak256, toBeArray, hexlify } from 'ethers';

const EC = new EllipticCurve('secp256k1');

// Helper: Convert hex string to Uint8Array
function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < clean.length; i += 2) {
    bytes[i / 2] = parseInt(clean.slice(i, i + 2), 16);
  }
  return bytes;
}

// Helper: Convert Uint8Array to hex string
function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

export class CryptoService {
  /**
   * Derive a secp256k1 private key from a WebAuthn signature
   * Uses deterministic derivation: privateKey = keccak256(signature[0:32])
   */
  static derivePrivateKeyFromSignature(signature: Uint8Array): string {
    // Take first 32 bytes of signature
    const seed = signature.slice(0, 32);
    
    // Keccak256 hash using ethers.js (browser compatible)
    // ethers.keccak256 accepts hex string, so convert bytes to hex first
    const seedHex = '0x' + bytesToHex(seed);
    const privateKeyHex = keccak256(seedHex);
    
    return privateKeyHex;
  }

  /**
   * Derive public key from private key using secp256k1
   * Returns uncompressed public key (65 bytes, hex string with 0x prefix)
   */
  static derivePublicKeyFromPrivate(privateKeyHex: string): string {
    const privateKey = privateKeyHex.startsWith('0x') 
      ? privateKeyHex.slice(2) 
      : privateKeyHex;
    
    const keyPair = EC.keyFromPrivate(privateKey, 'hex');
    const publicKey = keyPair.getPublic();
    
    // Uncompressed format: 0x04 + X(32 bytes) + Y(32 bytes)
    const x = publicKey.getX().toString('hex').padStart(64, '0');
    const y = publicKey.getY().toString('hex').padStart(64, '0');
    
    return '0x04' + x + y;
  }

  /**
   * Generate random secp256k1 key pair
   */
  static generateKeyPair(): { privateKey: string; publicKey: string } {
    const keyPair = EC.genKeyPair();
    const privateKey = keyPair.getPrivate('hex').padStart(64, '0');
    const publicKey = this.derivePublicKeyFromPrivate(privateKey);
    
    return {
      privateKey: '0x' + privateKey,
      publicKey,
    };
  }

  /**
   * Decrypt confidential token balance using ECIES
   * Format: IV(16 bytes) + ephemeralPubKey(33 bytes compressed) + ciphertext
   */
  static async decryptBalance(
    privateKeyHex: string,
    encryptedDataHex: string
  ): Promise<bigint> {
    // Remove 0x prefix and convert to bytes
    const cleanEncryptedData = encryptedDataHex.startsWith('0x')
      ? encryptedDataHex.slice(2)
      : encryptedDataHex;
    
    const encryptedBytes = hexToBytes(cleanEncryptedData);

    // Extract components
    const iv = encryptedBytes.slice(0, 16);
    const ephemeralPublicKey = encryptedBytes.slice(16, 16 + 33);
    const ciphertext = encryptedBytes.slice(16 + 33);

    // Derive shared secret using ECDH
    const sharedSecret = this.computeSharedSecret(
      privateKeyHex,
      ephemeralPublicKey
    );

    // Derive AES key: SHA-256(sharedSecret)
    const aesKey = await this.deriveAESKey(sharedSecret);

    // Decrypt using WebCrypto AES-256-CBC
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      aesKey,
      { name: 'AES-CBC', length: 256 },
      false,
      ['decrypt']
    );

    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-CBC', iv },
      cryptoKey,
      ciphertext
    );

    // Convert to BigInt
    const hexString = '0x' + bytesToHex(new Uint8Array(decrypted));
    return BigInt(hexString);
  }

  /**
   * Compute ECDH shared secret using secp256k1
   */
  private static computeSharedSecret(
    privateKeyHex: string,
    ephemeralPublicKey: Uint8Array
  ): Uint8Array {
    const privateKey = privateKeyHex.startsWith('0x') 
      ? privateKeyHex.slice(2) 
      : privateKeyHex;
    
    const keyPair = EC.keyFromPrivate(privateKey, 'hex');
    const ephemeralPoint = EC.keyFromPublic(bytesToHex(ephemeralPublicKey), 'hex');
    
    const shared = keyPair.derive(ephemeralPoint.getPublic());
    // Convert to 32-byte array
    let sharedHex = shared.toString(16);
    if (sharedHex.length < 64) {
      sharedHex = sharedHex.padStart(64, '0');
    }
    return hexToBytes(sharedHex);
  }

  /**
   * Derive AES key from shared secret using SHA-256
   */
  private static async deriveAESKey(sharedSecret: Uint8Array): Promise<Uint8Array> {
    const hashBuffer = await crypto.subtle.digest('SHA-256', sharedSecret);
    return new Uint8Array(hashBuffer);
  }
}
